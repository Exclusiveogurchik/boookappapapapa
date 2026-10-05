import type { TextBlock } from '../db/types';

/**
 * Превращение «сырых» textItem'ов pdf.js в осмысленные блоки книги:
 * строки → склейка переносов/дефисов → абзацы → заголовки.
 *
 * Алгоритм:
 *  1. Кластеризация элементов в строки по координате Y (baseline).
 *  2. Сборка текста строки с учётом горизонтальных зазоров.
 *  3. Склейка переносов: «сло-\nво» → «слово», мягкий перенос строки внутри
 *     абзаца → пробел; конец предложения / отступ → новый абзац.
 *  4. Заголовки: высота шрифта заметно выше медианной + жирность + короткая строка.
 */

export interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

interface Line {
  text: string;
  x: number;
  y: number;
  right: number;
  fontSize: number;
  bold: boolean;
}

const sentenceEnd = /[.!?…:;»"')\]]$/;

/** Элементы → строки (кластеризация по Y с допуском ~0.45 кегля). */
function clusterLines(items: RawItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  let cur: RawItem[] = [];
  let curY = 0;

  const flush = () => {
    if (!cur.length) return;
    cur.sort((a, b) => a.x - b.x);
    const fontSize = Math.max(...cur.map((i) => i.height));
    let text = '';
    let prevRight = 0;
    for (const it of cur) {
      // Зазор между словами: pdf.js отдаёт их раздельными элементами
      const gap = it.x - prevRight;
      if (text && gap > Math.max(2, fontSize * 0.22) && !text.endsWith(' ') && !it.str.startsWith(' ')) {
        text += ' ';
      }
      text += it.str;
      prevRight = it.x + it.width;
    }
    lines.push({
      text: text.replace(/\s+/g, ' ').trim(),
      x: Math.min(...cur.map((i) => i.x)),
      y: curY,
      right: Math.max(...cur.map((i) => i.x + i.width)),
      fontSize,
      bold: cur.some((i) => /bold|black|heavy/i.test(i.fontName)),
    });
    cur = [];
  };

  for (const it of sorted) {
    if (!it.str.trim()) continue;
    const h = it.height || 10;
    if (cur.length && Math.abs(it.y - curY) > h * 0.45) {
      flush();
    }
    cur.push(it);
    curY = cur.length === 1 ? it.y : curY;
  }
  flush();
  return lines.filter((l) => l.text.length > 0);
}

/** Медианный кегль — «тело» текста книги. */
function medianBodySize(lines: Line[]): number {
  if (!lines.length) return 12;
  const weights: number[] = [];
  for (const l of lines) {
    // Взвешиваем по длине: кегль основного текста доминирует
    const n = Math.min(Math.max(Math.round(l.text.length / 20), 1), 20);
    for (let i = 0; i < n; i++) weights.push(l.fontSize);
  }
  weights.sort((a, b) => a - b);
  return weights[Math.floor(weights.length / 2)];
}

/**
 * Склейка строк в блоки (абзацы/заголовки).
 * indentRatio — «ширина» самой длинной строки (для оценки отступов).
 */
export function buildBlocks(items: RawItem[], pageIndex: number): TextBlock[] {
  const lines = clusterLines(items);
  if (!lines.length) return [];

  const bodySize = medianBodySize(lines);
  const pageWidth = Math.max(...lines.map((l) => l.right)) || 100;
  const maxFontSize = Math.max(...lines.map((l) => l.fontSize));

  interface Pending {
    type: TextBlock['type'];
    parts: string[];
  }
  const pendings: Pending[] = [];
  let cur: Pending | null = null;

  const push = () => {
    if (cur && cur.parts.length) pendings.push(cur);
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const sizeRatio = line.fontSize / bodySize;
    const shortLine = line.right - line.x < pageWidth * 0.62;

    // --- Определяем тип строки ---
    let type: TextBlock['type'] | null = null;
    if (sizeRatio >= 1.12) {
      if (sizeRatio >= Math.max(1.35, maxFontSize / bodySize * 0.92)) type = 'h1';
      else if (sizeRatio >= 1.2) type = 'h2';
      else type = 'h3';
    } else if (line.bold && shortLine && line.text.length < 70 && sizeRatio >= 1.02) {
      type = 'h3';
    }

    if (type) {
      push();
      pendings.push({ type, parts: [line.text] });
      continue;
    }

    // --- Обычная строка: решаем, продолжает ли абзац ---
    const endsSentence = sentenceEnd.test(line.text);
    const indent = line.x - Math.min(...lines.map((l) => l.x)) > bodySize * 1.2;
    const nextIsBody = next && next.fontSize / bodySize < 1.12;
    const nextStartsLower = next ? /^[a-zа-яё]/.test(next.text) : false;

    // Дефис в конце: склеиваем со следующей строкой без пробела
    const hyphenBreak = /[A-Za-zА-Яа-яЁё]-$/.test(line.text);

    if (!cur) cur = { type: 'p', parts: [] };

    if (hyphenBreak && nextStartsLower) {
      cur.parts.push(line.text.slice(0, -1));
      continue;
    }

    cur.parts.push(line.text);

    const sameParagraph =
      nextIsBody &&
      !endsSentence &&
      !indent &&
      nextStartsLower &&
      !cur.parts[cur.parts.length - 1].endsWith('-');

    if (!sameParagraph) push();
  }
  push();

  // Сборка блоков с символьными смещениями (якоря для выделений)
  const blocks: TextBlock[] = [];
  let offset = 0;
  for (const p of pendings) {
    // Мягкие переносы внутри абзаца склеиваем через пробел
    const text = p.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    blocks.push({ type: p.type, text, start: offset, end: offset + text.length });
    offset += text.length + 1;
  }
  return blocks;
}

export function blocksToPlainText(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join('\n');
}

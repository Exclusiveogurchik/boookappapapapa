import type { PageText, TextBlock } from '../../db/types';

/** Элемент оглавления: из outline PDF или автоопределённый по заголовкам. */
export interface TocItem {
  title: string;
  pageIndex: number;
  level: number;
}

/**
 * Автоопределение глав: заголовки h1/h2 из обработанного текста.
 * h1 — глава, h2 — подглава. Если заголовков нет — генерируем главы
 * по 20 страниц, чтобы навигация работала всегда.
 */
export function buildAutoToc(pages: PageText[], pageCount: number): TocItem[] {
  const items: TocItem[] = [];
  for (const p of pages) {
    for (const b of p.blocks) {
      if (b.type === 'h1' || b.type === 'h2') {
        items.push({
          title: b.text.length > 80 ? b.text.slice(0, 77) + '…' : b.text,
          pageIndex: p.pageIndex,
          level: b.type === 'h1' ? 0 : 1,
        });
      }
    }
  }
  if (items.length >= 2) return items;

  // Фолбэк: равномерные главы
  const fallback: TocItem[] = [];
  for (let p = 0; p < pageCount; p += 20) {
    fallback.push({ title: `Глава ${fallback.length + 1}`, pageIndex: p, level: 0 });
  }
  return fallback;
}

/** Глава, которой принадлежит страница (для «~N мин до конца главы»). */
export function chapterForPage(toc: TocItem[], pageIndex: number): { item: TocItem; endPage: number } | null {
  if (!toc.length) return null;
  let idx = 0;
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].pageIndex <= pageIndex) idx = i;
    else break;
  }
  const nextStart = toc[idx + 1]?.pageIndex ?? Infinity;
  return { item: toc[idx], endPage: nextStart };
}

/** Суммарное число слов на страницах диапазона (для оценки времени). */
export function wordsInPages(pages: PageText[], from: number, to: number): number {
  let n = 0;
  for (const p of pages) {
    if (p.pageIndex >= from && p.pageIndex < to) {
      n += p.plainText.trim() ? p.plainText.trim().split(/\s+/).length : 0;
    }
  }
  return n;
}

/** Текущая «глава» для ИИ-саммари: первые ~2500 символов главы. */
export function chapterText(pages: PageText[], from: number, to: number, limit = 2500): string {
  const parts: string[] = [];
  let len = 0;
  for (const p of pages) {
    if (p.pageIndex >= from && p.pageIndex < to) {
      parts.push(p.plainText);
      len += p.plainText.length;
      if (len > limit) break;
    }
  }
  return parts.join('\n').slice(0, limit);
}

export type { TextBlock };

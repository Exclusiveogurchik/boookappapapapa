import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Highlight, PageText } from '../../db/types';

/**
 * Reflow-режим: текст из PDF превращён в блоки (абзацы/заголовки) и
 * отображается как в электронной книге.
 *
 * Особенности:
 *  — ленивая отрисовка страниц (порциями), чтобы большие книги не тормозили;
 *  — два режима: вертикальная прокрутка и постраничный (CSS multicol + анимация);
 *  — подсветки: выделения пользователя, совпадения поиска, текущее слово TTS;
 *  — «линейка чтения»: маски сверху/снизу приглушают всё, кроме текущей строки.
 */

export interface TextSelection {
  text: string;
  pageIndex: number;
  charStart: number;
  charEnd: number;
  rect: DOMRect;
}

export interface SearchHit {
  pageIndex: number;
  charStart: number;
  charEnd: number;
}

interface Mark {
  start: number;
  end: number;
  kind: 'highlight' | 'search' | 'tts';
  color?: string;
  current?: boolean;
}

/** Разбивает текст блока на сегменты с учётом перекрывающихся подсветок. */
function renderWithMarks(text: string, base: number, marks: Mark[]): React.ReactNode {
  if (!marks.length) return text;
  // Точки разрезов
  const points = new Set<number>([0, text.length]);
  for (const m of marks) {
    points.add(Math.max(0, m.start - base));
    points.add(Math.min(text.length, m.end - base));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const seg = text.slice(s, e);
    // Приоритет: tts > search > highlight
    const abs = base + s;
    const m =
      marks.find((x) => x.kind === 'tts' && abs >= x.start && abs < x.end) ??
      marks.find((x) => x.kind === 'search' && abs >= x.start && abs < x.end) ??
      marks.find((x) => x.kind === 'highlight' && abs >= x.start && abs < x.end);
    if (m) {
      if (m.kind === 'highlight') {
        out.push(
          <mark key={i} data-color={m.color}>
            {seg}
          </mark>,
        );
      } else if (m.kind === 'search') {
        out.push(
          <span key={i} className={m.current ? 'search-hit current' : 'search-hit'}>
            {seg}
          </span>,
        );
      } else {
        out.push(
          <span key={i} className="tts-word">
            {seg}
          </span>,
        );
      }
    } else {
      out.push(seg);
    }
  }
  return out;
}

const CHUNK = 15; // страниц в одной порции отрисовки

export function ReflowView({
  pages,
  settings,
  highlights,
  searchHits,
  currentHitIndex,
  ttsWord,
  rulerEnabled,
  initialPage,
  initialScrollRatio,
  onPageChange,
  onSelection,
  onWordLookup,
}: {
  pages: PageText[];
  settings: AppSettings;
  highlights: Highlight[];
  searchHits: SearchHit[];
  currentHitIndex: number;
  ttsWord: { blockId: string; start: number; end: number } | null;
  rulerEnabled: boolean;
  initialPage: number;
  initialScrollRatio: number;
  onPageChange: (pageIndex: number, scrollRatio: number) => void;
  onSelection: (sel: TextSelection) => void;
  onWordLookup: (word: string, rect: DOMRect) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [renderedCount, setRenderedCount] = useState(() => Math.min(pages.length, Math.max(CHUNK, initialPage + 2)));
  const [screenPage, setScreenPage] = useState(0);
  const [totalScreens, setTotalScreens] = useState(1);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);
  const restored = useRef(false);
  const rulerY = useRef<number | null>(null);
  const [, forceRuler] = useState(0);

  const pagination = settings.pagination;
  const pageMap = useMemo(() => new Map(pages.map((p) => [p.pageIndex, p])), [pages]);

  // ---------- Стили текста ----------
  const textStyle: React.CSSProperties = {
    fontFamily:
      settings.fontFamily === 'serif'
        ? 'Georgia, Cambria, serif'
        : settings.fontFamily === 'sans'
          ? 'system-ui, -apple-system, sans-serif'
          : settings.fontFamily === 'mono'
            ? 'ui-monospace, Menlo, monospace'
            : "'OpenDyslexic', 'Lexend', 'Comic Sans MS', Arial, sans-serif",
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    textAlign: settings.textAlign === 'justify' ? 'justify' : 'left',
  };

  // ---------- Ленивая отрисовка ----------
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || renderedCount >= pages.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderedCount((c) => Math.min(pages.length, c + CHUNK));
        }
      },
      { root: scrollRef.current, rootMargin: '2000px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [renderedCount, pages.length]);

  // Подтягиваем порции до целевой страницы (быстрый переход по слайдеру)
  useEffect(() => {
    if (renderedCount <= initialPage + 2 && pages.length > renderedCount) {
      setRenderedCount(Math.min(pages.length, initialPage + CHUNK));
    }
  }, [initialPage, pages.length, renderedCount]);

  // ---------- Восстановление позиции ----------
  useLayoutEffect(() => {
    if (restored.current || !contentRef.current) return;
    const marker = contentRef.current.querySelector<HTMLElement>(`[data-page-marker="${initialPage}"]`);
    if (!marker) return;
    restored.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (pagination) {
        // Экранная страница, на которой начинается нужная PDF-страница
        const w = el.clientWidth + 32;
        const idx = Math.round(marker.offsetLeft / w);
        setScreenPage(Math.max(0, idx));
        el.dataset.offset = String(Math.max(0, idx) * w);
        if (contentRef.current) contentRef.current.style.transform = `translateX(${-Math.max(0, idx) * w}px)`;
      } else {
        el.scrollTop = marker.offsetTop + initialScrollRatio * 200;
      }
    });
  }, [initialPage, initialScrollRatio, pagination, renderedCount, pages.length]);

  // ---------- Измерение страниц (постраничный режим) ----------
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pagination) return;
    const w = el.clientWidth + 32;
    const total = Math.max(1, Math.round((contentRef.current?.scrollWidth ?? w) / w));
    setTotalScreens(total);
  }, [pagination, renderedCount, pages.length, settings.fontSize, settings.lineHeight, settings.margins]);

  // ---------- Текущая PDF-страница по позиции ----------
  const reportPage = useCallback(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) return;
    const markers = content.querySelectorAll<HTMLElement>('[data-page-marker]');
    if (!markers.length) return;

    if (pagination) {
      const w = scroller.clientWidth + 32;
      const idx = Math.round(Math.abs(scroller.dataset.offset ? Number(scroller.dataset.offset) : 0) / w);
      const marker = markers[Math.min(idx, markers.length - 1)];
      const page = Number(marker.dataset.pageMarker);
      onPageChange(page, totalScreens > 1 ? idx / (totalScreens - 1) : 0);
    } else {
      const top = scroller.scrollTop + 80;
      let current = Number(markers[0].dataset.pageMarker);
      for (const m of markers) {
        if (m.offsetTop <= top) current = Number(m.dataset.pageMarker);
        else break;
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      onPageChange(current, max > 0 ? scroller.scrollTop / max : 0);
    }
  }, [onPageChange, pagination, totalScreens]);

  // Дебаунс автосохранения позиции
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(reportPage, 400);
  };

  // ---------- Постраничная навигация ----------
  const goScreen = useCallback(
    (delta: number) => {
      if (!pagination) {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ top: delta * el.clientHeight * 0.92, behavior: 'smooth' });
        return;
      }
      setFlipDir(delta > 0 ? 1 : -1);
      setScreenPage((p) => {
        const next = Math.min(Math.max(0, p + delta), totalScreens - 1);
        const el = scrollRef.current;
        if (el) {
          const w = el.clientWidth + 32;
          el.dataset.offset = String(next * w);
          const content = contentRef.current;
          if (content) content.style.transform = `translateX(${-next * w}px)`;
          setTimeout(reportPage, 380);
        }
        return next;
      });
    },
    [pagination, totalScreens, reportPage],
  );

  // API для родителя (клавиатура, зоны касания)
  useEffect(() => {
    (window as unknown as { __reflowPage?: (d: number) => void }).__reflowPage = goScreen;
    return () => {
      delete (window as unknown as { __reflowPage?: (d: number) => void }).__reflowPage;
    };
  }, [goScreen]);

  // Переход к конкретной странице (из TOC/поиска/слайдера)
  const goToPdfPage = useCallback(
    (pdfPage: number) => {
      const content = contentRef.current;
      const scroller = scrollRef.current;
      if (!content || !scroller) return;
      const need = pdfPage + 2;
      if (renderedCount < need) setRenderedCount(Math.min(pages.length, need + CHUNK));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const marker = content.querySelector<HTMLElement>(`[data-page-marker="${pdfPage}"]`);
          if (!marker) return;
          if (pagination) {
            const w = scroller.clientWidth + 32;
            const idx = Math.round(marker.offsetLeft / w);
            setFlipDir(1);
            setScreenPage(idx);
            scroller.dataset.offset = String(idx * w);
            content.style.transform = `translateX(${-idx * w}px)`;
          } else {
            scroller.scrollTop = marker.offsetTop - 12;
          }
          setTimeout(reportPage, 420);
        });
      });
    },
    [pagination, renderedCount, pages.length, reportPage],
  );

  useEffect(() => {
    (window as unknown as { __reflowGoto?: (p: number) => void }).__reflowGoto = goToPdfPage;
    return () => {
      delete (window as unknown as { __reflowGoto?: (p: number) => void }).__reflowGoto;
    };
  }, [goToPdfPage]);

  // ---------- Выделение текста ----------
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-block]');
    const endEl = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest<HTMLElement>('[data-block]');
    if (!startEl || !endEl) return;

    const offsetIn = (el: HTMLElement, r: Range, atStart: boolean) => {
      const pre = r.cloneRange();
      pre.selectNodeContents(el);
      if (atStart) pre.setEnd(r.startContainer, r.startOffset);
      else pre.setEnd(r.endContainer, r.endOffset);
      return pre.toString().length;
    };

    const baseStart = Number(startEl.dataset.start) + offsetIn(startEl, range, true);
    const baseEnd = Number(endEl.dataset.start) + offsetIn(endEl, range, false);
    const text = sel.toString().trim();
    if (!text) return;
    const rect = range.getBoundingClientRect();
    onSelection({
      text,
      pageIndex: Number(startEl.dataset.page),
      charStart: baseStart,
      charEnd: baseEnd,
      rect,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelection]);

  // ---------- Поиск слова (двойной клик / тап) ----------
  const wordAt = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    let x: number, y: number;
    if ('touches' in e) {
      const t = e.touches[0] ?? (e as unknown as { changedTouches: TouchList }).changedTouches?.[0];
      if (!t) return;
      x = t.clientX;
      y = t.clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => unknown };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range) return;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    let s = range.startOffset;
    let en = range.startOffset;
    const isWord = (ch: string) => /[\p{L}\p{N}'’-]/u.test(ch);
    while (s > 0 && isWord(text[s - 1])) s--;
    while (en < text.length && isWord(text[en])) en++;
    const word = text.slice(s, en).trim();
    if (word.length > 1) {
      const r = document.createRange();
      r.setStart(node, s);
      r.setEnd(node, en);
      onWordLookup(word, r.getBoundingClientRect());
    }
  }, [onWordLookup]);

  // ---------- Линейка чтения ----------
  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!rulerEnabled) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    rulerY.current = clientY - rect.top;
    forceRuler((v) => v + 1);
  };

  // ---------- Поиск: подсветка текущего совпадения → автопрокрутка ----------
  const hit = currentHitIndex >= 0 ? searchHits[currentHitIndex] : undefined;
  useEffect(() => {
    if (!hit) return;
    goToPdfPage(hit.pageIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHitIndex]);

  // ---------- Рендер блоков ----------
  const renderedPages = pages.slice(0, renderedCount);
  const blocksHtml: React.ReactNode[] = [];
  for (const p of renderedPages) {
    blocksHtml.push(
      <div key={`m${p.pageIndex}`} data-page-marker={p.pageIndex} data-page={p.pageIndex} className="pt-2" />,
    );
    for (const b of p.blocks) {
      const marks: Mark[] = [];
      for (const h of highlights) {
        if (h.pageIndex === p.pageIndex && h.charEnd > b.start && h.charStart < b.end) {
          marks.push({ start: h.charStart, end: h.charEnd, kind: 'highlight', color: h.color });
        }
      }
      searchHits.forEach((sh, i) => {
        if (sh.pageIndex === p.pageIndex && sh.charEnd > b.start && sh.charStart < b.end) {
          marks.push({ start: sh.charStart, end: sh.charEnd, kind: 'search', current: i === currentHitIndex });
        }
      });
      const blockId = `${p.pageIndex}_${b.start}`;
      if (ttsWord && ttsWord.blockId === blockId) {
        marks.push({ start: b.start + ttsWord.start, end: b.start + ttsWord.end, kind: 'tts' });
      }

      const Tag = (b.type === 'h1' ? 'h1' : b.type === 'h2' ? 'h2' : b.type === 'h3' ? 'h3' : 'p') as keyof JSX.IntrinsicElements;
      blocksHtml.push(
        <Tag
          key={`${p.pageIndex}_${b.start}`}
          data-block
          data-page={p.pageIndex}
          data-start={b.start}
        >
          {renderWithMarks(b.text, b.start, marks)}
        </Tag>,
      );
    }
  }

  const contentStyle: React.CSSProperties = {
    ...textStyle,
    paddingLeft: `${settings.margins * 50}%`,
    paddingRight: `${settings.margins * 50}%`,
  };

  return (
    <div className="relative h-full" style={{ background: 'var(--reader-bg)', color: 'var(--reader-fg)' }}>
      <div
        ref={scrollRef}
        className={`h-full ${pagination ? 'overflow-hidden' : 'overflow-y-auto'}`}
        onScroll={handleScroll}
        onMouseUp={captureSelection}
        onTouchEnd={captureSelection}
        onDoubleClick={wordAt}
        onMouseMove={onPointerMove}
        data-testid="reflow-view"
      >
        <div
          ref={contentRef}
          className={`reader-content mx-auto ${flipDir >= 0 ? '' : ''}`}
          style={
            pagination
              ? {
                  ...contentStyle,
                  height: '100%',
                  width: 'calc(100% + 32px)',
                  columnWidth: scrollRef.current?.clientWidth ? `${scrollRef.current.clientWidth}px` : '100%',
                  columnGap: '32px',
                  columnFill: 'auto',
                  transform: `translateX(${-(screenPage * ((scrollRef.current?.clientWidth ?? 0) + 32))}px)`,
                  transition: 'transform .35s cubic-bezier(.2,.8,.2,1)',
                  paddingTop: 16,
                  paddingBottom: 24,
                }
              : {
                  ...contentStyle,
                  maxWidth: 820,
                  paddingTop: 24,
                  paddingBottom: '40vh',
                  transition: 'none',
                }
          }
        >
          {blocksHtml}
          <div ref={sentinelRef} />
        </div>
      </div>

      {/* Линейка чтения: две маски вокруг текущей строки */}
      {rulerEnabled && rulerY.current !== null && (
        <>
          <div
            className="reading-ruler-mask absolute left-0 right-0 top-0"
            style={{ height: Math.max(0, rulerY.current - 22) }}
          />
          <div
            className="reading-ruler-mask absolute left-0 right-0"
            style={{ top: rulerY.current + 22, bottom: 0 }}
          />
        </>
      )}

      {/* Счётчик страниц в постраничном режиме */}
      {pagination && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-black/5 text-[var(--reader-muted)] tabular-nums">
          {screenPage + 1} / {totalScreens}
        </div>
      )}
    </div>
  );
}

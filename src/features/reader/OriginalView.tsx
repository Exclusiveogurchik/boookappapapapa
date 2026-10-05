import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextSelection } from './ReflowView';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Режим «Оригинал»: страницы PDF как есть.
 *  — ленивый рендер canvas (только видимые страницы ± буфер);
 *  — зум колесом/щипком, двойной тап = fit-width ↔ 2x;
 *  — текстовый слой поверх canvas для выделения слов (лексика/перевод).
 */

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

// ---------- Одна страница ----------
function PdfPage({
  doc,
  pageIndex,
  scale,
  visible,
  onSelection,
  onWordLookup,
}: {
  doc: PdfDoc;
  pageIndex: number;
  scale: number;
  visible: boolean;
  onSelection: (sel: TextSelection) => void;
  onWordLookup: (word: string, rect: DOMRect) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Рендер canvas + текстовый слой, когда страница видима или изменён масштаб
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const task = (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        setSize({ w: viewport.width, h: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.ceil(viewport.width * dpr);
        canvas.height = Math.ceil(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rt = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        } as never);
        renderTask.current = rt as unknown as { cancel: () => void };
        await rt.promise;
        renderTask.current = null;

        // Текстовый слой: позиционируем span'ы по элементам textContent
        const layer = layerRef.current;
        if (layer) {
          layer.innerHTML = '';
          layer.style.width = `${viewport.width}px`;
          layer.style.height = `${viewport.height}px`;
          const content = await page.getTextContent();
          for (const it of content.items as Array<Record<string, unknown>>) {
            if (typeof it.str !== 'string' || !it.str) continue;
            const tr = it.transform as number[];
            const style = (content.styles as Record<string, { fontSize?: number }>)[String(it.fontName)];
            const fontH = Math.abs(tr[3]) || style?.fontSize || 12;
            const span = document.createElement('span');
            span.textContent = it.str;
            span.style.position = 'absolute';
            span.style.whiteSpace = 'pre';
            span.style.transformOrigin = '0 0';
            // pdf.js координаты (y вверх) → CSS (y вниз)
            span.style.transform = `translate(${tr[4] * scale}px, ${(viewport.viewBox[3] - tr[5]) * scale - fontH * scale}px) scale(${scale})`;
            span.style.fontSize = `${fontH}px`;
            span.style.lineHeight = '1.15';
            span.style.color = 'transparent';
            layer.appendChild(span);
          }
        }
      } catch {
        /* отменено или ошибка рендера — тихо игнорируем */
      }
    })();
    return () => {
      cancelled = true;
      renderTask.current?.cancel();
    };
  }, [doc, pageIndex, scale, visible]);

  // Выделение и слова
  const capture = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString().trim();
    if (!text) return;
    onSelection({
      text,
      pageIndex,
      charStart: 0,
      charEnd: text.length,
      rect: sel.getRangeAt(0).getBoundingClientRect(),
    });
  };

  const dbl = (e: React.MouseEvent) => {
    const doc2 = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc2.caretRangeFromPoint?.(e.clientX, e.clientY);
    const node = range?.startContainer;
    if (!range || node?.nodeType !== Node.TEXT_NODE) return;
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
  };

  return (
    <div
      ref={wrapRef}
      data-page={pageIndex}
      className="relative mx-auto my-3 shadow-card rounded-lg overflow-hidden bg-white"
      style={{ width: size?.w ?? '100%', height: size?.h ?? 480 }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={layerRef}
        className="absolute inset-0 cursor-text select-text"
        onMouseUp={capture}
        onTouchEnd={capture}
        onDoubleClick={dbl}
      />
      {!visible && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm bg-slate-100">
          {pageIndex + 1}
        </div>
      )}
    </div>
  );
}

// ---------- Вьювер ----------
export function OriginalView({
  file,
  pageCount,
  initialPage,
  onPageChange,
  onSelection,
  onWordLookup,
}: {
  file: Blob;
  pageCount: number;
  initialPage: number;
  onPageChange: (pageIndex: number, scrollRatio: number) => void;
  onSelection: (sel: TextSelection) => void;
  onWordLookup: (word: string, rect: DOMRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = fit-width
  const [visibleSet, setVisibleSet] = useState<Set<number>>(new Set());
  const restored = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка документа
  useEffect(() => {
    let cancelled = false;
    let d: PdfDoc | null = null;
    file.arrayBuffer().then((buf) => {
      if (cancelled) return;
      pdfjsLib
        .getDocument({ data: new Uint8Array(buf), isEvalSupported: false })
        .promise.then((loaded) => {
          if (cancelled) {
            void loaded.destroy();
            return;
          }
          d = loaded;
          setDoc(loaded);
        })
        .catch(() => void 0);
    });
    return () => {
      cancelled = true;
      void d?.destroy();
    };
  }, [file]);

  // Видимость страниц (IntersectionObserver)
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisibleSet((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const idx = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(idx);
            else if (e.intersectionRatio === 0 && next.size > 6) next.delete(idx);
          }
          return next;
        });
      },
      { root, rootMargin: '1200px 0px' },
    );
    const observeAll = () => {
      root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => io.observe(el));
    };
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [doc, pageCount]);

  // Текущая страница + автосохранение
  const onScroll = () => {
    const root = containerRef.current;
    if (!root) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const mid = root.scrollTop + root.clientHeight * 0.3;
      let current = 0;
      root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
        if (el.offsetTop <= mid) current = Number(el.dataset.page);
      });
      const max = root.scrollHeight - root.clientHeight;
      onPageChange(current, max > 0 ? root.scrollTop / max : 0);
    }, 400);
  };

  // Восстановление позиции
  useEffect(() => {
    if (restored.current || !doc) return;
    restored.current = true;
    requestAnimationFrame(() => {
      const root = containerRef.current;
      const el = root?.querySelector<HTMLElement>(`[data-page="${initialPage}"]`);
      if (root && el) root.scrollTop = el.offsetTop - 8;
    });
  }, [doc, initialPage]);

  // Переход по странице (слайдер, TOC)
  const goToPage = useCallback((p: number) => {
    requestAnimationFrame(() => {
      const root = containerRef.current;
      const el = root?.querySelector<HTMLElement>(`[data-page="${p}"]`);
      if (root && el) root.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    });
  }, []);
  useEffect(() => {
    (window as unknown as { __origGoto?: (p: number) => void }).__origGoto = goToPage;
    return () => {
      delete (window as unknown as { __origGoto?: (p: number) => void }).__origGoto;
    };
  }, [goToPage]);

  // Жесты: щипок и двойной тап
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = { dist: Math.hypot(dx, dy), zoom };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        // Двойной тап: fit-width ↔ 2x
        setZoom((z) => (z > 1.2 ? 1 : 2));
      }
      lastTap.current = now;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchStart.current.dist;
      setZoom(Math.min(4, Math.max(0.5, pinchStart.current.zoom * factor)));
    }
  };

  // Колесо мыши + Ctrl (десктопный зум)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(4, Math.max(0.5, z * (e.deltaY > 0 ? 0.92 : 1.08))));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [doc]);

  return (
    <div
      className="relative h-full overflow-y-auto bg-slate-200/40"
      ref={containerRef}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {doc && (
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform .12s ease-out' }}>
          {Array.from({ length: pageCount }, (_, i) => (
            <PdfPage
              key={i}
              doc={doc}
              pageIndex={i}
              scale={zoom}
              visible={visibleSet.has(i) || Math.abs(i - initialPage) < 3}
              onSelection={onSelection}
              onWordLookup={onWordLookup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

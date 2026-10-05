/// <reference lib="webworker" />
/**
 * Web Worker: извлечение текста и обложки из PDF.
 * pdf.js работает здесь же (внутренний worker pdf.js при необходимости
 * поднимается вложенно либо используется fallback «fake worker»).
 *
 * Протокол сообщений:
 *   → { type: 'extract', bookId, buffer: ArrayBuffer }
 *   ← { type: 'meta', bookId, pageCount, title, author, hasTextLayer }
 *   ← { type: 'progress', bookId, processed, pageCount }
 *   ← { type: 'pages', bookId, pages: PageText[] }   — батчами по 20 страниц
 *   ← { type: 'done', bookId, pageCount, wordCount, hasTextLayer, cover: Blob }
 *   ← { type: 'error', bookId, message }
 */
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildBlocks, blocksToPlainText, type RawItem } from './textProcessing';
import type { PageText } from '../db/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const BATCH = 20;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg?.type !== 'extract') return;
  const { bookId, buffer } = msg as { bookId: string; buffer: ArrayBuffer };

  try {
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    // --- Метаданные ---
    let title = '';
    let author = '';
    try {
      const meta = await doc.getMetadata();
      const info = (meta.info ?? {}) as Record<string, unknown>;
      title = String(info.Title ?? '').trim();
      author = String(info.Author ?? '').trim();
    } catch {
      /* метаданных может не быть — не критично */
    }

    // --- Оглавление из outline PDF (если есть) ---
    const toc: { title: string; pageIndex: number; level: number }[] = [];
    try {
      const outline = await doc.getOutline();
      const walk = async (items: typeof outline, level: number) => {
        for (const it of items ?? []) {
          if (toc.length > 200) return;
          let pageIndex = 0;
          try {
            const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
            if (dest?.[0]) {
              const ref = dest[0] as { num: number; gen: number };
              pageIndex = (await doc.getPageIndex(ref)) - 1;
            }
          } catch {
            /* ссылка битая — пропускаем */
          }
          toc.push({ title: it.title || '…', pageIndex, level });
          if (it.items?.length) await walk(it.items as never, level + 1);
        }
      };
      await walk(outline, 0);
    } catch {
      /* outline может отсутствовать */
    }

    (self as unknown as Worker).postMessage({
      type: 'meta',
      bookId,
      pageCount: doc.numPages,
      title,
      author,
      toc,
    });

    // --- Обложка: первая страница, ширина ~420px ---
    let cover: Blob | undefined;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = 420 / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      await page.render({ canvasContext: ctx, viewport } as never).promise;
      cover = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
      page.cleanup();
    } catch {
      /* без обложки — карточка получит заглушку */
    }

    // --- Текст постранично, батчами ---
    let wordCount = 0;
    let textChars = 0;
    let batch: PageText[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const items: RawItem[] = [];
      for (const it of content.items as Array<Record<string, unknown>>) {
        if (typeof it.str !== 'string' || !it.str.trim()) continue;
        const tr = it.transform as number[];
        const style = (content.styles as Record<string, { fontSize?: number }>)[String(it.fontName)];
        items.push({
          str: it.str,
          x: tr[4],
          y: tr[5],
          width: Number(it.width) || 0,
          height: Number(it.height) || style?.fontSize || Math.abs(tr[3]) || 10,
          fontName: String(it.fontName ?? ''),
        });
      }

      const blocks = buildBlocks(items, p - 1);
      const plainText = blocksToPlainText(blocks);
      textChars += plainText.length;
      wordCount += plainText.trim() ? plainText.trim().split(/\s+/).length : 0;

      batch.push({
        id: `${bookId}_${p - 1}`,
        bookId,
        pageIndex: p - 1,
        blocks,
        plainText,
      });
      page.cleanup();

      if (batch.length >= BATCH || p === doc.numPages) {
        (self as unknown as Worker).postMessage({ type: 'pages', bookId, pages: batch });
        batch = [];
      }
      if (p % 5 === 0 || p === doc.numPages) {
        (self as unknown as Worker).postMessage({
          type: 'progress',
          bookId,
          processed: p,
          pageCount: doc.numPages,
        });
      }
    }

    // Скан без текстового слоя: меньше ~8 символов на страницу в среднем
    const hasTextLayer = doc.numPages > 0 ? textChars / doc.numPages > 8 : false;

    (self as unknown as Worker).postMessage({
      type: 'done',
      bookId,
      pageCount: doc.numPages,
      wordCount,
      hasTextLayer,
      cover,
    });

    await doc.destroy();
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      bookId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

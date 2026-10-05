import type { PageText } from '../db/types';

/**
 * Клиент Web Worker'а извлечения текста.
 * Одиночный worker переиспользуется; события сопоставляются по bookId.
 */

export interface ExtractProgress {
  phase: 'meta' | 'pages' | 'done' | 'error';
  title?: string;
  author?: string;
  pageCount?: number;
  toc?: { title: string; pageIndex: number; level: number }[];
  processed?: number;
  wordCount?: number;
  hasTextLayer?: boolean;
  cover?: Blob;
  message?: string;
}

type Handler = (p: ExtractProgress, pages?: PageText[]) => void;

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./extract.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

/** Запускает извлечение текста/обложки из PDF-блоба. Возвращает функцию отмены. */
export function extractBook(
  bookId: string,
  file: Blob,
  onEvent: Handler,
): () => void {
  const w = getWorker();

  const listener = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.bookId !== bookId) return;
    switch (msg.type) {
      case 'meta':
        onEvent({
          phase: 'meta',
          title: msg.title,
          author: msg.author,
          pageCount: msg.pageCount,
          toc: msg.toc,
        });
        break;
      case 'progress':
        onEvent({ phase: 'pages', processed: msg.processed, pageCount: msg.pageCount });
        break;
      case 'pages':
        onEvent({ phase: 'pages' }, msg.pages as PageText[]);
        break;
      case 'done':
        onEvent({
          phase: 'done',
          pageCount: msg.pageCount,
          wordCount: msg.wordCount,
          hasTextLayer: msg.hasTextLayer,
          cover: msg.cover,
        });
        w.removeEventListener('message', listener);
        break;
      case 'error':
        onEvent({ phase: 'error', message: msg.message });
        w.removeEventListener('message', listener);
        break;
    }
  };
  w.addEventListener('message', listener);

  file
    .arrayBuffer()
    .then((buffer) => {
      w.postMessage({ type: 'extract', bookId, buffer }, [buffer]);
    })
    .catch((err) => {
      onEvent({ phase: 'error', message: String(err) });
      w.removeEventListener('message', listener);
    });

  return () => w.removeEventListener('message', listener);
}

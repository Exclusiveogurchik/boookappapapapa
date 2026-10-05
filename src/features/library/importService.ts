import { extractBook } from '../../workers/extractClient';
import { addBook, savePageTexts, updateBook } from '../../db/repositories';
import type { Book, PageText } from '../../db/types';

/**
 * Импорт PDF-файлов: создаёт книгу сразу (с плейсхолдером), затем
 * наполняет метаданными/обложкой/текстом по мере работы Web Worker.
 */
export interface ImportCallbacks {
  onProgress?: (fileName: string, percent: number) => void;
  onError?: (fileName: string, message: string) => void;
  onDone?: (bookId: string) => void;
}

export async function importPdfFiles(files: File[], cb: ImportCallbacks = {}): Promise<void> {
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      cb.onError?.(file.name, 'not-pdf');
      continue;
    }
    await importOne(file, cb);
  }
}

function importOne(file: File, cb: ImportCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    const titleFromFile = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

    const book: Book = {
      id,
      title: titleFromFile || file.name,
      author: '',
      file,
      fileName: file.name,
      fileSize: file.size,
      pageCount: 0,
      wordCount: 0,
      status: 'want',
      progress: 0,
      shelfIds: [],
      tags: [],
      hasTextLayer: true,
      addedAt: Date.now(),
    };

    let created = false;

    const cancel = extractBook(id, file, async (ev, pages?: PageText[]) => {
      try {
        if (ev.phase === 'meta') {
          // Кладём книгу в БД, чтобы карточка появилась сразу
          book.title = ev.title || book.title;
          book.author = ev.author || '';
          book.pageCount = ev.pageCount ?? 0;
          book.toc = ev.toc ?? [];
          await addBook(book);
          created = true;
        } else if (ev.phase === 'pages') {
          if (!created) return;
          if (pages?.length) await savePageTexts(pages);
          if (ev.processed && book.pageCount) {
            cb.onProgress?.(file.name, Math.round((ev.processed / book.pageCount) * 100));
          }
        } else if (ev.phase === 'done' && created) {
          await updateBook(id, {
            cover: ev.cover,
            pageCount: ev.pageCount ?? book.pageCount,
            wordCount: ev.wordCount ?? 0,
            hasTextLayer: ev.hasTextLayer ?? true,
          });
          cb.onDone?.(id);
          resolve();
        } else if (ev.phase === 'error') {
          cancel();
          if (created) {
            const { deleteBook } = await import('../../db/repositories');
            await deleteBook(id);
          }
          cb.onError?.(file.name, ev.message ?? 'unknown');
          resolve();
        }
      } catch (err) {
        cb.onError?.(file.name, err instanceof Error ? err.message : String(err));
        resolve();
      }
    });
  });
}

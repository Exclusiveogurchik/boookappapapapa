import { db } from './database';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Book,
  type Bookmark,
  type Highlight,
  type PageText,
  type ReadingPosition,
  type ReadingStatus,
  type VocabWord,
} from './types';

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

// ---------- Книги ----------

export async function addBook(book: Book): Promise<void> {
  await db.books.put(book);
}

export async function updateBook(id: string, patch: Partial<Book>): Promise<void> {
  await db.books.update(id, patch);
}

export async function deleteBook(id: string): Promise<void> {
  // Каскадное удаление всех данных книги
  await db.transaction(
    'rw',
    [db.books, db.pageTexts, db.positions, db.bookmarks, db.highlights, db.sessions],
    async () => {
      await db.books.delete(id);
      await db.pageTexts.where('bookId').equals(id).delete();
      await db.positions.delete(id);
      await db.bookmarks.where('bookId').equals(id).delete();
      await db.highlights.where('bookId').equals(id).delete();
      await db.sessions.where('bookId').equals(id).delete();
    },
  );
}

// ---------- Текст страниц (кэш worker'а) ----------

export async function savePageTexts(pages: PageText[]): Promise<void> {
  await db.pageTexts.bulkPut(pages);
}

export async function getPageTexts(bookId: string): Promise<PageText[]> {
  return db.pageTexts.where('bookId').equals(bookId).sortBy('pageIndex');
}

// ---------- Позиция чтения ----------

export async function savePosition(pos: ReadingPosition): Promise<void> {
  await db.positions.put(pos);
}

export async function getPosition(bookId: string): Promise<ReadingPosition | undefined> {
  return db.positions.get(bookId);
}

// ---------- Закладки ----------

export async function addBookmark(bookId: string, pageIndex: number, label: string): Promise<Bookmark> {
  const bm: Bookmark = { id: uid(), bookId, pageIndex, label, createdAt: Date.now() };
  await db.bookmarks.put(bm);
  return bm;
}

export async function removeBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

// ---------- Выделения ----------

export async function addHighlight(h: Omit<Highlight, 'id' | 'createdAt'>): Promise<Highlight> {
  const full: Highlight = { ...h, id: uid(), createdAt: Date.now() };
  await db.highlights.put(full);
  return full;
}

export async function updateHighlight(id: string, patch: Partial<Highlight>): Promise<void> {
  await db.highlights.update(id, patch);
}

export async function removeHighlight(id: string): Promise<void> {
  await db.highlights.delete(id);
}

// ---------- Словарь ----------

export async function addVocabWord(w: Omit<VocabWord, 'id' | 'createdAt' | 'nextReview' | 'intervalDays' | 'repetitions'>): Promise<void> {
  const word: VocabWord = {
    ...w,
    id: uid(),
    createdAt: Date.now(),
    nextReview: Date.now(),
    intervalDays: 0,
    repetitions: 0,
  };
  await db.vocabulary.put(word);
}

/** Упрощённый SM-2: интервал растёт при успехе, сбрасывается при ошибке. */
export async function gradeVocabWord(id: string, quality: 'good' | 'hard' | 'forgot'): Promise<void> {
  const w = await db.vocabulary.get(id);
  if (!w) return;
  let { intervalDays, repetitions } = w;
  if (quality === 'forgot') {
    repetitions = 0;
    intervalDays = 0;
  } else {
    repetitions += 1;
    const factor = quality === 'hard' ? 1.3 : 2.2;
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * factor));
  }
  await db.vocabulary.update(id, {
    repetitions,
    intervalDays,
    nextReview: Date.now() + intervalDays * 24 * 3600 * 1000,
  });
}

// ---------- Сессии чтения ----------

export async function recordSession(bookId: string, seconds: number, pagesRead: number, wordsRead: number): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const existing = await db.sessions.where('[bookId+date]').equals([bookId, date]).first();
  if (existing) {
    await db.sessions.update(existing.id, {
      seconds: existing.seconds + seconds,
      pagesRead: existing.pagesRead + pagesRead,
      wordsRead: existing.wordsRead + wordsRead,
    });
  } else {
    await db.sessions.add({ id: uid(), bookId, date, seconds, pagesRead, wordsRead });
  }
}

// ---------- Настройки ----------

export async function loadSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...(map as Partial<AppSettings>) };
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------- Статус книги ----------

export async function setStatus(id: string, status: ReadingStatus): Promise<void> {
  await db.books.update(id, { status });
}

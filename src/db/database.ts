import Dexie, { type Table } from 'dexie';
import type {
  Book,
  Bookmark,
  Highlight,
  PageText,
  ReadingPosition,
  ReadingSession,
  Settings,
  Shelf,
  VocabWord,
} from './types';

/** Схема IndexedDB. Версии: v1 — стартовая. */
class BookDB extends Dexie {
  books!: Table<Book, string>;
  pageTexts!: Table<PageText, string>;
  positions!: Table<ReadingPosition, string>;
  bookmarks!: Table<Bookmark, string>;
  highlights!: Table<Highlight, string>;
  shelves!: Table<Shelf, string>;
  vocabulary!: Table<VocabWord, string>;
  sessions!: Table<ReadingSession, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('bookapp');
    this.version(1).stores({
      books: 'id, title, author, status, addedAt, lastOpenedAt, progress',
      // Полнотекстовый поиск сканирует pageTexts; ключ — bookId_pageIndex
      pageTexts: 'id, bookId, pageIndex',
      positions: 'bookId',
      bookmarks: 'id, bookId, pageIndex, createdAt',
      highlights: 'id, bookId, pageIndex, createdAt',
      shelves: 'id, order',
      vocabulary: 'id, word, nextReview, createdAt',
      sessions: 'id, bookId, date, [bookId+date]',
      settings: 'key',
    });
  }
}

export const db = new BookDB();

/** Человеко-читаемый размер файла */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Доменные типы приложения. Все данные хранятся локально в IndexedDB (Dexie). */

export type ReadingStatus = 'want' | 'reading' | 'read';

export type ReadingMode = 'reflow' | 'original';

export type ThemeName = 'light' | 'sepia' | 'dark' | 'amoled' | 'auto';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface TocItem {
  title: string;
  pageIndex: number;
  level: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  /** Обложка — JPEG-блоб, рендер первой страницы */
  cover?: Blob;
  /** Исходный PDF */
  file: Blob;
  fileName: string;
  fileSize: number;
  pageCount: number;
  /** ~общее число слов (для статистики и оценки времени) */
  wordCount: number;
  status: ReadingStatus;
  /** Прогресс 0..1 */
  progress: number;
  shelfIds: string[];
  tags: string[];
  hasTextLayer: boolean;
  /** Оглавление из outline PDF (если есть) */
  toc?: TocItem[];
  addedAt: number;
  lastOpenedAt?: number;
}

/** Текстовая страница после обработки в Web Worker. */
export interface TextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p';
  text: string;
  /** Смещение символов внутри страницы (для якорей выделений) */
  start: number;
  end: number;
}

export interface PageText {
  /** `${bookId}_${pageIndex}` */
  id: string;
  bookId: string;
  pageIndex: number;
  blocks: TextBlock[];
  plainText: string;
}

export interface ReadingPosition {
  bookId: string;
  mode: ReadingMode;
  /** Страница (0-based) */
  pageIndex: number;
  /** Доля прокрутки внутри страницы/книги 0..1 (для reflow-скролла) */
  scrollRatio: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  pageIndex: number;
  label: string;
  createdAt: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  pageIndex: number;
  /** Выделенный текст */
  text: string;
  color: HighlightColor;
  note: string;
  /** Границы символов в plainText страницы (для reflow) */
  charStart: number;
  charEnd: number;
  createdAt: number;
}

export interface Shelf {
  id: string;
  name: string;
  order: number;
}

export interface VocabWord {
  id: string;
  word: string;
  definition: string;
  translation: string;
  context: string;
  bookId?: string;
  createdAt: number;
  /** Интервальное повторение (упрощённый SM-2) */
  nextReview: number;
  intervalDays: number;
  repetitions: number;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  /** YYYY-MM-DD */
  date: string;
  seconds: number;
  pagesRead: number;
  wordsRead: number;
}

export interface Settings {
  key: string;
  value: unknown;
}

export interface AppSettings {
  language: 'ru' | 'en';
  theme: ThemeName;
  // Настройки reflow
  fontFamily: 'serif' | 'sans' | 'mono' | 'dys';
  fontSize: number; // px
  lineHeight: number;
  margins: number; // 0..1 ширины полей
  textAlign: 'left' | 'justify';
  pagination: boolean; // true = постранично с анимацией
  // Прочее
  dailyGoalMinutes: number;
  rulerEnabled: boolean;
  ttsRate: number;
  ttsVoiceURI: string;
  anthropicApiKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ru',
  theme: 'auto',
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.7,
  margins: 0.15,
  textAlign: 'left',
  pagination: true,
  dailyGoalMinutes: 20,
  rulerEnabled: false,
  ttsRate: 1,
  ttsVoiceURI: '',
  anthropicApiKey: '',
};

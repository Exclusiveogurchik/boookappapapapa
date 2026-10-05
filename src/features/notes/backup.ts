import { db } from '../../db/database';

/**
 * Резервная копия библиотеки: экспорт/импорт JSON.
 * Файлы PDF и обложки кодируются в base64 — получается большой,
 * но самодостаточный файл восстановления.
 */

interface BackupFile {
  format: 'bookapp-backup';
  version: 1;
  exportedAt: string;
  books: unknown[];
  highlights: unknown[];
  bookmarks: unknown[];
  positions: unknown[];
  sessions: unknown[];
  shelves: unknown[];
  vocabulary: unknown[];
  pageTexts: unknown[];
  settings: unknown[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(): Promise<void> {
  const books = await db.books.toArray();
  const encodedBooks = await Promise.all(
    books.map(async (b) => ({
      ...b,
      file: await blobToBase64(b.file),
      fileType: b.file.type || 'application/pdf',
      cover: b.cover ? await blobToBase64(b.cover) : undefined,
      coverType: b.cover?.type,
    })),
  );

  const backup: BackupFile = {
    format: 'bookapp-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: encodedBooks,
    highlights: await db.highlights.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    positions: await db.positions.toArray(),
    sessions: await db.sessions.toArray(),
    shelves: await db.shelves.toArray(),
    vocabulary: await db.vocabulary.toArray(),
    pageTexts: await db.pageTexts.toArray(),
    settings: await db.settings.toArray(),
  };

  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function importBackup(file: File): Promise<number> {
  const text = await file.text();
  const data = JSON.parse(text) as BackupFile;
  if (data.format !== 'bookapp-backup' || !Array.isArray(data.books)) {
    throw new Error('invalid-format');
  }

  const books = data.books.map((raw) => {
    const b = raw as Record<string, unknown>;
    return {
      ...b,
      file: base64ToBlob(String(b.file), String(b.fileType ?? 'application/pdf')),
      cover: b.cover ? base64ToBlob(String(b.cover), String(b.coverType ?? 'image/jpeg')) : undefined,
    };
  }) as never[];

  await db.transaction(
    'rw',
    [db.books, db.highlights, db.bookmarks, db.positions, db.sessions, db.shelves, db.vocabulary, db.pageTexts, db.settings],
    async () => {
      await db.books.bulkPut(books);
      if (data.highlights.length) await db.highlights.bulkPut(data.highlights as never);
      if (data.bookmarks.length) await db.bookmarks.bulkPut(data.bookmarks as never);
      if (data.positions.length) await db.positions.bulkPut(data.positions as never);
      if (data.sessions.length) await db.sessions.bulkPut(data.sessions as never);
      if (data.shelves.length) await db.shelves.bulkPut(data.shelves as never);
      if (data.vocabulary.length) await db.vocabulary.bulkPut(data.vocabulary as never);
      if (data.pageTexts.length) await db.pageTexts.bulkPut(data.pageTexts as never);
      if (data.settings.length) await db.settings.bulkPut(data.settings as never);
    },
  );
  return books.length;
}

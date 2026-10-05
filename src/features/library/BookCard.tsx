import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { Book } from '../../db/types';
import { ProgressBar } from '../../shared/ui/controls';
import { useI18n } from '../../i18n';
import { plural } from '../../shared/utils/format';

/** Карточка книги в сетке: обложка, прогресс, статус. */

export function BookCard({
  book,
  onOpen,
  onEdit,
  onDelete,
}: {
  book: Book;
  onOpen: (b: Book) => void;
  onEdit: (b: Book) => void;
  onDelete: (b: Book) => void;
}) {
  const { t, lang } = useI18n();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Обложка из блоба → object URL (кэшируем в state)
  useLiveQuery(async () => {
    const b = await db.books.get(book.id);
    if (b?.cover) {
      const url = URL.createObjectURL(b.cover);
      setCoverUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
  }, [book.id, book.cover]);

  const statusColor =
    book.status === 'read' ? 'bg-emerald-500/15 text-emerald-600' : book.status === 'reading' ? 'bg-sky-500/15 text-sky-600' : 'bg-slate-500/15 text-slate-500';
  const statusLabel =
    book.status === 'read' ? t('library.filter.readed') : book.status === 'reading' ? t('library.filter.reading') : t('library.filter.want');

  return (
    <div className="group relative animate-fade-in">
      <button
        onClick={() => onOpen(book)}
        className="w-full text-left rounded-2xl bg-surface border border-border shadow-card overflow-hidden transition-transform active:scale-[.97] hover:shadow-pop"
        aria-label={`${book.title}. ${t('library.open')}`}
      >
        <div className="aspect-[3/4] bg-accent-soft relative overflow-hidden">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
          )}
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 min-h-[2.5em]">{book.title}</h3>
          <p className="text-xs text-muted mt-0.5 line-clamp-1">{book.author || '—'}</p>
          <div className="mt-2.5">
            <ProgressBar value={book.progress} />
            <div className="flex justify-between items-center mt-1.5 text-[11px] text-muted">
              <span>
                {Math.round(book.progress * 100)}%
                {book.pageCount > 0 && ` · ${plural(book.pageCount, ['страница', 'страницы', 'страниц'], lang)}`}
              </span>
              {book.wordCount > 0 && (
                <span>~{Math.max(1, Math.round(((book.wordCount * (1 - book.progress)) / 200) / 60))} ч</span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Меню карточки */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="Меню"
        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute top-12 right-2 z-20 bg-surface rounded-2xl shadow-pop border border-border overflow-hidden animate-fade-in min-w-[150px]">
          <button
            className="w-full text-left px-4 py-3 text-sm hover:bg-accent-soft min-h-[44px]"
            onClick={() => {
              setMenuOpen(false);
              onEdit(book);
            }}
          >
            ✏️ {t('library.editMeta')}
          </button>
          <button
            className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 min-h-[44px]"
            onClick={() => {
              setMenuOpen(false);
              onDelete(book);
            }}
          >
            🗑 {t('library.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

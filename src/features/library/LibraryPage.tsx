import React, { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/database';
import type { Book, ReadingStatus } from '../../db/types';
import { deleteBook, setStatus, updateBook, uid } from '../../db/repositories';
import { importPdfFiles } from './importService';
import { BookCard } from './BookCard';
import { BookDetailsModal } from './BookDetailsModal';
import { Button, Segmented } from '../../shared/ui/controls';
import { BooksIllustration, EmptyState, Modal } from '../../shared/ui/overlays';
import { PlusIcon, SearchIcon } from '../../shared/ui/icons';
import { useI18n } from '../../i18n';
import { useToast } from '../../shared/hooks/useToast';
import { formatBytes } from '../../db/database';
import { plural } from '../../shared/utils/format';

type SortKey = 'recent' | 'title' | 'progress' | 'added';
type StatusFilter = 'all' | ReadingStatus;

/** Главная страница: библиотека книг с импортом, поиском, полками и сортировкой. */
export function LibraryPage() {
  const { t, lang } = useI18n();
  const { show } = useToast();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [fullText, setFullText] = useState(false);
  const [sort, setSort] = useState<SortKey>('recent');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shelfFilter, setShelfFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState<{ name: string; percent: number } | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [shelfModal, setShelfModal] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const books = useLiveQuery(() => db.books.toArray(), []) ?? [];
  const shelves = useLiveQuery(() => db.shelves.orderBy('order').toArray(), []) ?? [];

  // ---------- Полнотекстовый поиск по содержимому книг ----------
  const [ftResults, setFtResults] = useState<{ book: Book; snippet: string; pageIndex: number }[] | null>(null);
  const [ftSearching, setFtSearching] = useState(false);

  const runFullTextSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setFtResults(null);
      return;
    }
    setFtSearching(true);
    try {
      const needle = q.toLowerCase();
      const results: { book: Book; snippet: string; pageIndex: number }[] = [];
      const bookMap = new Map(books.map((b) => [b.id, b]));
      const pages = await db.pageTexts.toArray();
      for (const p of pages) {
        const idx = p.plainText.toLowerCase().indexOf(needle);
        if (idx >= 0) {
          const book = bookMap.get(p.bookId);
          if (!book) continue;
          const start = Math.max(0, idx - 40);
          const end = Math.min(p.plainText.length, idx + needle.length + 40);
          results.push({
            book,
            pageIndex: p.pageIndex,
            snippet: (start > 0 ? '…' : '') + p.plainText.slice(start, end) + (end < p.plainText.length ? '…' : ''),
          });
          if (results.length > 50) break;
        }
      }
      setFtResults(results);
    } finally {
      setFtSearching(false);
    }
  };

  // ---------- Импорт ----------
  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setImporting({ name: arr[0].name, percent: 0 });
    await importPdfFiles(arr, {
      onProgress: (name, percent) => setImporting({ name, percent }),
      onError: (name, message) =>
        show(
          message === 'not-pdf'
            ? `${name}: не PDF`
            : /quota|storage/i.test(message)
              ? t('backup.quota')
              : `${name}: ${t('reader.corrupt')}`,
          'error',
        ),
      onDone: () => show(t('library.importDone'), 'success'),
    });
    setImporting(null);
  };

  // ---------- Фильтрация и сортировка ----------
  const visible = useMemo(() => {
    let list = books;
    const q = query.trim().toLowerCase();
    if (q && !fullText) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== 'all') list = list.filter((b) => b.status === statusFilter);
    if (shelfFilter) list = list.filter((b) => b.shelfIds.includes(shelfFilter));

    const sorted = [...list];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, lang));
        break;
      case 'progress':
        sorted.sort((a, b) => b.progress - a.progress);
        break;
      case 'added':
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      default:
        sorted.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    }
    return sorted;
  }, [books, query, statusFilter, shelfFilter, sort, fullText, lang]);

  const openBook = (b: Book) => navigate(`/read/${b.id}`);

  return (
    <div
      className="min-h-full"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {/* Шапка */}
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold tracking-tight">{t('library.title')}</h1>
            <Button icon={<PlusIcon className="w-5 h-5" />} onClick={() => fileInput.current?.click()}>
              {t('library.import')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              hidden
              onChange={(e) => e.target.files && void handleFiles(e.target.files)}
            />
          </div>

          {/* Поиск */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (fullText) void runFullTextSearch(e.target.value);
                }}
                placeholder={t('library.searchPlaceholder')}
                aria-label={t('library.searchPlaceholder')}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface border border-border text-sm focus:border-accent"
              />
            </div>
            <button
              onClick={() => {
                setFullText((v) => !v);
                setFtResults(null);
              }}
              title={t('library.fullSearchHint')}
              className={`px-4 rounded-2xl border text-sm font-medium min-h-[44px] ${
                fullText ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted'
              }`}
            >
              Aa
            </button>
          </div>

          {/* Фильтры */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4">
            <Segmented
              className="min-w-[280px]"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: t('library.filter.all') },
                { value: 'want', label: t('library.filter.want') },
                { value: 'reading', label: t('library.filter.reading') },
                { value: 'read', label: t('library.filter.readed') },
              ]}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t('library.sort')}
              className="px-3 py-2 rounded-2xl bg-surface border border-border text-sm min-h-[44px]"
            >
              <option value="recent">{t('library.sort.recent')}</option>
              <option value="title">{t('library.sort.title')}</option>
              <option value="progress">{t('library.sort.progress')}</option>
              <option value="added">{t('library.sort.added')}</option>
            </select>
            <button
              onClick={() => setShelfModal(true)}
              className="px-3 py-2 rounded-2xl bg-surface border border-border text-sm min-h-[44px] whitespace-nowrap"
            >
              📚 {t('library.shelves')}
            </button>
            {shelves.map((s) => (
              <button
                key={s.id}
                onClick={() => setShelfFilter(shelfFilter === s.id ? null : s.id)}
                className={`px-3 py-2 rounded-2xl border text-sm min-h-[44px] whitespace-nowrap ${
                  shelfFilter === s.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Импорт */}
      {importing && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="bg-surface border border-border rounded-2xl p-4 animate-fade-in">
            <div className="flex justify-between text-sm mb-2">
              <span className="truncate">{t('library.importing', { name: importing.name })}</span>
              <span className="tabular-nums">{importing.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${importing.percent}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Результаты полнотекстового поиска */}
      {fullText && query.trim().length >= 2 ? (
        <div className="max-w-6xl mx-auto px-4 py-6">
          {ftSearching ? (
            <p className="text-muted text-center py-10">{t('reader.loading')}</p>
          ) : ftResults && ftResults.length === 0 ? (
            <EmptyState title={t('library.searchEmpty')} />
          ) : ftResults ? (
            <>
              <p className="text-sm text-muted mb-4">{t('library.fullTextResults', { n: ftResults.length })}</p>
              <div className="space-y-3">
                {ftResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(`/read/${r.book.id}?page=${r.pageIndex}`)}
                    className="w-full text-left p-4 rounded-2xl bg-surface border border-border hover:shadow-card"
                  >
                    <p className="font-semibold text-sm">{r.book.title}</p>
                    <p className="text-sm text-muted mt-1 line-clamp-2">{r.snippet}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted text-center py-10 text-sm">{t('library.fullSearchHint')}</p>
          )}
        </div>
      ) : (
        /* Сетка книг */
        <div className="max-w-6xl mx-auto px-4 py-6">
          {visible.length === 0 && books.length === 0 ? (
            <EmptyState
              illustration={<BooksIllustration />}
              title={t('library.empty')}
              hint={t('library.emptyHint')}
              action={
                <Button icon={<PlusIcon className="w-5 h-5" />} size="lg" onClick={() => fileInput.current?.click()}>
                  {t('library.import')}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState title={t('library.searchEmpty')} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {visible.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  onOpen={openBook}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drag & drop оверлей */}
      {dragOver && (
        <div className="fixed inset-0 z-40 bg-accent/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-surface rounded-3xl shadow-pop px-10 py-8 text-center border-2 border-dashed border-accent">
            <p className="text-lg font-semibold">{t('library.drop')}</p>
            <p className="text-muted text-sm mt-1">{t('library.dropHint')}</p>
          </div>
        </div>
      )}

      {/* Редактирование книги */}
      {editing && (
        <BookDetailsModal
          book={editing}
          onClose={() => setEditing(null)}
          shelves={shelves}
          onSave={async (patch) => {
            await updateBook(editing.id, patch);
            setEditing(null);
            show(t('common.save'), 'success');
          }}
        />
      )}

      {/* Удаление */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={t('library.delete')}>
        <p className="text-muted">{t('library.deleteConfirm', { title: deleting?.title ?? '' })}</p>
        <div className="flex gap-2 mt-5">
          <Button variant="danger" className="flex-1" onClick={async () => {
            if (deleting) await deleteBook(deleting.id);
            setDeleting(null);
            show(t('library.delete'), 'success');
          }}>
            {t('common.delete')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setDeleting(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>

      {/* Полки */}
      <Modal open={shelfModal} onClose={() => setShelfModal(false)} title={t('library.shelves')}>
        <div className="space-y-2">
          {shelves.map((s) => (
            <div key={s.id} className="flex items-center gap-2 p-3 rounded-2xl bg-accent-soft/50">
              <span className="flex-1 text-sm font-medium">{s.name}</span>
              <button
                className="text-xs text-rose-600 px-2 py-1 min-h-[36px]"
                onClick={async () => {
                  await db.shelves.delete(s.id);
                  for (const b of books) {
                    if (b.shelfIds.includes(s.id)) {
                      await updateBook(b.id, { shelfIds: b.shelfIds.filter((x) => x !== s.id) });
                    }
                  }
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              placeholder={t('library.shelfName')}
              className="flex-1 px-4 py-3 rounded-2xl bg-surface border border-border text-sm"
            />
            <Button
              disabled={!newShelfName.trim()}
              onClick={async () => {
                await db.shelves.put({ id: uid(), name: newShelfName.trim(), order: shelves.length });
                setNewShelfName('');
              }}
            >
              {t('library.addShelf')}
            </Button>
          </div>
          {books.length > 0 && (
            <p className="text-xs text-muted pt-2">
              {plural(books.length, ['книга', 'книги', 'книг'], lang)} · {formatBytes(books.reduce((s, b) => s + b.fileSize, 0))}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

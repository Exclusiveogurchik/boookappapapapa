import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/database';
import { removeHighlight, updateHighlight } from '../../db/repositories';
import type { Highlight } from '../../db/types';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/controls';
import { Modal, NoteIllustration, EmptyState } from '../../shared/ui/overlays';
import { useToast } from '../../shared/hooks/useToast';
import { formatDate } from '../../shared/utils/format';

/** Экран «Мои выделения и заметки» по всем книгам + экспорт в Markdown. */
export function HighlightsPage() {
  const { t, lang } = useI18n();
  const { show } = useToast();
  const navigate = useNavigate();
  const [bookFilter, setBookFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [noteText, setNoteText] = useState('');

  const books = useLiveQuery(() => db.books.toArray(), []) ?? [];
  const highlights = useLiveQuery(() => db.highlights.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const visible = bookFilter ? highlights.filter((h) => h.bookId === bookFilter) : highlights;
  const booksWithHighlights = books.filter((b) => highlights.some((h) => h.bookId === b.id));

  /** Экспорт выделений книги (или всех) в Markdown. */
  const exportMarkdown = () => {
    const groups = new Map<string, Highlight[]>();
    for (const h of visible) {
      const list = groups.get(h.bookId) ?? [];
      list.push(h);
      groups.set(h.bookId, list);
    }
    let md = `# ${t('highlights.title')}\n\n`;
    for (const [bookId, list] of groups) {
      const book = bookMap.get(bookId);
      md += `## ${book?.title ?? '—'}\n`;
      if (book?.author) md += `*${book.author}*\n`;
      md += '\n';
      for (const h of list.sort((a, b) => a.pageIndex - b.pageIndex)) {
        md += `> ${h.text.replace(/\n/g, '\n> ')}\n\n`;
        md += `— ${t('highlights.page', { n: h.pageIndex + 1 })}, ${formatDate(h.createdAt, lang)}\n\n`;
        if (h.note) md += `**${t('reader.addNote')}:** ${h.note}\n\n`;
        md += '---\n\n';
      }
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `highlights-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    show(t('highlights.exported'), 'success');
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="text-2xl font-bold tracking-tight">{t('highlights.title')}</h1>
            <Button variant="secondary" size="sm" onClick={exportMarkdown} disabled={!visible.length}>
              ⬇ {t('highlights.exportMd')}
            </Button>
          </div>
          {booksWithHighlights.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              <button
                onClick={() => setBookFilter(null)}
                className={`px-3 py-2 rounded-full text-sm border whitespace-nowrap min-h-[40px] ${
                  !bookFilter ? 'bg-accent text-white border-accent' : 'bg-surface border-border'
                }`}
              >
                {t('highlights.allBooks')}
              </button>
              {booksWithHighlights.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBookFilter(b.id)}
                  className={`px-3 py-2 rounded-full text-sm border whitespace-nowrap min-h-[40px] ${
                    bookFilter === b.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'
                  }`}
                >
                  {b.title.slice(0, 24)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {visible.length === 0 ? (
          <EmptyState
            illustration={<NoteIllustration />}
            title={t('highlights.empty')}
            hint={t('highlights.emptyHint')}
          />
        ) : (
          <div className="space-y-4">
            {visible.map((h) => {
              const book = bookMap.get(h.bookId);
              return (
                <article key={h.id} className="bg-surface rounded-2xl border border-border p-4 shadow-card animate-fade-in">
                  <div className="flex items-start gap-3">
                    <span
                      className="w-1.5 self-stretch rounded-full shrink-0"
                      style={{ background: `var(--hl-${h.color})` }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <blockquote className="text-sm leading-relaxed">
                        «{h.text.length > 280 ? h.text.slice(0, 280) + '…' : h.text}»
                      </blockquote>
                      {h.note && (
                        <p className="text-sm text-muted mt-2 pl-3 border-l-2 border-border italic">
                          📝 {h.note}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <button
                          className="text-xs text-accent font-medium hover:underline min-h-[36px]"
                          onClick={() => navigate(`/read/${h.bookId}?page=${h.pageIndex}`)}
                        >
                          📖 {book?.title} · {t('highlights.page', { n: h.pageIndex + 1 })} →
                        </button>
                        <span className="text-xs text-muted">{formatDate(h.createdAt, lang)}</span>
                        <div className="flex gap-1 ml-auto">
                          <button
                            className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-accent-soft min-h-[36px]"
                            onClick={() => {
                              setEditing(h);
                              setNoteText(h.note);
                            }}
                          >
                            ✏️ {t('reader.addNote')}
                          </button>
                          <button
                            className="text-xs px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 min-h-[36px]"
                            onClick={() => void removeHighlight(h.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Редактирование заметки */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('reader.addNote')}>
        <textarea
          autoFocus
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          placeholder={t('reader.notePlaceholder')}
          className="w-full px-4 py-3 rounded-2xl border border-border bg-surface text-sm resize-none"
        />
        <div className="flex gap-2 mt-3">
          <Button
            className="flex-1"
            onClick={async () => {
              if (editing) await updateHighlight(editing.id, { note: noteText });
              setEditing(null);
              show(t('common.save'), 'success');
            }}
          >
            {t('common.save')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

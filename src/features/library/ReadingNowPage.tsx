import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/database';
import { useI18n } from '../../i18n';
import { ProgressBar } from '../../shared/ui/controls';
import { BooksIllustration, EmptyState } from '../../shared/ui/overlays';
import { Button } from '../../shared/ui/controls';
import { formatDate } from '../../shared/utils/format';

/** Экран «Читаю»: книги в процессе чтения, быстрое продолжение. */
export function ReadingNowPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const books =
    useLiveQuery(
      () => db.books.filter((b) => b.status === 'reading' || b.progress > 0).toArray(),
      [],
    ) ?? [];

  const sorted = [...books].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
  const current = sorted[0];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.reading')}</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {sorted.length === 0 ? (
          <EmptyState
            illustration={<BooksIllustration />}
            title={t('library.empty')}
            hint={t('library.emptyHint')}
            action={<Button onClick={() => navigate('/')}>{t('nav.library')} →</Button>}
          />
        ) : (
          <>
            {/* Главная карточка «продолжить» */}
            {current && (
              <button
                onClick={() => navigate(`/read/${current.id}`)}
                className="w-full text-left bg-surface rounded-3xl border border-border shadow-pop overflow-hidden flex gap-4 p-4 mb-6 active:scale-[.99] transition-transform"
              >
                <div className="w-24 h-32 rounded-xl bg-accent-soft overflow-hidden shrink-0">
                  {current.cover && (
                    <img
                      src={URL.createObjectURL(current.cover)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-xs text-accent font-medium mb-1">{t('library.continue')}</p>
                  <h2 className="font-semibold line-clamp-2">{current.title}</h2>
                  <p className="text-xs text-muted mt-1">
                    {t('reader.page', { n: Math.round(current.progress * current.pageCount) || 1, total: current.pageCount })}
                    {current.lastOpenedAt && ` · ${formatDate(current.lastOpenedAt, lang)}`}
                  </p>
                  <ProgressBar value={current.progress} className="mt-3" />
                </div>
              </button>
            )}

            <div className="space-y-3">
              {sorted.slice(1).map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/read/${b.id}`)}
                  className="w-full text-left bg-surface rounded-2xl border border-border p-4 flex items-center gap-3 hover:shadow-card transition-shadow"
                >
                  <div className="w-12 h-16 rounded-lg bg-accent-soft overflow-hidden shrink-0">
                    {b.cover && <img src={URL.createObjectURL(b.cover)} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm line-clamp-1">{b.title}</h3>
                    <p className="text-xs text-muted mt-0.5">{Math.round(b.progress * 100)}%</p>
                    <ProgressBar value={b.progress} className="mt-1.5" />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

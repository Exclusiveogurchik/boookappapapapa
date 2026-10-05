import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { gradeVocabWord, removeVocabFallback } from './vocabActions';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/controls';
import { EmptyState, NoteIllustration } from '../../shared/ui/overlays';
import { formatDate, plural } from '../../shared/utils/format';

/** Словарь: сохранённые слова + режим карточек для повторения. */
export function DictionaryPage() {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'list' | 'cards'>('list');

  const words = useLiveQuery(() => db.vocabulary.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const dueWords = useMemo(() => words.filter((w) => w.nextReview <= Date.now()), [words]);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('dict.title')}</h1>
            <p className="text-sm text-muted mt-0.5">
              {plural(words.length, ['слово', 'слова', 'слов'], lang)}
              {dueWords.length > 0 && ` · ${dueWords.length} ${t('dict.due')}`}
            </p>
          </div>
          <Button
            variant={mode === 'cards' ? 'primary' : 'secondary'}
            size="sm"
            disabled={!words.length}
            onClick={() => setMode((m) => (m === 'list' ? 'cards' : 'list'))}
          >
            {mode === 'list' ? `🃏 ${t('dict.review')}` : `📋 ${t('nav.dictionary')}`}
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {words.length === 0 ? (
          <EmptyState
            illustration={<NoteIllustration />}
            title={t('dict.empty')}
            hint={t('dict.emptyHint')}
          />
        ) : mode === 'list' ? (
          <div className="space-y-3">
            {words.map((w) => (
              <article key={w.id} className="bg-surface rounded-2xl border border-border p-4 shadow-card animate-fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{w.word}</h3>
                    {w.translation && <p className="text-sm text-accent">{w.translation}</p>}
                    {w.definition && <p className="text-sm text-muted mt-1 leading-relaxed">{w.definition}</p>}
                    {w.context && (
                      <p className="text-xs text-muted mt-2 italic line-clamp-2">…{w.context}…</p>
                    )}
                    <p className="text-[11px] text-muted mt-2">
                      {formatDate(w.createdAt, lang)} · {t('dict.due')}: {formatDate(w.nextReview, lang)}
                    </p>
                  </div>
                  <button
                    onClick={() => void removeVocabFallback(w.id)}
                    className="text-rose-600 text-xs px-2 py-1 rounded-lg hover:bg-rose-50 min-h-[36px]"
                    aria-label={t('dict.remove')}
                  >
                    🗑
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Flashcards words={dueWords.length ? dueWords : words} />
        )}
      </div>
    </div>
  );
}

/** Режим карточек: слово → ответ → самооценка (SM-2). */
function Flashcards({ words }: { words: { id: string; word: string; translation: string; definition: string }[] }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (idx >= words.length) {
    return (
      <EmptyState
        illustration={<NoteIllustration />}
        title={t('dict.done')}
        action={
          <Button onClick={() => { setIdx(0); setRevealed(false); }}>
            🔄 {t('dict.review')}
          </Button>
        }
      />
    );
  }

  const w = words[idx];

  return (
    <div className="max-w-md mx-auto animate-slide-up">
      <div className="bg-surface rounded-3xl border border-border shadow-pop p-8 text-center min-h-[280px] flex flex-col justify-center">
        <p className="text-xs text-muted mb-2">
          {idx + 1} / {words.length}
        </p>
        <h2 className="text-3xl font-bold">{w.word}</h2>
        {revealed ? (
          <div className="mt-5 space-y-2 animate-fade-in">
            {w.translation && <p className="text-lg text-accent">{w.translation}</p>}
            {w.definition && <p className="text-sm text-muted">{w.definition}</p>}
          </div>
        ) : (
          <p className="text-muted mt-5 text-sm">{t('dict.showAnswer')} 👇</p>
        )}
      </div>

      <div className="flex gap-2 mt-5">
        {!revealed ? (
          <Button className="flex-1" size="lg" onClick={() => setRevealed(true)}>
            {t('dict.showAnswer')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="flex-1" onClick={async () => {
              await gradeVocabWord(w.id, 'forgot');
              setIdx((i) => i + 1);
              setRevealed(false);
            }}>
              😕 {t('dict.forgot')}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={async () => {
              await gradeVocabWord(w.id, 'hard');
              setIdx((i) => i + 1);
              setRevealed(false);
            }}>
              🤔 {t('dict.hard')}
            </Button>
            <Button className="flex-1" onClick={async () => {
              await gradeVocabWord(w.id, 'good');
              setIdx((i) => i + 1);
              setRevealed(false);
            }}>
              😄 {t('dict.good')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

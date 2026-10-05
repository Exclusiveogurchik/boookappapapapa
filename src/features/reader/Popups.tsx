import React, { useEffect, useState } from 'react';
import type { HighlightColor } from '../../db/types';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/controls';
import { lookupWord, type WordInfo } from '../study/dictionaryApi';
import { addVocabWord } from '../../db/repositories';
import { useToast } from '../../shared/hooks/useToast';
import { askAnthropic, explainPrompt, summaryPrompt } from '../ai/aiClient';

/**
 * Всплывающие панели читалки: действия выделения и карточка слова.
 * Позиционируются возле выделения/слова (fixed, с ограничением по краям).
 */

const COLORS: { id: HighlightColor; label: string; bg: string }[] = [
  { id: 'yellow', label: '🟡', bg: 'var(--hl-yellow)' },
  { id: 'green', label: '🟢', bg: 'var(--hl-green)' },
  { id: 'blue', label: '🔵', bg: 'var(--hl-blue)' },
  { id: 'pink', label: '🌸', bg: 'var(--hl-pink)' },
];

export interface SelectionInfo {
  text: string;
  pageIndex: number;
  charStart: number;
  charEnd: number;
  rect: DOMRect;
}

function clampPosition(rect: DOMRect) {
  const w = Math.min(340, window.innerWidth - 24);
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  let top = rect.top - 12;
  // Панель над выделением; если не влезает — под ним
  const estimatedH = 220;
  if (top - estimatedH < 8) top = rect.bottom + estimatedH + 24;
  return { left, top, width: w };
}

/** Панель действий выделения: цвет, заметка, словарь, цитата, ИИ. */
export function SelectionPopup({
  sel,
  onClose,
  onHighlight,
  onNote,
  onQuote,
  onAiExplain,
  aiKey,
}: {
  sel: SelectionInfo;
  onClose: () => void;
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onQuote: () => void;
  onAiExplain: () => void;
  aiKey: string;
}) {
  const { t } = useI18n();
  const pos = clampPosition(sel.rect);
  return (
    <div
      className="fixed z-[60] animate-slide-up bg-surface rounded-2xl shadow-pop border border-border p-2"
      style={{ left: pos.left, top: undefined, bottom: window.innerHeight - pos.top + 12, width: pos.width }}
      role="toolbar"
      aria-label={t('reader.highlightColor')}
    >
      <div className="flex items-center gap-1 justify-between">
        {COLORS.map((c) => (
          <button
            key={c.id}
            title={t('reader.highlightColor')}
            aria-label={c.id}
            onClick={() => {
              onHighlight(c.id);
              onClose();
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg hover:scale-110 transition-transform"
            style={{ background: c.bg }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 mt-1.5">
        <button
          className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-accent-soft text-accent min-h-[44px]"
          onClick={() => {
            onNote();
          }}
        >
          📝 {t('reader.addNote')}
        </button>
        <button
          className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-accent-soft text-accent min-h-[44px]"
          onClick={() => {
            onQuote();
          }}
        >
          💬 {t('quotes.title')}
        </button>
        <button
          className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-accent-soft text-accent min-h-[44px]"
          onClick={() => {
            onAiExplain();
            onClose();
          }}
          title={aiKey ? t('reader.aiExplain') : t('reader.aiNoKey')}
        >
          ✨ {t('reader.aiExplain')}
        </button>
      </div>
    </div>
  );
}

/** Карточка слова: определение + перевод + «сохранить в словарь». */
export function WordPopup({
  word,
  rect,
  lang,
  bookId,
  context,
  onClose,
}: {
  word: string;
  rect: DOMRect;
  lang: string;
  bookId: string;
  context: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { show } = useToast();
  const [info, setInfo] = useState<WordInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const pos = clampPosition(rect);

  useEffect(() => {
    setLoading(true);
    lookupWord(word, lang)
      .then(setInfo)
      .finally(() => setLoading(false));
  }, [word, lang]);

  return (
    <div
      className="fixed z-[60] animate-slide-up bg-surface rounded-2xl shadow-pop border border-border p-4"
      style={{ left: pos.left, top: undefined, bottom: Math.max(12, window.innerHeight - pos.top + 12), width: pos.width }}
      role="dialog"
      aria-label={word}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-lg leading-tight">{info?.word ?? word}</p>
          {info?.phonetic && <p className="text-xs text-muted">{info.phonetic}</p>}
        </div>
        <button onClick={onClose} className="text-muted text-xl leading-none px-2 min-h-[36px]" aria-label={t('common.close')}>
          ×
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted mt-3 animate-pulse">{t('reader.loading')}</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {info?.translation && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t('reader.translation')}</p>
              <p className="text-sm">{info.translation}</p>
            </div>
          )}
          {info?.definition && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t('reader.definitions')}</p>
              <p className="text-sm leading-relaxed">{info.definition}</p>
            </div>
          )}
          {!info?.translation && !info?.definition && (
            <p className="text-sm text-muted">{t('reader.dictError')}</p>
          )}
          <Button
            size="sm"
            className="w-full"
            onClick={async () => {
              await addVocabWord({
                word: info?.word ?? word,
                definition: info?.definition ?? '',
                translation: info?.translation ?? '',
                context,
                bookId,
              });
              show(t('reader.savedToDict'), 'success');
              onClose();
            }}
          >
            ⭐ {t('reader.saveToDict')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Модалка ИИ-ответа («Объясни проще» / «Кратко о главе»). */
export function AiModal({
  open,
  onClose,
  title,
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  run: () => Promise<string>;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setResult('');
    setError('');
    setLoading(true);
    run()
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : t('reader.aiError')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-[70] ${open ? '' : 'hidden'}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-surface rounded-t-3xl sm:rounded-3xl shadow-pop p-6 max-w-lg w-full animate-slide-up">
        <h3 className="font-semibold text-lg mb-3">✨ {title}</h3>
        {loading && <p className="text-muted animate-pulse">{t('reader.aiThinking')}</p>}
        {error && <p className="text-rose-600 text-sm">{error}</p>}
        {result && <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{result}</div>}
        <Button variant="secondary" className="w-full mt-5" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

/** Запрос «Объясни проще» для выделенного текста. */
export function runExplain(apiKey: string, text: string): Promise<string> {
  return askAnthropic(apiKey, explainPrompt(text));
}

/** Запрос «Кратко о главе». */
export function runSummary(apiKey: string, text: string, title: string): Promise<string> {
  return askAnthropic(apiKey, summaryPrompt(text, title));
}

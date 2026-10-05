import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import {
  addBookmark,
  addHighlight,
  getPosition,
  removeBookmark,
  savePosition,
  updateBook,
  updateHighlight,
} from '../../db/repositories';
import type { Highlight, HighlightColor, ReadingMode, ThemeName } from '../../db/types';
import { ReflowView, type SearchHit, type TextSelection } from './ReflowView';
import { OriginalView } from './OriginalView';
import { SearchPanel, SettingsPanel, TocPanel } from './ReaderPanels';
import { AiModal, SelectionPopup, WordPopup, runExplain, runSummary, type SelectionInfo } from './Popups';
import { QuoteModal } from '../quotes/QuoteModal';
import { buildAutoToc, chapterForPage, chapterText, wordsInPages } from './chapters';
import { tts } from './tts';
import { useReadingTimer } from './useReadingTimer';
import { useSettings } from '../../shared/hooks/useSettings';
import { useHotkeys } from '../../shared/hooks/useHotkeys';
import { useI18n } from '../../i18n';
import { useToast } from '../../shared/hooks/useToast';
import { Button, Segmented } from '../../shared/ui/controls';
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ListIcon,
  PlayIcon,
  PauseIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  StopIcon,
  SunIcon,
} from '../../shared/ui/icons';
import { AVG_WPM } from '../../shared/utils/format';

/**
 * Страница-читалка: оркестрация режимов (reflow/оригинал), панелей,
 * выделений, озвучки, автосохранения позиции и статистики чтения.
 */
export function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { show } = useToast();
  const { settings, set } = useSettings();

  // ---------- Данные ----------
  const book = useLiveQuery(() => (id ? db.books.get(id) : undefined), [id]);
  const pages = useLiveQuery(() => (id ? db.pageTexts.where('bookId').equals(id).sortBy('pageIndex') : []), [id]) ?? [];
  const highlights = useLiveQuery(() => (id ? db.highlights.where('bookId').equals(id).toArray() : []), [id]) ?? [];
  const bookmarks = useLiveQuery(() => (id ? db.bookmarks.where('bookId').equals(id).toArray() : []), [id]) ?? [];

  // ---------- Состояние UI ----------
  const [mode, setMode] = useState<ReadingMode>('reflow');
  const [pageIndex, setPageIndex] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [focus, setFocus] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [panel, setPanel] = useState<'toc' | 'search' | 'settings' | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [wordInfo, setWordInfo] = useState<{ word: string; rect: DOMRect; context: string } | null>(null);
  const [noteTarget, setNoteTarget] = useState<SelectionInfo | null>(null);
  const [noteText, setNoteText] = useState('');
  const [quoteSel, setQuoteSel] = useState<SelectionInfo | null>(null);
  const [aiBox, setAiBox] = useState<{ title: string; run: () => Promise<string> } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentHit, setCurrentHit] = useState(-1);
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [ttsWord, setTtsWord] = useState<{ blockId: string; start: number; end: number } | null>(null);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  const posLoaded = useRef(false);

  // ---------- Оглавление ----------
  const toc = useMemo(() => {
    if (!book) return [];
    if (book.toc && book.toc.length > 0) return book.toc;
    return buildAutoToc(pages, book.pageCount);
  }, [book, pages]);
  const tocAuto = !book?.toc || book.toc.length === 0;

  // ---------- Кумулятивные слова (для таймера и оценок) ----------
  const wordsUpTo = useMemo(() => {
    const arr: number[] = [];
    let sum = 0;
    for (let i = 0; i < pages.length; i++) {
      arr[i] = sum;
      const pt = pages[i].plainText.trim();
      sum += pt ? pt.split(/\s+/).length : 0;
    }
    arr[pages.length] = sum;
    return arr;
  }, [pages]);
  const getWordsUpToPage = useCallback((p: number) => wordsUpTo[Math.min(p, pages.length)] ?? 0, [wordsUpTo, pages.length]);

  // ---------- Позиция чтения: восстановление ----------
  useEffect(() => {
    if (!id || !book || pages.length === 0 || posLoaded.current) return;
    posLoaded.current = true;
    const fromQuery = Number(searchParams.get('page'));
    if (!Number.isNaN(fromQuery) && searchParams.get('page') !== null) {
      setPageIndex(Math.min(Math.max(0, fromQuery), book.pageCount - 1));
      return;
    }
    void getPosition(id).then((pos) => {
      if (pos) {
        setMode(pos.mode);
        setPageIndex(pos.pageIndex);
        setScrollRatio(pos.scrollRatio);
      }
    });
  }, [id, book, pages.length, searchParams]);

  // ---------- Автосохранение позиции и прогресса ----------
  const savePos = useCallback(
    (page: number, ratio: number, m: ReadingMode) => {
      if (!id) return;
      void savePosition({ bookId: id, mode: m, pageIndex: page, scrollRatio: ratio, updatedAt: Date.now() });
      if (book && book.pageCount > 0) {
        const progress = Math.min(1, (page + 1) / book.pageCount);
        void updateBook(id, {
          progress: Math.max(book.progress, progress),
          lastOpenedAt: Date.now(),
          status: book.status === 'want' ? 'reading' : book.status === 'reading' && progress > 0.97 ? 'read' : book.status,
        });
      }
    },
    [id, book],
  );

  const onPageChange = useCallback(
    (page: number, ratio: number) => {
      setPageIndex(page);
      setScrollRatio(ratio);
      savePos(page, ratio, mode);
    },
    [savePos, mode],
  );

  // При уходе со страницы — финальное сохранение
  useEffect(() => {
    return () => {
      if (id && posLoaded.current) {
        void savePosition({ bookId: id, mode, pageIndex, scrollRatio, updatedAt: Date.now() });
      }
      tts.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  // Таймер активного чтения
  useReadingTimer(id ?? null, () => pageIndex, getWordsUpToPage);

  // ---------- Навигация по страницам ----------
  const flipPage = useCallback((delta: number) => {
    const fn = (window as unknown as { __reflowPage?: (d: number) => void }).__reflowPage;
    if (mode === 'reflow' && settings.pagination && fn) {
      fn(delta);
      return;
    }
    if (mode === 'reflow') {
      const el = document.querySelector<HTMLElement>('[data-testid="reflow-view"]');
      el?.scrollBy({ top: delta * (el.clientHeight * 0.92), behavior: 'smooth' });
    } else {
      const root = document.querySelector<HTMLElement>('[data-page]')?.parentElement?.parentElement;
      root?.scrollBy({ top: delta * 400, behavior: 'smooth' });
    }
    setPageIndex((p) => Math.min(Math.max(0, p + delta), (book?.pageCount ?? 1) - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settings.pagination, book?.pageCount]);

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.min(Math.max(0, p), (book?.pageCount ?? 1) - 1);
      setPageIndex(clamped);
      if (mode === 'reflow') {
        (window as unknown as { __reflowGoto?: (p: number) => void }).__reflowGoto?.(clamped);
      } else {
        (window as unknown as { __origGoto?: (p: number) => void }).__origGoto?.(clamped);
      }
    },
    [mode, book?.pageCount],
  );

  // ---------- Поиск по книге ----------
  const searchHits: (SearchHit & { snippet: string })[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: (SearchHit & { snippet: string })[] = [];
    for (const p of pages) {
      const text = p.plainText;
      let from = 0;
      while (out.length < 200) {
        const idx = text.toLowerCase().indexOf(q, from);
        if (idx < 0) break;
        const start = Math.max(0, idx - 35);
        const end = Math.min(text.length, idx + q.length + 35);
        out.push({
          pageIndex: p.pageIndex,
          charStart: idx,
          charEnd: idx + q.length,
          snippet: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
        });
        from = idx + q.length;
      }
    }
    return out;
  }, [searchQuery, pages]);

  useEffect(() => {
    if (searchHits.length) setCurrentHit(0);
    else setCurrentHit(-1);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Выделения ----------
  const handleSelection = useCallback((sel: TextSelection) => {
    setSelection({
      text: sel.text,
      pageIndex: sel.pageIndex,
      charStart: sel.charStart,
      charEnd: sel.charEnd,
      rect: sel.rect,
    });
  }, []);

  const makeHighlight = async (color: HighlightColor, note = '') => {
    if (!id || !selection) return;
    await addHighlight({
      bookId: id,
      pageIndex: selection.pageIndex,
      text: selection.text,
      color,
      note,
      charStart: selection.charStart,
      charEnd: selection.charEnd,
    });
    setSelection(null);
    show(t('common.save'), 'success');
  };

  // ---------- Слова (лексика) ----------
  const onWordLookup = useCallback(
    (word: string, rect: DOMRect) => {
      const page = pages.find((p) => p.pageIndex === pageIndex);
      const ctxText = page?.plainText ?? '';
      const idx = ctxText.toLowerCase().indexOf(word.toLowerCase());
      const context = idx >= 0 ? ctxText.slice(Math.max(0, idx - 60), idx + word.length + 60) : word;
      setWordInfo({ word, rect, context });
    },
    [pages, pageIndex],
  );

  // ---------- Закладки ----------
  const bookmarkHere = bookmarks.find((b) => b.pageIndex === pageIndex);
  const toggleBookmark = async () => {
    if (!id) return;
    if (bookmarkHere) {
      await removeBookmark(bookmarkHere.id);
      show(t('reader.bookmarkRemoved'), 'info');
    } else {
      const page = pages.find((p) => p.pageIndex === pageIndex);
      const label = page?.blocks[0]?.text.slice(0, 60) ?? `Стр. ${pageIndex + 1}`;
      await addBookmark(id, pageIndex, label);
      show(t('reader.bookmarked'), 'success');
    }
  };

  // ---------- Озвучка ----------
  const ttsBlocks = useMemo(() => {
    const out: { id: string; text: string }[] = [];
    for (const p of pages) {
      if (p.pageIndex < pageIndex) continue;
      for (const b of p.blocks) {
        out.push({ id: `${p.pageIndex}_${b.start}`, text: b.text });
      }
      if (out.length > 400) break;
    }
    return out;
  }, [pages, pageIndex]);

  const toggleTts = () => {
    if (ttsStatus === 'playing') {
      tts.pause();
      setTtsStatus('paused');
      return;
    }
    if (ttsStatus === 'paused') {
      tts.resume();
      setTtsStatus('playing');
      return;
    }
    tts.rate = settings.ttsRate;
    tts.voiceURI = settings.ttsVoiceURI;
    tts.start(ttsBlocks, 0, {
      onWord: (blockId, start, end) => setTtsWord({ blockId, start, end }),
      onBlockStart: (blockId) => {
        const page = Number(blockId.split('_')[0]);
        if (!Number.isNaN(page) && page !== pageIndex) setPageIndex(page);
      },
      onEnd: () => {
        setTtsStatus('idle');
        setTtsWord(null);
      },
    });
    tts.setSleepTimer(sleepMin);
    setTtsStatus('playing');
    setTtsOpen(false);
  };

  const stopTts = () => {
    tts.stop();
    setTtsStatus('idle');
    setTtsWord(null);
  };

  // ---------- Тема ----------
  const cycleTheme = () => {
    const order: ThemeName[] = ['light', 'sepia', 'dark', 'amoled', 'auto'];
    const idx = order.indexOf(settings.theme);
    set('theme', order[(idx + 1) % order.length]);
    show(`${t('reader.theme')}: ${t(`reader.theme.${order[(idx + 1) % order.length]}` as never)}`, 'info');
  };

  // ---------- Горячие клавиши ----------
  useHotkeys({
    arrowright: () => flipPage(1),
    arrowleft: () => flipPage(-1),
    ' ': () => flipPage(1),
    f: () => {
      setFocus((v) => !v);
      setMenuVisible(false);
    },
    '/': () => setPanel('search'),
    b: () => void toggleBookmark(),
    t: cycleTheme,
    r: () => set('rulerEnabled', !settings.rulerEnabled),
    o: () => setMode((m) => (m === 'reflow' ? 'original' : 'reflow')),
    escape: () => {
      setPanel(null);
      setSelection(null);
      setWordInfo(null);
    },
  });

  // ---------- Производные значения ----------
  const chapter = chapterForPage(toc, pageIndex);
  const minutesLeft = book ? Math.round((book.wordCount * (1 - book.progress)) / AVG_WPM) : 0;
  const chapterWordsLeft = chapter
    ? wordsInPages(pages, pageIndex, chapter.endPage === Infinity ? book?.pageCount ?? pageIndex : chapter.endPage)
    : 0;
  const chapterMinutes = Math.round(chapterWordsLeft / AVG_WPM);

  if (!book) {
    return (
      <div className="h-full flex items-center justify-center text-muted animate-pulse">{t('reader.loading')}</div>
    );
  }

  const chromeVisible = !focus || menuVisible;

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'var(--reader-bg)' }}>
      {/* ---------- Верхняя панель ---------- */}
      {chromeVisible && (
        <header className="absolute top-0 inset-x-0 z-30 bg-[var(--reader-bg)]/90 backdrop-blur-md border-b border-[var(--border)] animate-fade-in">
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              onClick={() => navigate('/')}
              aria-label={t('reader.back')}
              className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]"
            >
              <ChevronLeftIcon />
            </button>
            <div className="flex-1 min-w-0 px-1">
              <p className="text-sm font-semibold truncate">{book.title}</p>
              <p className="text-[11px] text-[var(--reader-muted)] truncate">
                {t('reader.page', { n: pageIndex + 1, total: book.pageCount })} · {Math.round(book.progress * 100)}%
                {minutesLeft > 0 && ` · ${t('reader.estLeft', { n: minutesLeft })}`}
              </p>
            </div>

            {/* Переключение режима одним тапом */}
            <Segmented
              className="w-[190px] hidden sm:flex"
              value={mode}
              onChange={(m) => {
                setMode(m);
                savePos(pageIndex, scrollRatio, m);
              }}
              options={[
                { value: 'reflow', label: t('reader.mode.reflow') },
                { value: 'original', label: t('reader.mode.original') },
              ]}
            />

            <button onClick={() => setPanel('toc')} aria-label={t('reader.toc')} title={t('reader.toc')}
              className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]">
              <ListIcon />
            </button>
            <button onClick={() => setPanel('search')} aria-label={t('reader.search')} title="/"
              className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]">
              <SearchIcon />
            </button>
            <button onClick={() => void toggleBookmark()} aria-label={t('reader.bookmark')} title="B"
              className={`p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] ${
                bookmarkHere ? 'text-amber-500' : ''
              }`}>
              <BookmarkIcon filled={!!bookmarkHere} />
            </button>
            <button onClick={() => setTtsOpen((v) => !v)} aria-label={t('reader.tts')}
              className={`p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] ${
                ttsStatus !== 'idle' ? 'text-accent' : ''
              }`}>
              {ttsStatus === 'playing' ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={() => setPanel('settings')} aria-label={t('reader.settings')}
              className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]">
              <SettingsIcon />
            </button>
            <button
              onClick={() => {
                setFocus((v) => !v);
                setMenuVisible(false);
              }}
              aria-label={t('reader.focus')}
              title="F"
              className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 min-h-[44px] min-w-[44px]"
            >
              <SunIcon />
            </button>
          </div>

          {/* Мобильное переключение режима */}
          <div className="px-3 pb-2 sm:hidden">
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                savePos(pageIndex, scrollRatio, m);
              }}
              options={[
                { value: 'reflow', label: t('reader.mode.reflow') },
                { value: 'original', label: t('reader.mode.original') },
              ]}
            />
          </div>

          {/* Предупреждение: скан без текстового слоя */}
          {!book.hasTextLayer && (
            <div className="px-4 pb-2.5 flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-xl mx-2 mb-2">
              <span className="flex-1 py-1.5">{t('reader.noTextLayer')}</span>
              <button
                className="underline font-medium whitespace-nowrap py-1.5"
                onClick={() => setMode('original')}
              >
                {t('reader.switchToOriginal')}
              </button>
            </div>
          )}

          {/* Обработка текста */}
          {pages.length === 0 && book.pageCount > 0 && (
            <div className="px-4 pb-2.5 text-xs text-[var(--reader-muted)]">
              {t('reader.processing', { n: Math.round((0 / book.pageCount) * 100) })}
            </div>
          )}
        </header>
      )}

      {/* ---------- Область чтения ---------- */}
      <main
        className={`flex-1 min-h-0 ${chromeVisible ? 'pt-[92px] sm:pt-[56px]' : ''} pb-[76px]`}
        onClick={(e) => {
          if (!focus) return;
          const x = e.clientX / window.innerWidth;
          if (x < 0.25) flipPage(-1);
          else if (x > 0.75) flipPage(1);
          else setMenuVisible((v) => !v);
        }}
      >
        {pages.length > 0 ? (
          mode === 'reflow' ? (
            <ReflowView
              pages={pages}
              settings={settings}
              highlights={highlights as Highlight[]}
              searchHits={searchHits}
              currentHitIndex={currentHit}
              ttsWord={ttsWord}
              rulerEnabled={settings.rulerEnabled}
              initialPage={pageIndex}
              initialScrollRatio={scrollRatio}
              onPageChange={onPageChange}
              onSelection={handleSelection}
              onWordLookup={onWordLookup}
            />
          ) : (
            <OriginalView
              file={book.file}
              pageCount={book.pageCount}
              initialPage={pageIndex}
              onPageChange={onPageChange}
              onSelection={handleSelection}
              onWordLookup={onWordLookup}
            />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">{t('reader.loading')}</div>
        )}
      </main>

      {/* ---------- Нижняя панель: быстрый переход ---------- */}
      {chromeVisible && (
        <footer className="absolute bottom-0 inset-x-0 z-30 bg-[var(--reader-bg)]/90 backdrop-blur-md border-t border-[var(--border)] px-4 pt-1 pb-[calc(8px+env(safe-area-inset-bottom,0))] animate-fade-in">
          <input
            type="range"
            min={0}
            max={Math.max(0, book.pageCount - 1)}
            value={pageIndex}
            aria-label={`${t('reader.page', { n: pageIndex + 1, total: book.pageCount })}`}
            onChange={(e) => goToPage(Number(e.target.value))}
          />
          <div className="flex justify-between text-[11px] text-[var(--reader-muted)] tabular-nums -mt-1">
            <span>№{pageIndex + 1}</span>
            <span>
              {Math.round(book.progress * 100)}%
              {chapter && chapterMinutes > 0 && ` · ${t('reader.estChapter', { n: chapterMinutes })}`}
            </span>
            <span>№{book.pageCount}</span>
          </div>
        </footer>
      )}

      {/* ---------- Зоны касания в режиме фокуса (подсказка) ---------- */}
      {focus && menuVisible && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 text-xs text-[var(--reader-muted)] bg-black/60 text-white px-4 py-2 rounded-full animate-fade-in pointer-events-none">
          {t('reader.focusOn')}
        </div>
      )}

      {/* ---------- Панели ---------- */}
      <TocPanel
        open={panel === 'toc'}
        onClose={() => setPanel(null)}
        toc={toc}
        currentPage={pageIndex}
        onGo={goToPage}
        auto={tocAuto}
      />
      <SearchPanel
        open={panel === 'search'}
        onClose={() => setPanel(null)}
        query={searchQuery}
        onQuery={setSearchQuery}
        resultsCount={searchHits.length}
        hits={searchHits}
        currentHit={currentHit}
        onHit={(i) => {
          setCurrentHit(i);
          const hit = searchHits[i];
          if (hit) goToPage(hit.pageIndex);
        }}
        onNavHit={(d) => {
          if (!searchHits.length) return;
          const next = (currentHit + d + searchHits.length) % searchHits.length;
          setCurrentHit(next);
          goToPage(searchHits[next].pageIndex);
        }}
      />
      <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} settings={settings} set={set} />

      {/* ---------- Панель озвучки ---------- */}
      {ttsOpen && (
        <div className="absolute z-40 bottom-[86px] right-3 w-[290px] bg-surface rounded-2xl shadow-pop border border-border p-4 animate-slide-up">
          <p className="font-semibold text-sm mb-3">🔊 {t('reader.tts')}</p>
          <div className="flex gap-2 mb-3">
            <Button size="sm" className="flex-1" onClick={toggleTts} icon={ttsStatus === 'playing' ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}>
              {ttsStatus === 'playing' ? t('reader.ttsPause') : t('reader.ttsPlay')}
            </Button>
            <Button size="sm" variant="secondary" onClick={stopTts} icon={<StopIcon className="w-4 h-4" />}>
              {t('reader.ttsStop')}
            </Button>
          </div>
          <label className="block text-xs text-muted mb-2">
            {t('reader.ttsSpeed')}: {settings.ttsRate}×
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.ttsRate}
              onChange={(e) => {
                const v = Number(e.target.value);
                set('ttsRate', v);
                tts.rate = v;
              }}
            />
          </label>
          <label className="block text-xs text-muted mb-2">
            {t('reader.ttsVoice')}
            <select
              className="w-full mt-1 px-2 py-2 rounded-xl border border-border bg-surface text-xs"
              value={settings.ttsVoiceURI}
              onChange={(e) => {
                set('ttsVoiceURI', e.target.value);
                tts.voiceURI = e.target.value;
              }}
            >
              <option value="">—</option>
              {typeof speechSynthesis !== 'undefined' &&
                speechSynthesis.getVoices().map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            {t('reader.ttsSleep')}
            <select
              className="w-full mt-1 px-2 py-2 rounded-xl border border-border bg-surface text-xs"
              value={sleepMin ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value) || null;
                setSleepMin(v);
                tts.setSleepTimer(v);
              }}
            >
              <option value={0}>{t('reader.ttsOff')}</option>
              <option value={15}>{t('reader.tts15')}</option>
              <option value={30}>{t('reader.tts30')}</option>
              <option value={60}>{t('reader.tts60')}</option>
            </select>
          </label>
        </div>
      )}

      {/* ---------- Попап выделения ---------- */}
      {selection && (
        <SelectionPopup
          sel={selection}
          aiKey={settings.anthropicApiKey}
          onClose={() => setSelection(null)}
          onHighlight={(color) => void makeHighlight(color)}
          onNote={() => {
            setNoteTarget(selection);
            setNoteText('');
            setSelection(null);
          }}
          onQuote={() => {
            setQuoteSel(selection);
            setSelection(null);
          }}
          onAiExplain={() => {
            if (!settings.anthropicApiKey) {
              show(t('reader.aiNoKey'), 'error');
              return;
            }
            const text = selection.text;
            setAiBox({ title: t('reader.aiExplain'), run: () => runExplain(settings.anthropicApiKey, text) });
          }}
        />
      )}

      {/* ---------- Попап слова ---------- */}
      {wordInfo && (
        <WordPopup
          word={wordInfo.word}
          rect={wordInfo.rect}
          lang={lang}
          bookId={book.id}
          context={wordInfo.context}
          onClose={() => setWordInfo(null)}
        />
      )}

      {/* ---------- Заметка к выделению ---------- */}
      {noteTarget && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNoteTarget(null)} />
          <div className="relative bg-surface rounded-t-3xl sm:rounded-3xl shadow-pop p-5 w-full max-w-lg animate-slide-up">
            <h3 className="font-semibold mb-2">📝 {t('reader.addNote')}</h3>
            <p className="text-xs text-muted line-clamp-2 mb-3">«{noteTarget.text.slice(0, 120)}»</p>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t('reader.notePlaceholder')}
              rows={4}
              className="w-full px-4 py-3 rounded-2xl border border-border bg-surface text-sm resize-none"
            />
            <div className="flex gap-2 mt-3">
              <Button
                className="flex-1"
                onClick={async () => {
                  const sel = noteTarget;
                  setNoteTarget(null);
                  setSelection(sel);
                  await makeHighlight('yellow', noteText);
                }}
              >
                {t('common.save')}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setNoteTarget(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Кнопка «Кратко о главе» (в режиме фокуса скрыта) ---------- */}
      {chromeVisible && settings.anthropicApiKey && chapter && (
        <button
          onClick={() =>
            setAiBox({
              title: t('reader.aiSummary'),
              run: () =>
                runSummary(
                  settings.anthropicApiKey,
                  chapterText(pages, chapter.item.pageIndex, chapter.endPage === Infinity ? book.pageCount : chapter.endPage),
                  book.title,
                ),
            })
          }
          className="absolute z-20 left-3 bottom-[92px] px-3.5 py-2.5 rounded-full bg-accent text-white text-xs font-medium shadow-pop flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <SparklesIcon className="w-4 h-4" />
          {t('reader.aiSummary')}
        </button>
      )}

      {/* ---------- Модалки ---------- */}
      {quoteSel && (
        <QuoteModal
          open
          onClose={() => setQuoteSel(null)}
          text={quoteSel.text}
          bookTitle={book.title}
          author={book.author}
        />
      )}
      {aiBox && (
        <AiModal open onClose={() => setAiBox(null)} title={aiBox.title} run={aiBox.run} />
      )}
    </div>
  );
}

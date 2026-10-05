import { useEffect, useRef } from 'react';
import { recordSession } from '../../db/repositories';

/**
 * Учёт времени активного чтения: тикает только при активности
 * (скролл/тап/клавиши за последние 60 секунд) и видимой вкладке.
 * Прогресс страниц и слов буферизуется и пишется в sessions.
 */
export function useReadingTimer(
  bookId: string | null,
  getPage: () => number,
  getWordsUpToPage: (page: number) => number,
) {
  const lastActivity = useRef(Date.now());
  const secondsBuf = useRef(0);
  // Геттеры держим в ref, чтобы таймер видел актуальные значения
  const getPageRef = useRef(getPage);
  const getWordsRef = useRef(getWordsUpToPage);
  getPageRef.current = getPage;
  getWordsRef.current = getWordsUpToPage;

  // Контрольные точки сессии
  const startPage = useRef(0);
  const maxPage = useRef(0);
  const startWords = useRef(0);
  const inited = useRef(false);

  useEffect(() => {
    if (!bookId) return;

    const initIfNeeded = () => {
      if (!inited.current) {
        inited.current = true;
        startPage.current = getPageRef.current();
        maxPage.current = getPageRef.current();
        startWords.current = getWordsRef.current(getPageRef.current());
      }
    };

    const touch = () => {
      lastActivity.current = Date.now();
      initIfNeeded();
      maxPage.current = Math.max(maxPage.current, getPageRef.current());
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));

    /** Пишет накопленную сессию: секунды, новые страницы, новые слова. */
    const flush = async () => {
      if (secondsBuf.current <= 0) return;
      initIfNeeded();
      const curPage = getPageRef.current();
      maxPage.current = Math.max(maxPage.current, curPage);
      const wordsNow = getWordsRef.current(curPage);

      const seconds = secondsBuf.current;
      const pagesRead = Math.max(0, maxPage.current - startPage.current);
      const wordsRead = Math.max(0, wordsNow - startWords.current);
      secondsBuf.current = 0;

      // Сдвигаем контрольные точки, чтобы не считать одно и то же дважды
      startPage.current = maxPage.current;
      startWords.current = wordsNow;

      await recordSession(bookId, seconds, pagesRead, wordsRead).catch(() => {});
    };

    // Тик каждые 15 с: +15 с, если была активность
    const iv = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivity.current < 60_000) {
        secondsBuf.current += 15;
        if (secondsBuf.current >= 45) void flush();
      }
    }, 15_000);

    const onVisibility = () => {
      if (document.hidden) void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisibility);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);
}

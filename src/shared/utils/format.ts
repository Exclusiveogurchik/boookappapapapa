/** Форматирование чисел, дат, оценок времени чтения. */

export function formatMinutes(min: number, t: (k: never, p?: never) => string): string {
  void t;
  return String(Math.round(min));
}

export function formatDate(ts: number, lang: string): string {
  return new Date(ts).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(seconds: number, lang: string): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (lang === 'ru') {
    if (h > 0) return `${h} ч ${mm} мин`;
    return `${m} мин`;
  }
  if (h > 0) return `${h}h ${mm}m`;
  return `${m}m`;
}

/** Оценка скорости чтения: ~200 слов/мин по умолчанию. */
export const AVG_WPM = 200;

export function estimateMinutesLeft(wordsTotal: number, progress: number): number {
  return Math.max(0, Math.round(((wordsTotal * (1 - progress)) / AVG_WPM) | 0));
}

export function plural(n: number, forms: [string, string, string], lang: string): string {
  if (lang !== 'ru') return `${n} ${forms[1]}`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${forms[1]}`;
  return `${n} ${forms[2]}`;
}

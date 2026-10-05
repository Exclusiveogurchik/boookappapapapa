import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useI18n } from '../../i18n';
import { useSettings } from '../../shared/hooks/useSettings';
import { ChartIllustration, EmptyState } from '../../shared/ui/overlays';
import { Segmented, Slider } from '../../shared/ui/controls';
import { formatDuration, plural } from '../../shared/utils/format';

/** Экран статистики: время, страницы, слова, streak, цели и графики. */
export function StatsPage() {
  const { t, lang } = useI18n();
  const { settings, set } = useSettings();
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const books = useLiveQuery(() => db.books.toArray(), []) ?? [];

  // Агрегация по дням
  const days = useMemo(() => {
    const n = period === 'week' ? 7 : 30;
    const map = new Map<string, { date: string; seconds: number; pages: number; words: number }>();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, seconds: 0, pages: 0, words: 0 });
    }
    for (const s of sessions) {
      const rec = map.get(s.date);
      if (rec) {
        rec.seconds += s.seconds;
        rec.pages += s.pagesRead;
        rec.words += s.wordsRead;
      }
    }
    return [...map.values()];
  }, [sessions, period]);

  const today = new Date().toISOString().slice(0, 10);
  const todayRec = days.find((d) => d.date === today) ?? { date: today, seconds: 0, pages: 0, words: 0 };
  const todayMinutes = Math.round(todayRec.seconds / 60);

  // Streak: дни подряд с активностью, включая сегодня
  const streak = useMemo(() => {
    const active = new Set(sessions.map((s) => s.date));
    let count = 0;
    const d = new Date();
    // Вчера тоже считается, если сегодня ещё не было чтения
    if (!active.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (active.has(d.toISOString().slice(0, 10))) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [sessions]);

  const totalSeconds = sessions.reduce((s, x) => s + x.seconds, 0);
  const totalWords = sessions.reduce((s, x) => s + x.wordsRead, 0);
  const speed = totalSeconds > 300 ? Math.round(totalWords / (totalSeconds / 60)) : 0;

  const maxMin = Math.max(1, ...days.map((d) => d.seconds / 60));
  const maxPages = Math.max(1, ...days.map((d) => d.pages));
  const goalDone = todayMinutes >= settings.dailyGoalMinutes;

  // ---------- SVG-графики ----------
  const BarChart = ({ data, color, unit }: { data: number[]; color: string; unit: string }) => (
    <div className="flex items-end gap-[3px] h-36" role="img" aria-label={unit}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md transition-all duration-500 min-h-[3px]"
            style={{
              height: `${Math.max(2, (v / Math.max(...data, 1)) * 120)}px`,
              background: color,
              opacity: 0.45 + 0.55 * (v / Math.max(...data, 1)),
            }}
            title={`${Math.round(v * 10) / 10} ${unit}`}
          />
        </div>
      ))}
    </div>
  );

  const hasData = sessions.length > 0;

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{t('stats.title')}</h1>
        </div>
      </header>

      {!hasData ? (
        <EmptyState
          illustration={<ChartIllustration />}
          title={t('stats.empty')}
          hint={t('library.emptyHint')}
        />
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
          {/* Карточки дня */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={t('stats.today')}
              value={`${todayMinutes}`}
              unit={t('stats.min')}
              highlight={goalDone}
            />
            <StatCard label={t('stats.pages')} value={`${todayRec.pages}`} unit={t('stats.pages')} />
            <StatCard label={t('stats.words')} value={`${todayRec.words}`} unit={t('stats.words')} />
            <StatCard label={t('stats.streak')} value={`${streak}`} unit={t('stats.streakUnit')} emoji="🔥" />
          </div>

          {/* Цель */}
          <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">{t('stats.goal')}</h2>
              {goalDone && <span className="text-sm text-emerald-600 font-medium">{t('stats.goalReached')}</span>}
            </div>
            <div className="flex items-center gap-4">
              {/* Кольцо прогресса */}
              <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" strokeWidth="8" />
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke={goalDone ? '#10b981' : 'var(--accent)'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(1, todayMinutes / settings.dailyGoalMinutes) * 188} 188`}
                  transform="rotate(-90 36 36)"
                  style={{ transition: 'stroke-dasharray .6s ease' }}
                />
                <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--fg)">
                  {Math.min(100, Math.round((todayMinutes / settings.dailyGoalMinutes) * 100))}%
                </text>
              </svg>
              <div className="flex-1">
                <Slider
                  label={t('settings.goal')}
                  value={settings.dailyGoalMinutes}
                  min={5}
                  max={120}
                  step={5}
                  suffix={` ${t('stats.min')}`}
                  onChange={(v) => set('dailyGoalMinutes', v)}
                />
              </div>
            </div>
          </section>

          {/* Графики */}
          <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{t('stats.timeChart')}</h2>
              <Segmented
                className="w-[180px]"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: 'week', label: t('stats.week') },
                  { value: 'month', label: t('stats.month') },
                ]}
              />
            </div>
            <BarChart data={days.map((d) => d.seconds / 60)} color="var(--accent)" unit={t('stats.min')} />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>{days[0]?.date.slice(5)}</span>
              <span>{days[days.length - 1]?.date.slice(5)}</span>
            </div>
          </section>

          <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
            <h2 className="font-semibold mb-4">{t('stats.pagesChart')}</h2>
            <BarChart data={days.map((d) => d.pages)} color="#10b981" unit={t('stats.pages')} />
          </section>

          {/* Итоги */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('stats.totalTime')} value={formatDuration(totalSeconds, lang)} />
            <StatCard label={t('stats.totalBooks')} value={plural(books.length, ['книга', 'книги', 'книг'], lang)} />
            <StatCard label={t('stats.speed')} value={speed ? `${speed}` : '—'} unit={speed ? t('stats.wpm') : ''} />
            <StatCard
              label={t('stats.avgPerDay')}
              value={`${Math.round(days.reduce((s, d) => s + d.seconds / 60, 0) / days.length)}`}
              unit={t('stats.min')}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  highlight,
  emoji,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  emoji?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-card ${
        highlight ? 'border-emerald-400 bg-emerald-500/10' : 'border-border bg-surface'
      }`}
    >
      <p className="text-xs text-muted">{emoji ? `${emoji} ` : ''}{label}</p>
      <p className="text-2xl font-bold mt-1 leading-tight">
        {value}
        {unit && <span className="text-sm font-medium text-muted ml-1">{unit}</span>}
      </p>
    </div>
  );
}

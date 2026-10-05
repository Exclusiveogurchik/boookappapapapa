import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useSettings } from '../../shared/hooks/useSettings';
import { useToast } from '../../shared/hooks/useToast';
import { Button, Segmented, Slider } from '../../shared/ui/controls';
import type { ThemeName } from '../../db/types';
import { exportBackup, importBackup } from '../notes/backup';

/** Настройки: язык, тема, цели, ИИ-ключ, резервная копия. */
export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { settings, set } = useSettings();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4">
          <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Язык */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-3">🌍 {t('settings.language')}</h2>
          <Segmented
            value={lang}
            onChange={setLang}
            options={[
              { value: 'ru', label: 'Русский' },
              { value: 'en', label: 'English' },
            ]}
          />
        </section>

        {/* Тема */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-3">🎨 {t('settings.theme')}</h2>
          <Segmented
            value={settings.theme}
            onChange={(v) => set('theme', v as ThemeName)}
            options={[
              { value: 'light', label: `☀️ ${t('reader.theme.light')}` },
              { value: 'sepia', label: `📜 ${t('reader.theme.sepia')}` },
              { value: 'dark', label: `🌙 ${t('reader.theme.dark')}` },
              { value: 'amoled', label: `⚫ ${t('reader.theme.amoled')}` },
              { value: 'auto', label: `A ${t('reader.theme.auto')}` },
            ]}
          />
        </section>

        {/* Цель */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-3">🎯 {t('stats.goal')}</h2>
          <Slider
            label={t('settings.goal')}
            value={settings.dailyGoalMinutes}
            min={5}
            max={120}
            step={5}
            suffix={` ${t('stats.min')}`}
            onChange={(v) => set('dailyGoalMinutes', v)}
          />
        </section>

        {/* ИИ */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-1">✨ {t('settings.ai')}</h2>
          <p className="text-xs text-muted mb-3">{t('settings.apiKeyHint')}</p>
          <input
            type="password"
            value={settings.anthropicApiKey}
            onChange={(e) => set('anthropicApiKey', e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-2xl border border-border bg-surface text-sm"
            aria-label={t('settings.apiKey')}
          />
        </section>

        {/* Словарь */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card flex items-center justify-between">
          <div>
            <h2 className="font-semibold">📚 {t('dict.title')}</h2>
            <p className="text-xs text-muted mt-0.5">{t('dict.emptyHint')}</p>
          </div>
          <Link to="/dictionary">
            <Button variant="secondary" size="sm">{t('nav.dictionary')} →</Button>
          </Link>
        </section>

        {/* Бэкап */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-1">💾 {t('backup.title')}</h2>
          <p className="text-xs text-muted mb-4">{t('backup.exportHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportBackup()}>
              ⬇ {t('backup.export')}
            </Button>
            <Button variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}>
              ⬆ {t('backup.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setImporting(true);
                try {
                  const n = await importBackup(f);
                  show(t('backup.imported', { n }), 'success');
                } catch (err) {
                  const msg = String(err);
                  show(msg.includes('QuotaExceeded') ? t('backup.quota') : t('backup.importError'), 'error');
                } finally {
                  setImporting(false);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </section>

        {/* О приложении */}
        <section className="bg-surface rounded-2xl border border-border p-5 shadow-card">
          <h2 className="font-semibold mb-2">ℹ️ {t('settings.about')}</h2>
          <p className="text-sm text-muted leading-relaxed">{t('settings.aboutText')}</p>
          <p className="text-xs text-muted mt-3">
            ⌨️ {lang === 'ru' ? 'Горячие клавиши:' : 'Shortcuts:'} ←/→ {lang === 'ru' ? 'страницы' : 'pages'} · F{' '}
            {t('reader.focus')} · / {t('reader.search')} · B {t('reader.bookmark')} · T {t('reader.theme')} · R{' '}
            {t('reader.ruler')} · O {t('reader.mode.original')}
          </p>
        </section>
      </div>
    </div>
  );
}

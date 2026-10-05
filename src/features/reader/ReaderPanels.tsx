import React from 'react';
import type { AppSettings, ThemeName, TocItem } from '../../db/types';
import { useI18n } from '../../i18n';
import { Button, Segmented, Slider, Toggle } from '../../shared/ui/controls';
import { XIcon } from '../../shared/ui/icons';

/** Выдвижные панели читалки: оглавление, поиск, настройки, озвучка. */

export function Panel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} aria-hidden />
      <div className="fixed z-50 top-0 right-0 h-full w-full max-w-sm bg-surface shadow-pop animate-fade-in flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-full text-muted hover:bg-accent-soft min-h-[44px] min-w-[44px]"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-8">{children}</div>
      </div>
    </>
  );
}

/** Оглавление: outline PDF или авто-главы. */
export function TocPanel({
  open,
  onClose,
  toc,
  currentPage,
  onGo,
  auto,
}: {
  open: boolean;
  onClose: () => void;
  toc: TocItem[];
  currentPage: number;
  onGo: (page: number) => void;
  auto: boolean;
}) {
  const { t } = useI18n();
  return (
    <Panel open={open} onClose={onClose} title={t('reader.toc')}>
      {auto && toc.length > 0 && (
        <p className="text-xs text-muted mb-3">📖 {t('reader.chapterAuto')}</p>
      )}
      <nav className="space-y-1">
        {toc.map((item, i) => {
          const active =
            item.pageIndex <= currentPage &&
            (toc[i + 1]?.pageIndex ?? Infinity) > currentPage;
          return (
            <button
              key={i}
              onClick={() => {
                onGo(item.pageIndex);
                onClose();
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm min-h-[44px] ${
                active ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-accent-soft/50'
              }`}
              style={{ paddingLeft: 12 + item.level * 16 }}
            >
              <span className="tabular-nums text-muted mr-2">{item.pageIndex + 1}</span>
              {item.title}
            </button>
          );
        })}
      </nav>
    </Panel>
  );
}

/** Поиск по книге. */
export function SearchPanel({
  open,
  onClose,
  query,
  onQuery,
  resultsCount,
  hits,
  currentHit,
  onHit,
  onNavHit,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (q: string) => void;
  resultsCount: number;
  hits: { pageIndex: number; snippet: string }[];
  currentHit: number;
  onHit: (i: number) => void;
  onNavHit: (delta: number) => void;
}) {
  const { t } = useI18n();
  return (
    <Panel open={open} onClose={onClose} title={t('reader.search')}>
      <input
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t('reader.searchPlaceholder')}
        className="w-full px-4 py-3 rounded-2xl bg-surface border border-border text-sm mb-3"
      />
      {query.trim().length >= 2 && (
        <>
          <div className="flex items-center justify-between text-sm text-muted mb-2">
            <span>{t('reader.searchResults', { n: resultsCount })}</span>
            {resultsCount > 0 && (
              <div className="flex gap-1">
                <button onClick={() => onNavHit(-1)} className="px-2 py-1 rounded-lg hover:bg-accent-soft min-h-[36px]">
                  ↑
                </button>
                <button onClick={() => onNavHit(1)} className="px-2 py-1 rounded-lg hover:bg-accent-soft min-h-[36px]">
                  ↓
                </button>
              </div>
            )}
          </div>
          {resultsCount === 0 ? (
            <p className="text-muted text-sm py-6 text-center">{t('reader.noResults')}</p>
          ) : (
            <div className="space-y-1">
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onHit(i);
                    onClose();
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm ${
                    i === currentHit ? 'bg-accent-soft text-accent' : 'hover:bg-accent-soft/50'
                  }`}
                >
                  <span className="text-xs text-muted block mb-0.5">№{i + 1}</span>
                  {h.snippet}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/** Настройки чтения. */
export function SettingsPanel({
  open,
  onClose,
  settings,
  set,
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
}) {
  const { t } = useI18n();
  return (
    <Panel open={open} onClose={onClose} title={t('reader.settings')}>
      <div className="space-y-5">
        <Slider label={t('reader.fontSize')} value={settings.fontSize} min={14} max={32} suffix=" px"
          onChange={(v) => set('fontSize', v)} />
        <Slider label={t('reader.lineHeight')} value={settings.lineHeight} min={1.2} max={2.4} step={0.1}
          onChange={(v) => set('lineHeight', v)} />
        <Slider label={t('reader.margins')} value={Math.round(settings.margins * 100)} min={0} max={30} suffix="%"
          onChange={(v) => set('margins', v / 100)} />

        <div>
          <p className="text-sm text-muted mb-2">{t('reader.font')}</p>
          <Segmented
            value={settings.fontFamily}
            onChange={(v) => set('fontFamily', v)}
            options={[
              { value: 'serif', label: 'Aa' },
              { value: 'sans', label: 'Aa' },
              { value: 'mono', label: 'Aa' },
              { value: 'dys', label: 'Aa' },
            ]}
          />
          <div className="flex justify-between text-[11px] text-muted mt-1 px-1">
            <span>{t('reader.font.serif')}</span>
            <span>{t('reader.font.sans')}</span>
            <span>{t('reader.font.mono')}</span>
            <span>{t('reader.font.dys')}</span>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted mb-2">{t('reader.align')}</p>
          <Segmented
            value={settings.textAlign}
            onChange={(v) => set('textAlign', v)}
            options={[
              { value: 'left', label: t('reader.align.left') },
              { value: 'justify', label: t('reader.align.justify') },
            ]}
          />
        </div>

        <div>
          <p className="text-sm text-muted mb-2">{t('reader.scroll')} / {t('reader.pagination')}</p>
          <Segmented
            value={settings.pagination ? 'pagination' : 'scroll'}
            onChange={(v) => set('pagination', v === 'pagination')}
            options={[
              { value: 'scroll', label: t('reader.scroll') },
              { value: 'pagination', label: t('reader.pagination') },
            ]}
          />
        </div>

        <div>
          <p className="text-sm text-muted mb-2">{t('reader.theme')}</p>
          <Segmented
            value={settings.theme}
            onChange={(v) => set('theme', v as ThemeName)}
            options={[
              { value: 'light', label: '☀️' },
              { value: 'sepia', label: '📜' },
              { value: 'dark', label: '🌙' },
              { value: 'amoled', label: '⚫' },
              { value: 'auto', label: 'A' },
            ]}
          />
        </div>

        <Toggle checked={settings.rulerEnabled} onChange={(v) => set('rulerEnabled', v)} label={t('reader.ruler')} />
      </div>
    </Panel>
  );
}

/** Экспорт/бэкап утилиты вынесены в notes/backup — здесь только кнопки. */
export function QuickActions() {
  return null as React.ReactElement | null;
}

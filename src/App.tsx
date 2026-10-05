import React from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsProvider, useApplyTheme } from './shared/hooks/useSettings';
import { ToastProvider } from './shared/hooks/useToast';
import { I18nProvider, useI18n } from './i18n';
import { LibraryPage } from './features/library/LibraryPage';
import { ReadingNowPage } from './features/library/ReadingNowPage';
import { ReaderPage } from './features/reader/ReaderPage';
import { HighlightsPage } from './features/notes/HighlightsPage';
import { StatsPage } from './features/stats/StatsPage';
import { DictionaryPage } from './features/study/DictionaryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import {
  BookIcon,
  ChartIcon,
  HighlightIcon,
  ReadIcon,
  SettingsIcon,
} from './shared/ui/icons';

/**
 * Оболочка приложения: роутер + нижняя навигация (mobile-first)
 * + десктопная боковая навигация. Читалка открывается без навигации.
 */

function BottomNav() {
  const { t } = useI18n();
  const items = [
    { to: '/', icon: BookIcon, label: t('nav.library'), end: true },
    { to: '/reading', icon: ReadIcon, label: t('nav.reading') },
    { to: '/highlights', icon: HighlightIcon, label: t('nav.highlights') },
    { to: '/stats', icon: ChartIcon, label: t('nav.stats') },
    { to: '/settings', icon: SettingsIcon, label: t('nav.settings') },
  ];
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-bg/90 backdrop-blur-lg border-t border-border pb-safe"
      aria-label="Main"
    >
      <div className="max-w-2xl mx-auto flex">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors min-h-[56px] justify-center ${
                isActive ? 'text-accent' : 'text-muted hover:text-fg'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Shell() {
  const location = useLocation();
  useApplyTheme();
  const isReader = location.pathname.startsWith('/read/');

  return (
    <div className="h-full flex flex-col">
      {!isReader && (
        <div className="flex-1 min-h-0 overflow-y-auto pb-20">
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/reading" element={<ReadingNowPage />} />
            <Route path="/highlights" element={<HighlightsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/dictionary" element={<DictionaryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<LibraryPage />} />
          </Routes>
        </div>
      )}
      {isReader && (
        <div className="flex-1 min-h-0">
          <Routes>
            <Route path="/read/:id" element={<ReaderPage />} />
          </Routes>
        </div>
      )}
      {!isReader && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <I18nProvider>
        <ToastProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </ToastProvider>
      </I18nProvider>
    </SettingsProvider>
  );
}

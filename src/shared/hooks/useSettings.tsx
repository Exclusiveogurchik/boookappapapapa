import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { loadSettings, saveSetting } from '../../db/repositories';
import { DEFAULT_SETTINGS, type AppSettings, type ThemeName } from '../../db/types';

/** Глобальные настройки приложения, персистятся в Dexie. */

interface SettingsCtx {
  settings: AppSettings;
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  ready: boolean;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  set: () => {},
  ready: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      void saveSetting(key, value);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, set, ready }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

/** Вычисляет реальную тему с учётом «авто» (по времени суток: 7–19 — светлая). */
export function resolveTheme(theme: ThemeName): Exclude<ThemeName, 'auto'> {
  if (theme !== 'auto') return theme;
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? 'light' : 'dark';
}

/** Применяет тему к <html data-theme> и metа-цвету. */
export function useApplyTheme() {
  const { settings } = useSettings();
  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(settings.theme);
      document.documentElement.setAttribute('data-theme', t);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', t === 'light' ? '#f8fafc' : t === 'sepia' ? '#f4ecd8' : t === 'amoled' ? '#000000' : '#0f172a');
      }
    };
    apply();
    // «Авто» пересматривается раз в минуту
    const iv = setInterval(apply, 60_000);
    return () => clearInterval(iv);
  }, [settings.theme]);
}

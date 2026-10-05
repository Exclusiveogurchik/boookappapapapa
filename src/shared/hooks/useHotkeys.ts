import { useEffect, useRef } from 'react';

/** Глобальные горячие клавиши (десктоп). Не срабатывает внутри полей ввода. */
export function useHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  enabled = true,
) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      const fn = mapRef.current[e.key.toLowerCase()] ?? mapRef.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

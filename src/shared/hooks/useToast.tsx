import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircleIcon, ExclamationIcon, XIcon } from '../ui/icons';

/** Лёгкие тосты-уведомления. */

interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
}

const Ctx = createContext<{ show: (text: string, kind?: Toast['kind']) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center px-4 w-full max-w-md">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-slide-up flex items-center gap-2 px-4 py-3 rounded-2xl shadow-pop text-sm font-medium text-white ${
              t.kind === 'success' ? 'bg-emerald-600' : t.kind === 'error' ? 'bg-rose-600' : 'bg-slate-800'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircleIcon className="w-5 h-5 shrink-0" />
            ) : t.kind === 'error' ? (
              <ExclamationIcon className="w-5 h-5 shrink-0" />
            ) : null}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

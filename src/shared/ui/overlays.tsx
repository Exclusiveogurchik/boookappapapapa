import React, { useEffect } from 'react';
import { XIcon } from './icons';
import { useI18n } from '../../i18n';

/** Модальное окно (mobile-first: нижний лист на мобильных, центр на десктопе). */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-surface w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-pop animate-slide-up flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="ml-auto p-2 -mr-2 rounded-full text-muted hover:bg-accent-soft min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Пустое состояние с иллюстрацией и подсказкой. */
export function EmptyState({
  illustration,
  title,
  hint,
  action,
}: {
  illustration?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      {illustration && <div className="mb-5 opacity-90">{illustration}</div>}
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      {hint && <p className="text-muted max-w-sm leading-relaxed mb-5">{hint}</p>}
      {action}
    </div>
  );
}

/** Декоративная иллюстрация стопки книг (SVG). */
export function BooksIllustration() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none" aria-hidden>
      <rect x="18" y="66" width="104" height="18" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <rect x="28" y="46" width="84" height="18" rx="4" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />
      <rect x="38" y="26" width="64" height="18" rx="4" fill="var(--accent)" opacity="0.85" />
      <circle cx="112" cy="24" r="10" fill="var(--accent)" opacity="0.25" />
      <path d="M48 35h24" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Иллюстрация «пусто» с листом бумаги. */
export function NoteIllustration() {
  return (
    <svg width="120" height="110" viewBox="0 0 120 110" fill="none" aria-hidden>
      <rect x="30" y="14" width="60" height="80" rx="8" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />
      <path d="M42 36h36M42 50h36M42 64h22" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="86" cy="82" r="14" fill="var(--accent)" opacity="0.2" />
      <path d="m80 82 4 4 8-8" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Иллюстрация «графики». */
export function ChartIllustration() {
  return (
    <svg width="130" height="100" viewBox="0 0 130 100" fill="none" aria-hidden>
      <rect x="14" y="56" width="18" height="30" rx="4" fill="var(--accent)" opacity="0.5" />
      <rect x="42" y="38" width="18" height="48" rx="4" fill="var(--accent)" opacity="0.75" />
      <rect x="70" y="22" width="18" height="64" rx="4" fill="var(--accent)" />
      <rect x="98" y="46" width="18" height="40" rx="4" fill="var(--accent)" opacity="0.6" />
      <path d="M10 90h110" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

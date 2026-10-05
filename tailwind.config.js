/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Семантические цвета завязаны на CSS-переменные темы (см. index.css)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        border: 'var(--border)',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Шрифт, удобный для людей с дислексией (используется, если установлен)
        dys: ['OpenDyslexic', 'Lexend', '"Comic Sans MS"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.08), 0 8px 24px rgba(15,23,42,.06)',
        pop: '0 4px 12px rgba(15,23,42,.12), 0 16px 40px rgba(15,23,42,.16)',
      },
      animation: {
        'fade-in': 'fadeIn .25s ease',
        'slide-up': 'slideUp .3s cubic-bezier(.2,.8,.2,1)',
        'page-flip': 'pageFlip .35s ease',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pageFlip: {
          from: { opacity: '0', transform: 'translateX(var(--flip-from, 24px))' },
          to: { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
};

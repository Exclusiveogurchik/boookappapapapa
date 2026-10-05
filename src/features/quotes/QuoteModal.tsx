import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../shared/ui/overlays';
import { Button } from '../../shared/ui/controls';
import { useI18n } from '../../i18n';
import { useToast } from '../../shared/hooks/useToast';

/**
 * Генератор картинок-цитат: canvas 1080×1080, 5 стилей,
 * скачивание PNG и Web Share API (мобильные).
 */

type StyleId = 'classic' | 'dark' | 'gradient' | 'paper' | 'neon';

const STYLES: Record<StyleId, { bg: (ctx: CanvasRenderingContext2D) => void; fg: string; muted: string; quote: string }> = {
  classic: {
    bg: (ctx) => {
      ctx.fillStyle = '#fafaf8';
      ctx.fillRect(0, 0, 1080, 1080);
    },
    fg: '#1f2933',
    muted: '#6b7280',
    quote: '#0ea5e9',
  },
  dark: {
    bg: (ctx) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1080, 1080);
    },
    fg: '#e2e8f0',
    muted: '#94a3b8',
    quote: '#38bdf8',
  },
  gradient: {
    bg: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 1080, 1080);
      g.addColorStop(0, '#7c3aed');
      g.addColorStop(1, '#db2777');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1080, 1080);
    },
    fg: '#ffffff',
    muted: 'rgba(255,255,255,.75)',
    quote: 'rgba(255,255,255,.9)',
  },
  paper: {
    bg: (ctx) => {
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(0, 0, 1080, 1080);
      // Лёгкая «бумажная» текстура
      ctx.fillStyle = 'rgba(120,90,40,.05)';
      for (let i = 0; i < 600; i++) {
        ctx.fillRect(Math.random() * 1080, Math.random() * 1080, 2, 2);
      }
    },
    fg: '#43341c',
    muted: '#8a7350',
    quote: '#b45309',
  },
  neon: {
    bg: (ctx) => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 1080, 1080);
    },
    fg: '#e5e5e5',
    muted: '#737373',
    quote: '#22d3ee',
  },
};

function drawQuote(
  canvas: HTMLCanvasElement,
  text: string,
  title: string,
  author: string,
  styleId: StyleId,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = STYLES[styleId];
  s.bg(ctx);

  // Рамка
  ctx.strokeStyle = s.quote;
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, 960, 960);

  // Большие кавычки
  ctx.font = 'bold 140px Georgia, serif';
  ctx.fillStyle = s.quote;
  ctx.globalAlpha = 0.9;
  ctx.fillText('“', 100, 250);
  ctx.globalAlpha = 1;

  // Текст цитаты (перенос по словам)
  ctx.fillStyle = s.fg;
  ctx.font = '52px Georgia, serif';
  const maxWidth = 840;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
    if (lines.length > 10) break;
  }
  if (line) lines.push(line);

  const lineHeight = 76;
  let y = 380;
  for (const l of lines) {
    ctx.fillText(l, 120, y);
    y += lineHeight;
  }

  // Разделитель
  ctx.beginPath();
  ctx.moveTo(120, y + 30);
  ctx.lineTo(320, y + 30);
  ctx.strokeStyle = s.quote;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Книга и автор
  ctx.fillStyle = s.muted;
  ctx.font = 'italic 36px Georgia, serif';
  ctx.fillText(title.slice(0, 60), 120, y + 110);
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillText(author ? `— ${author.slice(0, 50)}` : '', 120, y + 170);

  // Бренд
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillStyle = s.muted;
  ctx.globalAlpha = 0.7;
  ctx.fillText('BookApp', 880, 990);
  ctx.globalAlpha = 1;

  if (styleId === 'neon') {
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, 960, 960);
    ctx.shadowBlur = 0;
  }
}

export function QuoteModal({
  open,
  onClose,
  text,
  bookTitle,
  author,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  bookTitle: string;
  author: string;
}) {
  const { t } = useI18n();
  const { show } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<StyleId>('classic');

  useEffect(() => {
    if (open && canvasRef.current) {
      drawQuote(canvasRef.current, text, bookTitle, author, style);
    }
  }, [open, text, bookTitle, author, style]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `quote-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    show(t('highlights.exported'), 'success');
  };

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'quote.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `«${text.slice(0, 100)}» — ${bookTitle}` });
        show(t('quotes.shared'), 'success');
        return;
      } catch {
        /* пользователь отменил */
      }
    }
    download();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('quotes.title')}>
      <div className="space-y-4">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1080}
          className="w-full rounded-2xl shadow-card"
          aria-label={t('quotes.title')}
        />
        <div>
          <p className="text-sm text-muted mb-2">{t('quotes.style')}</p>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(STYLES) as StyleId[]).map((id) => (
              <button
                key={id}
                onClick={() => setStyle(id)}
                className={`px-4 py-2 rounded-full text-sm border min-h-[44px] ${
                  style === id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'
                }`}
              >
                {t(`quotes.style.${id}` as never)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={download}>
            ⬇ {t('quotes.download')}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={share}>
            📤 {t('quotes.share')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

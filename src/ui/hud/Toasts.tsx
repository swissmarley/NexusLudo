import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGame, type Toast } from '../../store/game';
import { SEAT_THEME } from '../../core/theme';

const TONE: Record<Toast['tone'], { color: string; tag: string }> = {
  info: { color: '#00f0ff', tag: 'INFO' },
  good: { color: '#3dffa8', tag: 'OK' },
  bad: { color: '#ff3355', tag: 'ALERT' },
  epic: { color: '#ff2bd6', tag: 'EVENT' },
};

const ToastItem = memo(function ToastItem({ t, align }: { t: Toast; align: 'right' | 'center' }) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useGame((s) => s.dismissToast);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const tw = gsap.from(ref.current, { opacity: 0, x: align === 'right' ? 40 : 0, y: align === 'center' ? -10 : 0, duration: 0.35, ease: 'power3.out' });
    return () => {
      tw.kill();
    };
  }, [align]);
  const tone = TONE[t.tone];
  const seatColor = t.seat !== null ? SEAT_THEME[t.seat].color : tone.color;
  return (
    <div
      ref={ref}
      className="nx-panel nx-plain pointer-events-auto flex cursor-pointer items-center gap-2.5 py-2 pl-3 pr-3.5"
      style={{ '--stroke': `color-mix(in srgb, ${tone.color} 55%, transparent)`, '--c': '8px' } as CSSProperties}
      onClick={() => dismiss(t.id)}
      role="status"
    >
      <span className="h-6 w-[3px] shrink-0" style={{ background: seatColor, boxShadow: `0 0 8px ${seatColor}` }} />
      <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color: tone.color }}>
        {tone.tag}
      </span>
      <span
        className={`font-display text-[11px] font-bold tracking-[0.12em] ${t.tone === 'epic' ? 'nx-grad-text' : 'text-white'}`}
      >
        {t.text}
      </span>
    </div>
  );
});

export function Toasts({ align = 'right' }: { align?: 'right' | 'center' }) {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className={`pointer-events-none flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : 'items-center'}`} aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} align={align} />
      ))}
    </div>
  );
}

// Reusable NEXUS interface primitives.
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import gsap from 'gsap';
import { sfxClick, sfxHover } from './uiStore';

type BtnVariant = 'default' | 'primary' | 'ghost';

export interface NxButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  accent?: string;
  size?: 'md' | 'sm' | 'icon';
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
  dataAnim?: boolean;
  onHoverChange?: (h: boolean) => void;
  silent?: boolean;
}

export function NxButton({
  children,
  onClick,
  variant = 'default',
  accent,
  size = 'md',
  disabled,
  className = '',
  style,
  title,
  ariaLabel,
  ariaPressed,
  dataAnim,
  onHoverChange,
  silent,
}: NxButtonProps) {
  const cls = [
    'nx-btn pointer-events-auto',
    variant === 'primary' ? 'nx-primary' : variant === 'ghost' ? 'nx-ghost' : '',
    size === 'sm' ? 'nx-sm' : size === 'icon' ? 'nx-icon' : '',
    className,
  ].join(' ');
  return (
    <button
      type="button"
      className={cls}
      style={{ ...(accent ? ({ '--accent': accent } as CSSProperties) : null), ...style }}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-anim={dataAnim ? '' : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse' && !disabled) sfxHover();
        onHoverChange?.(true);
      }}
      onPointerLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      onClick={() => {
        if (disabled) return;
        if (!silent) sfxClick();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = '',
  style,
  plain,
  accent,
  innerRef,
  dataAnim,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  plain?: boolean;
  accent?: string;
  innerRef?: RefObject<HTMLDivElement | null>;
  dataAnim?: boolean;
}) {
  const vars = accent
    ? ({
        '--stroke': `color-mix(in srgb, ${accent} 50%, transparent)`,
        '--bracket': accent,
      } as CSSProperties)
    : undefined;
  return (
    <div
      ref={innerRef}
      className={`nx-panel ${plain ? 'nx-plain' : ''} ${className}`}
      style={{ ...vars, ...style }}
      data-anim={dataAnim ? '' : undefined}
    >
      {children}
    </div>
  );
}

/** Small mono section label like `// MODULE`. */
export function Label({ children, className = '', color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <div
      className={`font-mono text-[10px] uppercase tracking-[0.28em] text-white/45 ${className}`}
      style={color ? { color } : undefined}
    >
      {children}
    </div>
  );
}

export function Chip({ children, color = '#00f0ff', className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`nx-chamfer inline-flex items-center gap-1 px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${className}`}
      style={
        {
          '--c': '5px',
          color: '#e8f6ff',
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 34%, transparent), color-mix(in srgb, ${color} 12%, transparent))`,
          boxShadow: `inset 2px 0 0 ${color}`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  accent?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
  small,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
  small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`pointer-events-auto flex gap-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const accent = o.accent ?? '#00f0ff';
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onPointerEnter={(e) => e.pointerType === 'mouse' && sfxHover()}
            onClick={() => {
              if (on) return;
              sfxClick();
              onChange(o.value);
            }}
            className={`nx-chamfer nx-focus flex-1 cursor-pointer font-display font-bold uppercase tracking-[0.14em] transition-all ${
              small ? 'min-h-9 px-2 text-[10px] pointer-coarse:min-h-11' : 'min-h-11 px-3 text-[11px]'
            }`}
            style={
              {
                '--c': '7px',
                color: on ? '#04050d' : 'rgba(232,246,255,0.7)',
                background: on
                  ? `linear-gradient(100deg, ${accent}, color-mix(in srgb, ${accent} 70%, white))`
                  : 'rgba(255,255,255,0.05)',
                boxShadow: on ? `0 0 18px color-mix(in srgb, ${accent} 50%, transparent)` : `inset 0 0 0 1px rgba(255,255,255,0.08)`,
              } as CSSProperties
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onPointerEnter={(e) => e.pointerType === 'mouse' && sfxHover()}
      onClick={() => {
        sfxClick();
        onChange(!checked);
      }}
      className="nx-focus pointer-events-auto flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 py-1 text-left"
    >
      <span>
        <span className="block font-display text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">{label}</span>
        {desc && <span className="block text-[13px] leading-tight text-white/50">{desc}</span>}
      </span>
      <span
        className="nx-chamfer relative h-6 w-12 shrink-0 transition-colors"
        style={{ '--c': '5px', background: checked ? 'rgba(0,240,255,0.35)' : 'rgba(255,255,255,0.08)' } as CSSProperties}
      >
        <span
          className="absolute top-1 h-4 w-4 transition-all"
          style={{
            left: checked ? 28 : 4,
            background: checked ? '#00f0ff' : 'rgba(232,246,255,0.45)',
            boxShadow: checked ? '0 0 10px #00f0ff' : 'none',
            clipPath: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)',
          }}
        />
      </span>
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className={`pointer-events-auto block py-1 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-baseline justify-between">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">{label}</span>
        <span className="font-mono text-xs text-nx-cyan">{format(value)}</span>
      </span>
      <input
        type="range"
        className="nx-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

/** Modal shell: blurred backdrop + centred chamfered panel. */
export function Modal({
  title,
  kicker,
  onClose,
  children,
  width = 560,
  footer,
}: {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, duration: 0.25 });
      gsap.from(panelRef.current, { opacity: 0, y: 24, scale: 0.97, duration: 0.45, ease: 'power3.out' });
      gsap.from('[data-anim]', { opacity: 0, x: -10, duration: 0.4, stagger: 0.03, delay: 0.12, ease: 'power2.out', clearProps: 'all' });
    }, ref);
    return () => ctx.revert();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => {
    // move focus inside for keyboard users
    panelRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      className="nx-safe pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#020108]/65 backdrop-blur-[6px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Panel innerRef={panelRef} className="flex max-h-full w-full flex-col" style={{ maxWidth: width }}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-3 pt-4 sm:px-6">
          <div>
            {kicker && <Label color="#00f0ff">{kicker}</Label>}
            <h2 className="nx-glitch mt-1 font-display text-lg font-black tracking-[0.18em] text-white sm:text-xl" data-text={title}>
              {title}
            </h2>
          </div>
          <NxButton size="icon" variant="ghost" onClick={onClose} ariaLabel="Close">
            <span aria-hidden className="text-base">
              ✕
            </span>
          </NxButton>
        </div>
        <div className="nx-scroll min-h-0 flex-1 px-5 py-4 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-5 py-3 sm:px-6">{footer}</div>}
      </Panel>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

/** Flat holographic die face. */
export function DieFace({ value, color, size = 44, dim }: { value: number | null; color: string; size?: number; dim?: boolean }) {
  const pips = value ? PIPS[Math.min(6, Math.max(1, value))] : [];
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-label={value ? `Die shows ${value}` : 'Die'} role="img" style={{ opacity: dim ? 0.4 : 1 }}>
      <defs>
        <linearGradient id="nx-die-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a2238" />
          <stop offset="1" stopColor="#070914" />
        </linearGradient>
      </defs>
      <path d="M5 1 H29 V25 L25 29 H1 V5 Z" fill="url(#nx-die-g)" stroke={color} strokeWidth="1" />
      {pips.map(([r, c], i) => (
        <circle key={i} cx={8 + c * 7} cy={8 + r * 7} r={2.3} fill={color} style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
      ))}
    </svg>
  );
}

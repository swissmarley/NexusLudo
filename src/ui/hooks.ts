// Shared UI hooks.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import gsap from 'gsap';

/** Stagger-in all `[data-anim]` descendants on mount. */
export function useEntrance(ref: RefObject<HTMLElement | null>, opts: { y?: number; x?: number; stagger?: number; delay?: number } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-anim]', {
        opacity: 0,
        y: opts.y ?? 14,
        x: opts.x ?? 0,
        duration: 0.55,
        ease: 'power3.out',
        stagger: opts.stagger ?? 0.05,
        delay: opts.delay ?? 0,
        clearProps: 'opacity,transform',
      });
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export type LayoutKind = 'desktop' | 'portrait' | 'landscape';

function computeLayout(): LayoutKind {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1024 && h >= 620) return 'desktop';
  return w > h ? 'landscape' : 'portrait';
}

export function useLayout(): LayoutKind {
  const [l, setL] = useState<LayoutKind>(computeLayout);
  useEffect(() => {
    const on = () => setL(computeLayout());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return l;
}

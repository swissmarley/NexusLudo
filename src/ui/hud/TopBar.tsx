import type { CSSProperties } from 'react';
import { useGame } from '../../store/game';
import { useView } from '../../store/view';
import { useUI } from '../uiStore';
import { NxButton } from '../primitives';

export function TopBar({ compact }: { compact?: boolean }) {
  const turn = useGame((s) => s.game?.turn ?? 0);
  const mode = useGame((s) => s.game?.mode ?? 'classic');
  const setPaused = useGame((s) => s.setPaused);
  const topView = useView((s) => s.topView);
  const setTopView = useView((s) => s.setTopView);
  const resetCamera = useView((s) => s.resetCamera);
  const setStats = useUI((s) => s.setStats);
  const setSettings = useUI((s) => s.setSettings);
  const modeColor = mode === 'nexus' ? '#ff2bd6' : '#00f0ff';

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      <div
        className="nx-panel nx-plain flex h-11 items-center gap-3 px-3"
        style={{ '--c': '8px', '--stroke': 'rgba(0,240,255,0.35)' } as CSSProperties}
        aria-label={`Turn ${turn}, ${mode} mode`}
      >
        <div className="leading-none">
          <div className="font-mono text-[8px] tracking-[0.25em] text-white/45">TURN</div>
          <div className="font-mono text-sm font-semibold text-white">{String(turn).padStart(3, '0')}</div>
        </div>
        <span className="h-6 w-px bg-white/15" />
        <span className="font-display text-[10px] font-black tracking-[0.2em]" style={{ color: modeColor, textShadow: `0 0 8px ${modeColor}` }}>
          {mode === 'nexus' ? 'NEXUS' : 'CLASSIC'}
        </span>
      </div>
      <NxButton size={compact ? 'icon' : 'sm'} className={compact ? '' : 'h-11'} onClick={() => setStats(true)} ariaLabel="Statistics" title="Statistics">
        <span aria-hidden>▤</span>
        {!compact && 'STATS'}
      </NxButton>
      <NxButton
        size="icon"
        className="h-11"
        accent={topView ? '#ff2bd6' : '#00f0ff'}
        ariaPressed={topView}
        onClick={() => setTopView(!topView)}
        ariaLabel="Toggle top view (T)"
        title="Top view (T)"
      >
        <span aria-hidden className="font-mono text-xs">{topView ? '3D' : 'TOP'}</span>
      </NxButton>
      <NxButton size="icon" className="h-11" onClick={resetCamera} ariaLabel="Reset camera (C)" title="Reset camera (C)">
        <span aria-hidden>⌖</span>
      </NxButton>
      <NxButton size="icon" className="h-11" onClick={() => setSettings(true)} ariaLabel="Settings" title="Settings">
        <span aria-hidden>⚙</span>
      </NxButton>
      <NxButton size="icon" className="h-11" accent="#ffb300" onClick={() => setPaused(true)} ariaLabel="Pause (Esc)" title="Pause (Esc)">
        <span aria-hidden className="font-mono text-xs">❚❚</span>
      </NxButton>
    </div>
  );
}

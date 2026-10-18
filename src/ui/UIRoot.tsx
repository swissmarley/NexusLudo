// OWNER: UI agent. DOM overlay above the canvas.
// Root is pointer-events-none so the 3D canvas keeps orbit/tap input in empty
// areas; every interactive panel opts back in with pointer-events-auto.
import { useEffect } from 'react';
import './ui.css';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { useUI } from './uiStore';
import { LoadingVeil } from './LoadingVeil';
import { MainMenu } from './MainMenu';
import { MatchSetup } from './MatchSetup';
import { GameHUD } from './hud/GameHUD';
import { Victory } from './Victory';
import { Results } from './Results';
import { StatsDrawer } from './StatsDrawer';
import { SettingsModal } from './SettingsModal';
import { HowToPlay } from './HowToPlay';
import { Callouts } from './hud/Callouts';

export function UIRoot() {
  const screen = useGame((s) => s.screen);
  const intensity = useSettings((s) => s.intensity);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const howToOpen = useUI((s) => s.howToOpen);
  const statsOpen = useUI((s) => s.statsOpen);

  // Stats only make sense with a match; close it when leaving.
  useEffect(() => {
    if (screen === 'menu' || screen === 'setup') useUI.getState().setStats(false);
  }, [screen]);

  return (
    <div className={`nx-root pointer-events-none absolute inset-0 z-10 overflow-hidden ${intensity === 'low' ? 'nx-low' : ''}`}>
      {/* ambient screen treatment */}
      <div className="nx-vignette absolute inset-0" />
      {intensity === 'high' && <div className="nx-scanlines absolute inset-0 opacity-[0.22]" />}

      {screen === 'menu' && <MainMenu key="menu" />}
      {screen === 'setup' && <MatchSetup key="setup" />}
      {screen === 'game' && <GameHUD key="game" />}
      {screen === 'victory' && <Victory key="victory" />}
      {screen === 'results' && <Results key="results" />}
      {/* always mounted so events emitted synchronously by startGame are caught */}
      <Callouts />

      {statsOpen && screen !== 'menu' && screen !== 'setup' && <StatsDrawer />}
      {howToOpen && <HowToPlay />}
      {settingsOpen && <SettingsModal />}

      <LoadingVeil />
    </div>
  );
}

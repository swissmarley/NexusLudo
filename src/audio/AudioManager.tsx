// OWNER: audio agent. Headless component wiring fx bus → WebAudio.
import { useEffect } from 'react';
import { fx } from '../core/fx';
import type { FxEvent } from '../core/fx';
import { useGame } from '../store/game';
import type { GameStore } from '../store/game';
import { useSettings } from '../store/settings';
import { AudioEngine } from './engine';
import type { MusicScene } from './engine';
import { MusicSystem } from './music';
import * as S from './sfx';

let music: MusicSystem | null = null;
function getMusic(engine: AudioEngine): MusicSystem {
  if (!music) {
    music = new MusicSystem(engine);
    engine.attachMusic(music);
  }
  return music;
}

function sceneFor(s: Pick<GameStore, 'screen' | 'paused'>): MusicScene {
  switch (s.screen) {
    case 'game':
      return s.paused ? 'calm' : 'game';
    case 'victory':
      return 'victory';
    case 'results':
      return 'results';
    default:
      return 'calm';
  }
}

function play(engine: AudioEngine, e: FxEvent): void {
  if (!engine.ready) return;
  switch (e.type) {
    case 'uiHover':
      return S.uiHover(engine);
    case 'uiClick':
      return S.uiClick(engine);
    case 'diceThrow':
      return S.diceThrow(engine, e.durationMs, e.seat);
    case 'roll':
      return S.roll(engine, e.raw, e.seat);
    case 'six':
      return S.six(engine, e.streak);
    case 'forfeit':
      return S.forfeit(engine);
    case 'moveStart':
      return S.moveStart(engine, e.hopMs, e.move.enters, e.move.seat);
    case 'hop':
      return S.hop(engine, e.index, e.total, e.seat);
    case 'enter':
      return S.enter(engine);
    case 'capture':
      return S.capture(engine);
    case 'shieldBlock':
      return S.shieldBlock(engine);
    case 'finish':
      return S.finish(engine, e.seat);
    case 'extraTurn':
      return S.extraTurn(engine);
    case 'collect':
      return S.collect(engine, e.power);
    case 'usePower':
      return S.usePower(engine, e.power);
    case 'emp':
      return S.emp(engine, e.hits.length);
    case 'turn':
      return S.turn(engine, e.seat);
    case 'noMoves':
      return S.noMoves(engine);
    case 'playerDone':
      return S.playerDone(engine);
    case 'win':
      return S.winRiser(engine);
    case 'victoryStart':
      if (engine.gate('victory', 2000)) S.victoryFanfare(engine);
      return;
    case 'gameStart':
      return S.gameStart(engine);
    case 'spawnPower':
      return S.spawnPower(engine);
    case 'move':
      return; // covered by moveStart / hop
  }
}

export function AudioManager() {
  useEffect(() => {
    const engine = AudioEngine.get();
    const m = getMusic(engine);

    // Autoplay policy: create/resume the context on the first user gesture.
    const unlock = () => engine.unlock();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    window.addEventListener('touchend', unlock, opts);

    engine.applySettings(useSettings.getState());
    const offSettings = useSettings.subscribe((s) => engine.applySettings(s));

    m.setScene(sceneFor(useGame.getState()));
    const offGame = useGame.subscribe((s, p) => {
      if (s.screen !== p.screen || s.paused !== p.paused) m.setScene(sceneFor(s));
    });

    const offFx = fx.onAny((e) => play(engine, e));

    const onVis = () => engine.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    onVis();

    // Re-mount (e.g. StrictMode / HMR): resume music if already unlocked.
    if (engine.unlocked) m.start();

    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
      window.removeEventListener('touchend', unlock, opts);
      document.removeEventListener('visibilitychange', onVis);
      offSettings();
      offGame();
      offFx();
      m.stop();
    };
  }, []);

  return null;
}

// OWNER: actors/VFX agent.
// Renders every active player's tokens. Resting poses (cell + stack offset,
// scale) are derived purely from the committed `game` state each render.
import { useEffect, useMemo } from 'react';
import { progressToWorld, stackOffset, trackCell } from '../../game/board';
import { FINISH_PROGRESS, HOME_LANE_START, type GameState } from '../../game/types';
import { selectIsHumanTurn, useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { Token } from './Token';
import { createTokenGeometries, disposeGeometries } from './tokenAssets';

interface Rest {
  x: number;
  z: number;
  scale: number;
}

/** Key identifying the physical cell a token occupies (null = private slot). */
function cellKey(seat: number, progress: number): string | null {
  if (progress < 0 || progress >= FINISH_PROGRESS) return null; // base slots & core spots are unique
  if (progress >= HOME_LANE_START) return `h${seat}:${progress}`;
  return `t${trackCell(seat as 0 | 1 | 2 | 3, progress)}`;
}

function computeRests(game: GameState): Rest[] {
  const groups = new Map<string, number[]>();
  for (const tk of game.tokens) {
    if (!game.players[tk.seat].active) continue;
    const k = cellKey(tk.seat, tk.progress);
    if (k === null) continue;
    const arr = groups.get(k);
    if (arr) arr.push(tk.id);
    else groups.set(k, [tk.id]);
  }
  return game.tokens.map((tk) => {
    const w = progressToWorld(tk.seat, tk.progress, tk.index);
    const k = cellKey(tk.seat, tk.progress);
    const members = k ? groups.get(k)! : null;
    const n = members ? members.length : 1;
    const off = members ? stackOffset(members.indexOf(tk.id), n) : { x: 0, z: 0 };
    const scale = tk.progress >= FINISH_PROGRESS ? 0.62 : n > 2 ? 0.8 : n > 1 ? 0.88 : 1;
    return { x: w.x + off.x, z: w.z + off.z, scale };
  });
}

export function Tokens() {
  const game = useGame((s) => s.game);
  const session = useGame((s) => s.session);
  const humanTurn = useGame(selectIsHumanTurn);
  const hint = useGame((s) => s.hint);
  const hovered = useGame((s) => s.hoveredToken);
  const showHints = useSettings((s) => s.showHints);

  const geo = useMemo(() => createTokenGeometries(), []);
  useEffect(() => () => disposeGeometries(geo), [geo]);

  const rests = useMemo(() => (game ? computeRests(game) : null), [game]);
  const legal = useMemo(() => {
    const set = new Set<number>();
    if (game && humanTurn && game.phase === 'move') for (const m of game.legalMoves) set.add(m.tokenId);
    return set;
  }, [game, humanTurn]);

  if (!game || !rests) return null;
  const hintId = showHints && hint ? hint.move.tokenId : -1;

  return (
    <group name="tokens">
      {game.tokens.map((tk) => {
        if (!game.players[tk.seat].active) return null;
        const r = rests[tk.id];
        return (
          <Token
            key={`${session}-${tk.id}`}
            id={tk.id}
            seat={tk.seat}
            index={tk.index}
            progress={tk.progress}
            shield={tk.shield}
            restX={r.x}
            restZ={r.z}
            restScale={r.scale}
            legal={legal.has(tk.id)}
            hinted={hintId === tk.id}
            hovered={hovered === tk.id}
            dimmed={tk.seat !== game.current}
            geo={geo}
            spawnDelay={0.25 + tk.seat * 0.12 + tk.index * 0.06}
          />
        );
      })}
    </group>
  );
}

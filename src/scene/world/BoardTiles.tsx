// All track / safe / start / home tiles in ONE InstancedMesh with a custom
// circuitry shader. Tiles pulse on hop landings and softly highlight the
// destinations of the human player's legal moves.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HOME_LANES, TRACK, describeBoard, gridToWorld, trackCell } from '../../game/board';
import { HOME_LANE_START, LAST_TRACK_PROGRESS, type Seat } from '../../game/types';
import { POWER_THEME } from '../../core/theme';
import { useGame, type GameStore } from '../../store/game';
import { COLOR, SEAT_COLORS, uTime, uTurnColor, useBudget, useDisposable, useFx } from './shared';
import { tileFrag, tileVert } from './shaders/board';

const KIND_ID = { track: 0, safe: 1, start: 2, home: 3 } as const;
const TILE_SIZE = 0.92;
const TILE_HEIGHT = 0.04;

interface TileLayout {
  count: number;
  matrices: THREE.Matrix4[];
  colors: Float32Array;
  info: Float32Array;
  dirs: Float32Array;
  trackToInstance: Int16Array;
  homeToInstance: Int16Array; // seat*5 + homeIndex
}

/** Build static tile layout from describeBoard() (core cells are rendered by <NexusCore/>). */
function buildLayout(): TileLayout {
  const cells = describeBoard().filter((c) => c.kind !== 'core' && c.kind !== 'base' && c.kind !== 'void');
  const count = cells.length;
  const colors = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  const dirs = new Float32Array(count * 2);
  const trackToInstance = new Int16Array(52).fill(-1);
  const homeToInstance = new Int16Array(20).fill(-1);
  const matrices: THREE.Matrix4[] = [];
  const c = new THREE.Color();

  cells.forEach((cell, i) => {
    const w = gridToWorld(cell.row, cell.col);
    matrices.push(new THREE.Matrix4().makeTranslation(w.x, 0, w.z));
    const kind = KIND_ID[cell.kind as keyof typeof KIND_ID];
    let param = 0;
    let dx = 0;
    let dz = 1;
    if (cell.trackIndex !== null) {
      trackToInstance[cell.trackIndex] = i;
      param = cell.trackIndex / 52;
      const [nr, nc] = TRACK[(cell.trackIndex + 1) % 52];
      dx = nc - cell.col;
      dz = nr - cell.row;
    }
    if (cell.homeIndex !== null && cell.seat !== null) {
      homeToInstance[cell.seat * 5 + cell.homeIndex] = i;
      param = (cell.homeIndex + 1) / 5;
      const lane = HOME_LANES[cell.seat];
      const next = lane[Math.min(cell.homeIndex + 1, 4)];
      const prev = lane[Math.max(cell.homeIndex - 1, 0)];
      dx = Math.sign(next[1] - prev[1]);
      dz = Math.sign(next[0] - prev[0]);
    }
    const len = Math.hypot(dx, dz) || 1;
    // the shader works in tile-local (x, z) space; local z == world z here
    dirs[i * 2] = dx / len;
    dirs[i * 2 + 1] = dz / len;

    if (cell.seat !== null) c.copy(SEAT_COLORS[cell.seat]);
    else if (cell.kind === 'safe') c.copy(COLOR.safe);
    else c.copy(COLOR.cyan);
    c.toArray(colors, i * 3);
    info.set([kind, param, (i * 0.6180339) % 1, 0], i * 4);
  });
  return { count, matrices, colors, info, dirs, trackToInstance, homeToInstance };
}

/** Instance index for a token position (or -1 for base / core). */
function instanceFor(layout: TileLayout, seat: Seat, progress: number): number {
  if (progress < 0) return -1;
  if (progress <= LAST_TRACK_PROGRESS) {
    const cell = trackCell(seat, progress);
    return cell === null ? -1 : layout.trackToInstance[cell];
  }
  if (progress < HOME_LANE_START + 5) return layout.homeToInstance[seat * 5 + (progress - HOME_LANE_START)];
  return -1;
}

const tmpColor = new THREE.Color();

export function BoardTiles() {
  const layout = useMemo(buildLayout, []);
  const { tier } = useBudget();
  const highlightTarget = useRef(new Float32Array(layout.count));
  const highlightActive = useRef(false);

  const { mesh, infoAttr, pulseAttr } = useDisposable(() => {
    const geo = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE).translate(0, TILE_HEIGHT / 2, 0);
    const infoAttr = new THREE.InstancedBufferAttribute(layout.info.slice(), 4).setUsage(THREE.DynamicDrawUsage);
    const pulse = new Float32Array(layout.count * 4);
    for (let i = 0; i < layout.count; i++) pulse[i * 4 + 3] = -100;
    const pulseAttr = new THREE.InstancedBufferAttribute(pulse, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(layout.colors, 3));
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(layout.dirs, 2));
    geo.setAttribute('aInfo', infoAttr);
    geo.setAttribute('aPulse', pulseAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: tileVert,
      fragmentShader: tileFrag,
      uniforms: { uTime, uTurn: uTurnColor, uDetail: { value: 1 } },
    });
    const mesh = new THREE.InstancedMesh(geo, mat, layout.count);
    layout.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return {
      mesh,
      infoAttr,
      pulseAttr,
      dispose: () => {
        geo.dispose();
        mat.dispose();
        mesh.dispose();
      },
    };
  }, [layout]);

  useEffect(() => {
    (mesh.material as THREE.ShaderMaterial).uniforms.uDetail.value = tier === 'low' ? 0.4 : 1;
  }, [tier, mesh]);

  /** Flash a tile with a colour. */
  const pulse = (idx: number, color: THREE.Color) => {
    if (idx < 0) return;
    const a = pulseAttr.array as Float32Array;
    a[idx * 4] = color.r;
    a[idx * 4 + 1] = color.g;
    a[idx * 4 + 2] = color.b;
    a[idx * 4 + 3] = uTime.value;
    pulseAttr.addUpdateRange(idx * 4, 4);
    pulseAttr.needsUpdate = true;
  };

  useFx('hop', (e) => pulse(instanceFor(layout, e.seat, e.progress), SEAT_COLORS[e.seat]));
  useFx('capture', (e) => pulse(layout.trackToInstance[e.cell] ?? -1, COLOR.danger));
  useFx('shieldBlock', (e) => pulse(layout.trackToInstance[e.cell] ?? -1, COLOR.safe));
  useFx('spawnPower', (e) => pulse(layout.trackToInstance[e.cell] ?? -1, tmpColor.set(POWER_THEME[e.power].color)));
  useFx('collect', (e) => pulse(layout.trackToInstance[e.cell] ?? -1, tmpColor.set(POWER_THEME[e.power].color)));
  useFx('emp', (e) => {
    for (const h of e.hits) {
      const g = useGame.getState().game;
      if (!g) continue;
      const t = g.tokens[h.tokenId];
      pulse(instanceFor(layout, t.seat, h.from), COLOR.magenta);
    }
  });

  // legal-move destination highlights (human turn only)
  useEffect(() => {
    const compute = (s: GameStore) => {
      const target = highlightTarget.current;
      target.fill(0);
      const g = s.game;
      if (!g || s.screen !== 'game' || s.busy || s.moving || g.phase !== 'move') return;
      if (g.players[g.current].kind !== 'human') return;
      for (const m of g.legalMoves) {
        const idx = instanceFor(layout, m.seat, m.to);
        if (idx >= 0) target[idx] = s.hoveredToken === null || s.hoveredToken === m.tokenId ? 1 : 0.35;
      }
      highlightActive.current = true;
    };
    compute(useGame.getState());
    return useGame.subscribe((s) => {
      compute(s);
      highlightActive.current = true;
    });
  }, [layout]);

  useFrame((_, dt) => {
    if (!highlightActive.current) return;
    const arr = infoAttr.array as Float32Array;
    const target = highlightTarget.current;
    const k = 1 - Math.exp(-8 * Math.min(dt, 0.1));
    let moving = false;
    for (let i = 0; i < layout.count; i++) {
      const cur = arr[i * 4 + 3];
      const d = target[i] - cur;
      if (Math.abs(d) > 0.002) {
        arr[i * 4 + 3] = cur + d * k;
        moving = true;
      } else arr[i * 4 + 3] = target[i];
    }
    infoAttr.needsUpdate = true;
    if (!moving) highlightActive.current = false;
  });

  return <primitive object={mesh} />;
}

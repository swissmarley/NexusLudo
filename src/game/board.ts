// ─────────────────────────────────────────────────────────────
// Board topology & geometry. Pure math — no Three.js dependency.
// Grid is 15×15; cell (row, col) centre maps to world (x = col-7, z = row-7).
// Board plane is XZ, Y is up. One cell = 1 world unit (CELL_SIZE).
// ─────────────────────────────────────────────────────────────
import {
  FINISH_PROGRESS,
  HOME_LANE_START,
  LAST_TRACK_PROGRESS,
  TRACK_LENGTH,
  type Seat,
} from './types';

export const CELL_SIZE = 1;
export const GRID = 15;

export type GridCell = readonly [row: number, col: number];

function buildTrack(): GridCell[] {
  const t: GridCell[] = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]);
  for (let r = 5; r >= 0; r--) t.push([r, 6]);
  t.push([0, 7]);
  for (let r = 0; r <= 5; r++) t.push([r, 8]);
  for (let c = 9; c <= 14; c++) t.push([6, c]);
  t.push([7, 14]);
  for (let c = 14; c >= 9; c--) t.push([8, c]);
  for (let r = 9; r <= 14; r++) t.push([r, 8]);
  t.push([14, 7]);
  for (let r = 14; r >= 9; r--) t.push([r, 6]);
  for (let c = 5; c >= 0; c--) t.push([8, c]);
  t.push([7, 0]);
  t.push([6, 0]);
  return t;
}

/** The 52 shared main-track cells in clockwise order, index 0 = seat 0 start. */
export const TRACK: readonly GridCell[] = buildTrack();

/** Home lanes (5 cells each) per seat, ordered from entry → core. */
export const HOME_LANES: readonly (readonly GridCell[])[] = [
  [1, 2, 3, 4, 5].map((c) => [7, c] as const),
  [1, 2, 3, 4, 5].map((r) => [r, 7] as const),
  [13, 12, 11, 10, 9].map((c) => [7, c] as const),
  [13, 12, 11, 10, 9].map((r) => [r, 7] as const),
];

/** Base quadrant top-left corner (row, col) per seat. */
export const BASE_ORIGIN: readonly GridCell[] = [
  [0, 0], // seat 0 top-left
  [0, 9], // seat 1 top-right
  [9, 9], // seat 2 bottom-right
  [9, 0], // seat 3 bottom-left
];

export const START_CELL = (seat: Seat): number => seat * 13;
export const SAFE_CELLS: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const START_CELLS: ReadonlySet<number> = new Set([0, 13, 26, 39]);
export const STAR_CELLS: ReadonlySet<number> = new Set([8, 21, 34, 47]);

/** Absolute main-track cell for a token progress, or null if not on main track. */
export function trackCell(seat: Seat, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK_PROGRESS) return null;
  return (START_CELL(seat) + progress) % TRACK_LENGTH;
}

/** Convert an absolute track cell to a seat's relative progress (0..51 range, may exceed 50). */
export function relativeProgress(seat: Seat, cell: number): number {
  return (cell - START_CELL(seat) + TRACK_LENGTH) % TRACK_LENGTH;
}

export function isSafeCell(cell: number): boolean {
  return SAFE_CELLS.has(cell);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function gridToWorld(row: number, col: number, y = 0): Vec3 {
  return { x: (col - 7) * CELL_SIZE, y, z: (row - 7) * CELL_SIZE };
}

/** Base docking slot world position for a token index 0..3. */
export function baseSlotWorld(seat: Seat, index: number, y = 0): Vec3 {
  const [r0, c0] = BASE_ORIGIN[seat];
  const cx = c0 + 2.5; // centre of 6×6 quadrant in cell coords
  const cz = r0 + 2.5;
  const ox = index % 2 === 0 ? -1.05 : 1.05;
  const oz = index < 2 ? -1.05 : 1.05;
  return gridToWorld(cz + oz, cx + ox, y);
}

/** Centre of the base quadrant (for cameras/VFX). */
export function baseCenterWorld(seat: Seat, y = 0): Vec3 {
  const [r0, c0] = BASE_ORIGIN[seat];
  return gridToWorld(r0 + 2.5, c0 + 2.5, y);
}

/** Final resting spot inside the central Nexus core for a finished token. */
export function finishWorld(seat: Seat, index: number, y = 0): Vec3 {
  // Each seat owns the triangle of the core facing its home lane.
  const dirs: [number, number][] = [
    [-1, 0], // seat 0 lane enters from the west (x−)
    [0, -1], // seat 1 from the north (z−)
    [1, 0], // seat 2 from the east
    [0, 1], // seat 3 from the south
  ];
  const [dx, dz] = dirs[seat];
  const spread = (index - 1.5) * 0.32;
  // perpendicular to lane direction
  const px = -dz;
  const pz = dx;
  return { x: dx * 0.78 + px * spread, y, z: dz * 0.78 + pz * spread };
}

/** World position of a token given its owner & progress. */
export function progressToWorld(seat: Seat, progress: number, index: number, y = 0): Vec3 {
  if (progress < 0) return baseSlotWorld(seat, index, y);
  if (progress >= FINISH_PROGRESS) return finishWorld(seat, index, y);
  if (progress >= HOME_LANE_START) {
    const [r, c] = HOME_LANES[seat][progress - HOME_LANE_START];
    return gridToWorld(r, c, y);
  }
  const cell = trackCell(seat, progress)!;
  const [r, c] = TRACK[cell];
  return gridToWorld(r, c, y);
}

/** World position of an absolute track cell. */
export function trackCellWorld(cell: number, y = 0): Vec3 {
  const [r, c] = TRACK[cell];
  return gridToWorld(r, c, y);
}

/**
 * Small offsets so several tokens sharing one cell are all visible.
 * Returns xz offset for the i-th of n co-located tokens.
 */
export function stackOffset(i: number, n: number): { x: number; z: number } {
  if (n <= 1) return { x: 0, z: 0 };
  const r = n === 2 ? 0.2 : 0.25;
  const a = (i / n) * Math.PI * 2 + Math.PI / 4;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Identifies the cell type for rendering. */
export type CellKind = 'track' | 'safe' | 'start' | 'home' | 'base' | 'core' | 'void';

export interface BoardCellInfo {
  row: number;
  col: number;
  kind: CellKind;
  seat: Seat | null; // owner tint for start / home / base cells
  trackIndex: number | null;
  homeIndex: number | null;
}

/** Full description of every cell used by the board renderer. */
export function describeBoard(): BoardCellInfo[] {
  const map = new Map<string, BoardCellInfo>();
  const key = (r: number, c: number) => `${r},${c}`;
  TRACK.forEach(([r, c], i) => {
    const start = START_CELLS.has(i);
    map.set(key(r, c), {
      row: r,
      col: c,
      kind: start ? 'start' : SAFE_CELLS.has(i) ? 'safe' : 'track',
      seat: start ? ((i / 13) as Seat) : null,
      trackIndex: i,
      homeIndex: null,
    });
  });
  HOME_LANES.forEach((lane, s) =>
    lane.forEach(([r, c], i) =>
      map.set(key(r, c), { row: r, col: c, kind: 'home', seat: s as Seat, trackIndex: null, homeIndex: i }),
    ),
  );
  for (let r = 6; r <= 8; r++)
    for (let c = 6; c <= 8; c++)
      map.set(key(r, c), { row: r, col: c, kind: 'core', seat: null, trackIndex: null, homeIndex: null });
  return [...map.values()];
}

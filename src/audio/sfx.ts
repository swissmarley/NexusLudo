// ─────────────────────────────────────────────────────────────
// Procedural sound effects. Each function synthesises one moment
// on the SFX bus. All levels are balanced against a ~0.3 peak.
// ─────────────────────────────────────────────────────────────
import type { PowerType, Seat } from '../game/types';
import type { AudioEngine } from './engine';
import { mtof, pick, rand } from './engine';

type E = AudioEngine;

const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const SEAT_PAN: Record<Seat, number> = { 0: -0.35, 1: 0.35, 2: 0.35, 3: -0.35 };

// ── UI ───────────────────────────────────────────────────────
export function uiHover(e: E): void {
  if (!e.gate('hover', 45)) return;
  e.tone({ type: 'sine', freq: 2600, freqEnd: 3200, dur: 0.035, gain: 0.035, attack: 0.002, pan: rand(-0.2, 0.2), priority: 0 });
}

export function uiClick(e: E): void {
  if (!e.gate('click', 35)) return;
  e.tone({ type: 'square', freq: 1900, dur: 0.018, gain: 0.05, attack: 0.001, filter: { type: 'bandpass', freq: 2400, q: 3 } });
  e.tone({ type: 'sine', freq: 1050, freqEnd: 620, dur: 0.06, gain: 0.11, attack: 0.002 });
  e.noise({ dur: 0.012, gain: 0.05, attack: 0.001, filter: { type: 'highpass', freq: 5000 }, priority: 0 });
  e.tone({ type: 'sine', freq: 2100, at: 0.025, dur: 0.05, gain: 0.025, echo: 0.25, priority: 0 });
}

// ── Dice ─────────────────────────────────────────────────────
export function diceThrow(e: E, durationMs: number, seat: Seat): void {
  const D = Math.max(0.3, durationMs / 1000);
  const pan = SEAT_PAN[seat];
  // whoosh
  e.noise({ dur: Math.min(0.45, D * 0.5), gain: 0.11, attack: 0.08, filter: { type: 'bandpass', freq: 500, peak: 2600, peakAt: 0.14, freqEnd: 700, q: 1.4 }, pan });
  // rattle: ticks decelerating towards the landing
  const n = Math.max(6, Math.min(16, Math.round(D * 12)));
  let last = -1;
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / (n + 1);
    const t = 0.12 + (D - 0.2) * Math.pow(x, 1.7);
    if (t - last < 0.03) continue;
    last = t;
    const level = 0.11 * (1 - x * 0.45) * rand(0.7, 1);
    e.noise({ at: t, dur: rand(0.018, 0.035), gain: level, attack: 0.001, filter: { type: 'bandpass', freq: rand(2200, 4800), q: 5 }, pan: pan + rand(-0.15, 0.15), priority: 0 });
    e.tone({ at: t, type: 'triangle', freq: rand(900, 1900), dur: 0.03, gain: level * 0.35, attack: 0.001, priority: 0 });
  }
}

const ROLL_SEMIS = [0, 3, 5, 7, 10, 12];
export function roll(e: E, value: number, seat: Seat): void {
  if (!e.gate('roll', 80)) return;
  const pan = SEAT_PAN[seat];
  // landing thunk
  e.tone({ type: 'sine', freq: 170, freqEnd: 48, glideTime: 0.12, dur: 0.22, gain: 0.32, attack: 0.002, pan });
  e.noise({ dur: 0.07, gain: 0.12, attack: 0.001, filter: { type: 'lowpass', freq: 900 }, pan });
  // tonal readout blip
  const v = Math.max(1, Math.min(6, Math.round(value)));
  const f = mtof(74 + ROLL_SEMIS[v - 1]);
  e.tone({ at: 0.06, type: 'square', freq: f, dur: 0.16, gain: 0.05, attack: 0.003, filter: { type: 'lowpass', freq: 3200, freqEnd: 1200, q: 1 }, echo: 0.25, pan: pan * 0.5 });
  e.tone({ at: 0.06, type: 'sine', freq: f * 2, dur: 0.12, gain: 0.04, attack: 0.002 });
}

export function six(e: E, streak: number): void {
  if (!e.gate('six', 150)) return;
  const shift = Math.max(0, streak - 1) * 3;
  const base = 62 + shift; // D4
  const notes = [0, 7, 12, 16, 19, 24];
  const step = 0.055 / Math.sqrt(e.speed);
  notes.forEach((s, i) => {
    const at = i * step;
    for (const det of [-6, 6]) {
      e.tone({
        at, type: 'sawtooth', freq: mtof(base + s), detune: det, dur: 0.5 * e.tail, gain: 0.032, attack: 0.006,
        filter: { type: 'lowpass', freq: 900, peak: 4200, peakAt: 0.05, freqEnd: 1400, q: 3 }, verb: 0.3, echo: 0.2, pan: -0.4 + i * 0.16,
      });
    }
  });
  // shimmer
  e.noise({ at: 0.08, dur: 0.7 * e.tail, gain: 0.05, attack: 0.15, env: 'pad', release: 0.45, filter: { type: 'bandpass', freq: 7000, freqEnd: 11000, q: 2 }, verb: 0.5 });
  e.tone({ at: notes.length * step, type: 'sine', freq: mtof(base + 31), dur: 0.6 * e.tail, gain: 0.03, vibrato: { rate: 9, depth: 30 }, verb: 0.6, echo: 0.4, priority: 0 });
  // power-up sub lift
  e.tone({ type: 'sine', freq: 60, freqEnd: 120, dur: 0.35, gain: 0.12, attack: 0.03 });
}

export function forfeit(e: E): void {
  // glitch bursts
  for (let i = 0; i < 9; i++) {
    const at = i * 0.045 + rand(0, 0.015);
    e.tone({ at, type: 'square', freq: rand(180, 2400), dur: rand(0.025, 0.05), gain: 0.05, attack: 0.001, drive: 8, crush: 5, pan: rand(-0.6, 0.6), priority: 0 });
  }
  // power-down
  e.tone({ at: 0.1, type: 'sawtooth', freq: 820, freqEnd: 38, dur: 0.95, gain: 0.13, attack: 0.01, drive: 6, filter: { type: 'lowpass', freq: 4000, freqEnd: 120, q: 4 }, verb: 0.25 });
  e.tone({ at: 0.1, type: 'square', freq: 410, freqEnd: 30, dur: 0.85, gain: 0.04, attack: 0.01, crush: 6, filter: { type: 'lowpass', freq: 2000, freqEnd: 150 } });
  e.tone({ at: 0.95, type: 'sine', freq: 90, freqEnd: 34, dur: 0.4, gain: 0.25, attack: 0.003 });
  e.noise({ at: 0.95, dur: 0.25, gain: 0.07, filter: { type: 'lowpass', freq: 600 } });
}

// ── Movement ─────────────────────────────────────────────────
export function moveStart(e: E, hopMs: number, enters: boolean, seat: Seat): void {
  if (!e.gate('moveStart', 60)) return;
  const pan = SEAT_PAN[seat] * 0.6;
  if (enters) {
    // deploy launch: laser sweep up
    const d = Math.max(0.25, Math.min(0.55, hopMs / 1000));
    e.tone({ type: 'sawtooth', freq: 180, freqEnd: 2600, dur: d, gain: 0.07, attack: 0.01, filter: { type: 'bandpass', freq: 600, freqEnd: 4000, q: 4 }, echo: 0.35, verb: 0.2, pan });
    e.tone({ type: 'square', freq: 360, freqEnd: 5200, dur: d * 0.9, gain: 0.02, attack: 0.01, filter: { type: 'lowpass', freq: 5000 }, pan: -pan });
    return;
  }
  const d = Math.max(0.12, Math.min(0.35, (hopMs * 1.4) / 1000));
  e.tone({ type: 'sawtooth', freq: 160, freqEnd: 300, dur: d, gain: 0.045, attack: 0.03, vibrato: { rate: 32, depth: 40 }, filter: { type: 'bandpass', freq: 900, freqEnd: 1500, q: 3 }, pan, priority: 0 });
}

export function hop(e: E, index: number, total: number, seat: Seat): void {
  if (!e.gate('hop', 35)) return;
  const deg = Math.min(PENTA.length - 1, index);
  const f = mtof(57 + PENTA[deg]);
  const d = Math.max(0.05, Math.min(0.13, 0.1 / Math.sqrt(e.speed)));
  const last = index >= total - 1;
  const pan = SEAT_PAN[seat] * 0.5;
  e.tone({ type: 'sine', freq: f * 1.6, freqEnd: f, glideTime: 0.025, dur: d, gain: last ? 0.12 : 0.085, attack: 0.002, pan, priority: 0 });
  e.tone({ type: 'triangle', freq: f * 2, dur: d * 0.7, gain: 0.02, attack: 0.002, pan, priority: 0 });
  e.noise({ dur: 0.025, gain: 0.03, attack: 0.001, filter: { type: 'lowpass', freq: 1800 }, pan, priority: 0 });
}

export function enter(e: E): void {
  // landing bass drop
  e.tone({ type: 'sine', freq: 120, freqEnd: 36, dur: 0.55 * e.tail, gain: 0.32, attack: 0.004, drive: 2 });
  e.noise({ dur: 0.18, gain: 0.08, filter: { type: 'lowpass', freq: 700, freqEnd: 150 } });
  e.tone({ at: 0.02, type: 'triangle', freq: mtof(74), dur: 0.25, gain: 0.04, echo: 0.3, priority: 0 });
}

export function capture(e: E): void {
  const tl = e.tail;
  // electric zap
  e.fm({ type: 'square', freq: 2200, freqEnd: 180, ratio: 2.7, index: 1.6, indexEnd: 0.3, dur: 0.3, gain: 0.07, attack: 0.002, filter: { type: 'bandpass', freq: 2500, freqEnd: 600, q: 1.2 }, verb: 0.2 });
  e.noise({ dur: 0.12, gain: 0.1, attack: 0.001, filter: { type: 'highpass', freq: 3000 } });
  // distorted bass impact
  e.tone({ at: 0.03, type: 'sine', freq: 95, freqEnd: 32, dur: 0.65 * tl, gain: 0.3, attack: 0.002, drive: 14, filter: { type: 'lowpass', freq: 1400, freqEnd: 200, q: 1 }, verb: 0.15, priority: 2 });
  // bit-crushed disintegration
  const steps = Math.round(9 * tl);
  for (let i = 0; i < steps; i++) {
    const at = 0.12 + i * 0.065 * tl;
    e.tone({ at, type: 'sawtooth', freq: mtof(86 - i * 3 + rand(-1, 1)), dur: 0.07, gain: 0.04 * (1 - i / steps), attack: 0.002, crush: 4, filter: { type: 'lowpass', freq: 5000 }, pan: rand(-0.7, 0.7), echo: 0.2, priority: 0 });
  }
  // crackle
  for (let i = 0; i < 14; i++) {
    const at = 0.1 + Math.pow(Math.random(), 1.6) * 0.75 * tl;
    e.noise({ at, dur: rand(0.006, 0.02), gain: rand(0.03, 0.08), attack: 0.001, filter: { type: 'bandpass', freq: rand(3000, 9000), q: 3 }, pan: rand(-0.8, 0.8), priority: 0 });
  }
  e.duckMusic(0.6, 0.6);
}

export function shieldBlock(e: E): void {
  e.tone({ type: 'sine', freq: 1320, dur: 1.0 * e.tail, gain: 0.07, attack: 0.003, vibrato: { rate: 7, depth: 12 }, verb: 0.5, echo: 0.2 });
  e.tone({ type: 'sine', freq: 1980, dur: 0.7 * e.tail, gain: 0.04, attack: 0.003, verb: 0.5 });
  e.fm({ freq: 660, ratio: 3.5, index: 2, indexEnd: 0, dur: 0.9 * e.tail, gain: 0.05, verb: 0.4 });
  e.noise({ dur: 0.6, gain: 0.07, attack: 0.002, filter: { type: 'bandpass', freq: 1500, q: 28 }, verb: 0.3 });
  e.tone({ type: 'sine', freq: 220, dur: 0.5, gain: 0.12, attack: 0.01, vibrato: { rate: 14, depth: 60 } });
}

export function finish(e: E, seat: Seat): void {
  const tl = e.tail;
  const chord = [74, 78, 81, 88]; // D5 F#5 A5 E6
  chord.forEach((m, i) => {
    for (const det of [-7, 7]) {
      e.tone({
        at: i * 0.03, type: 'sawtooth', freq: mtof(m), detune: det, dur: 1.2 * tl, gain: 0.026, attack: 0.02,
        filter: { type: 'lowpass', freq: 800, peak: 5000, peakAt: 0.12, freqEnd: 1800, q: 1.5 }, verb: 0.45, pan: -0.3 + i * 0.2,
      });
    }
  });
  e.tone({ at: 0.12, type: 'sine', freq: mtof(93), dur: 0.9 * tl, gain: 0.04, verb: 0.6, echo: 0.4 });
  e.tone({ type: 'sine', freq: mtof(38), dur: 0.6, gain: 0.18, attack: 0.01, pan: SEAT_PAN[seat] * 0.3 });
  e.noise({ dur: 0.8 * tl, gain: 0.04, attack: 0.1, env: 'pad', release: 0.5, filter: { type: 'highpass', freq: 8000 }, verb: 0.5, priority: 0 });
}

export function extraTurn(e: E): void {
  if (!e.gate('extraTurn', 200)) return;
  e.tone({ type: 'triangle', freq: mtof(88), dur: 0.3, gain: 0.06, attack: 0.003, echo: 0.3 });
  e.tone({ at: 0.09, type: 'triangle', freq: mtof(95), dur: 0.45 * e.tail, gain: 0.06, attack: 0.003, echo: 0.35, verb: 0.3 });
  e.tone({ at: 0.09, type: 'sine', freq: mtof(107), dur: 0.35, gain: 0.02, priority: 0 });
}

// ── Power-ups ────────────────────────────────────────────────
export function collect(e: E, power: PowerType): void {
  switch (power) {
    case 'shield':
      e.tone({ type: 'sine', freq: 400, freqEnd: 1600, dur: 0.45, gain: 0.08, attack: 0.02, vibrato: { rate: 10, depth: 20 }, verb: 0.4 });
      e.tone({ type: 'triangle', freq: 800, freqEnd: 3200, dur: 0.4, gain: 0.03, attack: 0.02, echo: 0.3 });
      break;
    case 'boost':
      e.tone({ type: 'sawtooth', freq: 200, freqEnd: 2200, dur: 0.3, gain: 0.05, attack: 0.01, filter: { type: 'lowpass', freq: 800, freqEnd: 6000, q: 6 }, echo: 0.3 });
      e.tone({ type: 'square', freq: 100, freqEnd: 400, dur: 0.3, gain: 0.03, filter: { type: 'lowpass', freq: 1500 } });
      break;
    case 'reroll':
      e.tone({ type: 'triangle', freq: 900, freqEnd: 300, dur: 0.18, gain: 0.07, attack: 0.005 });
      e.tone({ at: 0.16, type: 'triangle', freq: 300, freqEnd: 1800, dur: 0.3, gain: 0.07, attack: 0.005, echo: 0.35, vibrato: { rate: 16, depth: 50 } });
      break;
    case 'emp':
      e.tone({ type: 'square', freq: 100, freqEnd: 900, dur: 0.45, gain: 0.05, vibrato: { rate: 18, depth: 300 }, filter: { type: 'lowpass', freq: 600, freqEnd: 3500, q: 5 }, verb: 0.3 });
      break;
  }
  // absorption sparkle common to all
  [0, 4, 7, 12].forEach((s, i) => e.tone({ at: 0.25 + i * 0.045, type: 'sine', freq: mtof(86 + s), dur: 0.2, gain: 0.025, echo: 0.3, priority: 0 }));
}

export function usePower(e: E, power: PowerType): void {
  switch (power) {
    case 'shield': {
      for (const f of [110, 110.6, 220]) {
        e.tone({ type: 'sawtooth', freq: f, dur: 1.2 * e.tail, gain: 0.05, attack: 0.25, env: 'pad', release: 0.5, filter: { type: 'lowpass', freq: 300, freqEnd: 1400, glide: 0.5, q: 6 }, verb: 0.35 });
      }
      e.tone({ at: 0.3, type: 'sine', freq: 1760, dur: 0.6, gain: 0.04, vibrato: { rate: 6, depth: 15 }, verb: 0.5, echo: 0.3 });
      break;
    }
    case 'boost': {
      // engine rev with two "gear" steps
      e.tone({ type: 'sawtooth', freq: 70, freqEnd: 180, glideTime: 0.35, dur: 0.4, gain: 0.08, attack: 0.02, drive: 5, filter: { type: 'lowpass', freq: 600, freqEnd: 1800, q: 3 }, vibrato: { rate: 24, depth: 35 } });
      e.tone({ at: 0.38, type: 'sawtooth', freq: 120, freqEnd: 300, glideTime: 0.4, dur: 0.55 * e.tail, gain: 0.08, attack: 0.01, drive: 5, filter: { type: 'lowpass', freq: 900, freqEnd: 3000, q: 3 }, vibrato: { rate: 30, depth: 30 } });
      e.noise({ at: 0.38, dur: 0.5, gain: 0.05, filter: { type: 'bandpass', freq: 1200, freqEnd: 4000, q: 1 }, echo: 0.2 });
      break;
    }
    case 'reroll': {
      // reverse whoosh: swelling envelope, ends in a snap
      e.noise({ dur: 0.5, gain: 0.12, attack: 0.46, env: 'pad', release: 0.03, filter: { type: 'bandpass', freq: 3200, freqEnd: 500, q: 1.5 } });
      e.tone({ type: 'sine', freq: 1600, freqEnd: 300, dur: 0.5, gain: 0.05, attack: 0.45, env: 'pad', release: 0.03 });
      e.tone({ at: 0.5, type: 'square', freq: 1400, dur: 0.03, gain: 0.05, filter: { type: 'bandpass', freq: 2000, q: 2 } });
      break;
    }
    case 'emp': {
      // charge-up whine (the 'emp' event carries the blast)
      e.tone({ type: 'sine', freq: 300, freqEnd: 2400, dur: 0.35, gain: 0.06, attack: 0.05, env: 'pad', release: 0.05, vibrato: { rate: 20, depth: 40 } });
      e.tone({ type: 'sawtooth', freq: 150, freqEnd: 1200, dur: 0.35, gain: 0.025, attack: 0.05, env: 'pad', release: 0.05, filter: { type: 'lowpass', freq: 2000 } });
      break;
    }
  }
}

export function emp(e: E, hits: number): void {
  const at = 0.25;
  const tl = e.tail;
  e.tone({ at, type: 'sine', freq: 72, freqEnd: 26, dur: 1.5 * tl, gain: 0.42, attack: 0.005, drive: 3, priority: 2 });
  e.tone({ at, type: 'sawtooth', freq: 140, freqEnd: 40, dur: 1.1 * tl, gain: 0.06, attack: 0.005, vibrato: { rate: 8, depth: 200 }, filter: { type: 'lowpass', freq: 1200, freqEnd: 90, q: 6 } });
  e.noise({ at, dur: 1.3 * tl, gain: 0.14, attack: 0.004, filter: { type: 'lowpass', freq: 3000, freqEnd: 80, q: 2 }, verb: 0.4 });
  const n = 10 + Math.min(4, hits) * 3;
  for (let i = 0; i < n; i++) {
    e.noise({ at: at + 0.05 + Math.pow(Math.random(), 1.4) * 1.0 * tl, dur: rand(0.006, 0.025), gain: rand(0.03, 0.08), attack: 0.001, filter: { type: 'bandpass', freq: rand(2500, 8000), q: 4 }, pan: rand(-0.9, 0.9), priority: 0 });
  }
  e.duckMusic(0.45, 1.2);
}

export function spawnPower(e: E): void {
  if (!e.gate('spawnPower', 160)) return;
  for (let i = 0; i < 3; i++) {
    e.tone({ at: i * 0.06, type: 'sine', freq: mtof(91 + pick(PENTA.slice(0, 6))), dur: 0.18, gain: 0.018, attack: 0.003, pan: rand(-0.6, 0.6), echo: 0.4, priority: 0 });
  }
}

// ── Turn flow ────────────────────────────────────────────────
const SEAT_TIMBRE: Record<Seat, { type: OscillatorType; notes: [number, number] }> = {
  0: { type: 'sine', notes: [81, 86] },
  1: { type: 'triangle', notes: [79, 84] },
  2: { type: 'square', notes: [77, 81] },
  3: { type: 'sawtooth', notes: [76, 83] },
};

export function turn(e: E, seat: Seat): void {
  if (!e.gate('turn', 150)) return;
  const tb = SEAT_TIMBRE[seat] ?? SEAT_TIMBRE[0];
  const harsh = tb.type === 'square' || tb.type === 'sawtooth';
  const pan = SEAT_PAN[seat] * 0.5;
  tb.notes.forEach((m, i) => {
    e.tone({
      at: i * 0.075, type: tb.type, freq: mtof(m), dur: 0.22, gain: harsh ? 0.025 : 0.055, attack: 0.004,
      filter: harsh ? { type: 'lowpass', freq: 2400, freqEnd: 900, q: 1 } : undefined, echo: 0.25, pan,
    });
  });
}

export function noMoves(e: E): void {
  for (let i = 0; i < 2; i++) {
    const at = i * 0.17;
    e.tone({ at, type: 'square', freq: 110, dur: 0.13, gain: 0.06, attack: 0.005, env: 'pad', release: 0.03, filter: { type: 'lowpass', freq: 700 } });
    e.tone({ at, type: 'square', freq: 116.5, dur: 0.13, gain: 0.05, attack: 0.005, env: 'pad', release: 0.03, filter: { type: 'lowpass', freq: 700 } });
  }
}

export function playerDone(e: E): void {
  const stab = (at: number, notes: number[], dur: number) =>
    notes.forEach((m, i) =>
      e.tone({ at, type: 'sawtooth', freq: mtof(m), dur, gain: 0.03, attack: 0.015, env: 'pad', release: dur * 0.6, filter: { type: 'lowpass', freq: 700, peak: 4000, peakAt: 0.08, freqEnd: 1500, q: 1.5 }, verb: 0.4, pan: -0.3 + i * 0.2 }),
    );
  stab(0, [62, 66, 69, 74], 0.35);
  stab(0.3, [64, 69, 73, 76], 1.0 * e.tail);
  e.tone({ at: 0.3, type: 'sine', freq: mtof(45), dur: 0.8, gain: 0.16, attack: 0.01 });
  e.tone({ at: 0.35, type: 'sine', freq: mtof(93), dur: 0.8, gain: 0.03, echo: 0.4, verb: 0.5 });
}

export function gameStart(e: E): void {
  e.tone({ type: 'sine', freq: 55, freqEnd: 40, dur: 0.6, gain: 0.25, attack: 0.005 });
  e.tone({ type: 'sawtooth', freq: 60, freqEnd: 1200, dur: 0.85, gain: 0.07, attack: 0.05, filter: { type: 'lowpass', freq: 200, freqEnd: 5000, q: 6 }, verb: 0.3 });
  e.noise({ dur: 0.8, gain: 0.05, attack: 0.5, env: 'pad', release: 0.05, filter: { type: 'bandpass', freq: 400, freqEnd: 6000, q: 2 } });
  [74, 81, 86].forEach((m, i) =>
    e.tone({ at: 0.8 + i * 0.08, type: 'square', freq: mtof(m), dur: 0.1, gain: 0.035, attack: 0.002, filter: { type: 'lowpass', freq: 4000 }, echo: 0.35 }),
  );
  e.tone({ at: 1.04, type: 'sine', freq: mtof(98), dur: 0.5, gain: 0.03, verb: 0.5, echo: 0.3 });
}

// ── Victory ──────────────────────────────────────────────────
/** Lead-in riser on the `win` engine event (bridges to the fanfare on `victoryStart`). */
export function winRiser(e: E): void {
  const d = Math.max(0.4, 0.9 / e.speed);
  e.noise({ dur: d, gain: 0.09, attack: d * 0.9, env: 'pad', release: 0.05, filter: { type: 'highpass', freq: 600, freqEnd: 7000, q: 1 }, verb: 0.3, priority: 2 });
  e.tone({ type: 'sawtooth', freq: 110, freqEnd: 880, dur: d, gain: 0.04, attack: d * 0.8, env: 'pad', release: 0.05, filter: { type: 'lowpass', freq: 400, freqEnd: 4000, q: 4 }, priority: 2 });
  e.duckMusic(0.35, d + 0.5);
}

function brass(e: E, midi: number, at: number, dur: number, gain: number, pan: number): void {
  for (const det of [-8, 8]) {
    e.tone({
      at, type: 'sawtooth', freq: mtof(midi), detune: det, dur, gain, attack: 0.045, env: 'pad', release: Math.min(0.6, dur * 0.4),
      filter: { type: 'lowpass', freq: 350, peak: 3200, peakAt: 0.09, freqEnd: 1700, glide: 0.4, q: 1.8 }, verb: 0.4, pan, priority: 2,
    });
  }
}

function impact(e: E, at: number, size: number): void {
  e.tone({ at, type: 'sine', freq: 130, freqEnd: 34, glideTime: 0.25, dur: 0.9 * size, gain: 0.38, attack: 0.002, drive: 2, priority: 2 });
  e.noise({ at, dur: 0.6 * size, gain: 0.1, attack: 0.002, filter: { type: 'lowpass', freq: 5000, freqEnd: 200, q: 0.8 }, verb: 0.6, priority: 2 });
}

/** ~4s cinematic: bVI – bVII – I brass cadence, arps, riser, impacts. */
export function victoryFanfare(e: E): void {
  e.duckMusic(0.15, 4.4);
  const B = 0.42;
  impact(e, 0, 0.6);
  // bVI (Bb) stab
  [58, 62, 65, 70].forEach((m, i) => brass(e, m, 0, B * 0.95, 0.022, -0.3 + i * 0.2));
  e.tone({ type: 'sine', freq: mtof(34), dur: B, gain: 0.16, attack: 0.01, priority: 2 });
  // bVII (C) stab
  [60, 64, 67, 72].forEach((m, i) => brass(e, m, B, B * 0.95, 0.022, -0.3 + i * 0.2));
  e.tone({ at: B, type: 'sine', freq: mtof(36), dur: B, gain: 0.16, attack: 0.01, priority: 2 });
  // riser into the tonic
  e.noise({ dur: B * 2, gain: 0.06, attack: B * 1.9, env: 'pad', release: 0.03, filter: { type: 'highpass', freq: 1000, freqEnd: 9000 }, priority: 2 });
  // I (D major) — big held chord
  const T = B * 2;
  impact(e, T, 1.2);
  [62, 66, 69, 74, 78].forEach((m, i) => brass(e, m, T, 3.1, 0.022, -0.4 + i * 0.2));
  e.tone({ at: T, type: 'sine', freq: mtof(38), dur: 2.6, gain: 0.2, attack: 0.02, env: 'pad', release: 1.2, priority: 2 });
  e.tone({ at: T, type: 'sawtooth', freq: mtof(50), dur: 2.4, gain: 0.04, attack: 0.02, env: 'pad', release: 1.2, filter: { type: 'lowpass', freq: 500 }, priority: 2 });
  // lead melody A5 → D6
  e.tone({ at: 0, type: 'square', freq: mtof(77), dur: B * 0.9, gain: 0.03, attack: 0.01, env: 'pad', release: 0.1, filter: { type: 'lowpass', freq: 3500 }, echo: 0.25, priority: 2 });
  e.tone({ at: B, type: 'square', freq: mtof(79), dur: B * 0.9, gain: 0.03, attack: 0.01, env: 'pad', release: 0.1, filter: { type: 'lowpass', freq: 3500 }, echo: 0.25, priority: 2 });
  e.tone({ at: T, type: 'square', freq: mtof(81), dur: 1.6, gain: 0.035, attack: 0.01, env: 'pad', release: 0.8, vibrato: { rate: 5.5, depth: 18 }, filter: { type: 'lowpass', freq: 4000 }, echo: 0.3, verb: 0.3, priority: 2 });
  // running arpeggio
  const arp = [74, 78, 81, 86, 90, 86, 81, 78];
  const sixteenth = 0.075;
  const count = 30;
  for (let i = 0; i < count; i++) {
    const at = T + 0.1 + i * sixteenth;
    const fade = 1 - i / count;
    e.tone({ at, type: 'square', freq: mtof(arp[i % arp.length] + (i >= 16 ? 12 : 0)), dur: 0.12, gain: 0.025 * (0.5 + fade * 0.5), attack: 0.003, filter: { type: 'lowpass', freq: 3800, q: 1 }, pan: i % 2 ? 0.45 : -0.45, echo: 0.25, priority: 1 });
  }
  // shimmer bells
  for (let i = 0; i < 6; i++) {
    e.tone({ at: T + 0.4 + i * 0.42, type: 'sine', freq: mtof(pick([86, 90, 93, 98, 102])), dur: 0.9, gain: 0.02, attack: 0.005, verb: 0.8, echo: 0.4, pan: rand(-0.8, 0.8), priority: 0 });
  }
  e.noise({ at: T, dur: 2.8, gain: 0.03, attack: 0.6, env: 'pad', release: 1.5, filter: { type: 'highpass', freq: 9000 }, verb: 0.6, priority: 0 });
  // final sparkle hit
  impact(e, T + 2.6, 0.5);
}

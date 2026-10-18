// ─────────────────────────────────────────────────────────────
// Generative ambient cyberpunk music bed.
//  • Pad: 4 voices × 2 detuned saws (persistent oscillators, glided
//    between chords) → slowly LFO-modulated resonant lowpass.
//  • Sub bass pulse + soft kick (game intensity).
//  • Sparse euclidean arpeggio on D minor (echo + reverb).
//  • Noise hats (game intensity).
// Scheduled with a look-ahead scheduler on the audio clock.
// ─────────────────────────────────────────────────────────────
import type { AudioEngine, MusicController, MusicScene } from './engine';
import { mtof, rand } from './engine';

const BPM = 90;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD = 0.14; // seconds
const TICK_MS = 30;
const STEPS_PER_CHORD = 32; // 2 bars

interface Chord {
  pad: [number, number, number, number];
  bass: number;
  arp: number[];
}

// i – VI – iv – v  in D minor (dark, cyclical)
const PROGRESSION: Chord[] = [
  { pad: [50, 57, 62, 65], bass: 38, arp: [62, 65, 69, 72, 74, 77] },
  { pad: [46, 53, 62, 65], bass: 34, arp: [58, 62, 65, 69, 70, 74] },
  { pad: [43, 50, 58, 62], bass: 31, arp: [62, 65, 67, 70, 74, 79] },
  { pad: [45, 52, 60, 64], bass: 33, arp: [57, 60, 64, 69, 72, 76] },
];

interface LayerLevels {
  pad: number;
  bass: number;
  arp: number;
  hat: number;
  cutoff: number;
  arpDensity: number;
}

const SCENES: Record<MusicScene, LayerLevels> = {
  off: { pad: 0, bass: 0, arp: 0, hat: 0, cutoff: 300, arpDensity: 0 },
  calm: { pad: 0.9, bass: 0, arp: 0.55, hat: 0, cutoff: 520, arpDensity: 0.28 },
  game: { pad: 0.7, bass: 1, arp: 0.9, hat: 1, cutoff: 820, arpDensity: 0.8 },
  victory: { pad: 1.1, bass: 0.9, arp: 1, hat: 0.8, cutoff: 2100, arpDensity: 1 },
  results: { pad: 0.95, bass: 0.4, arp: 0.7, hat: 0.3, cutoff: 1100, arpDensity: 0.5 },
};

/** Euclidean rhythm: k hits spread over n steps, rotated by r. */
function euclid(k: number, n: number, r: number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(((i + r) * k) % n < k);
  return out;
}

export class MusicSystem implements MusicController {
  private engine: AudioEngine;
  private running = false;
  private wanted = false;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private scene: MusicScene = 'calm';
  private levels: LayerLevels = SCENES.calm;

  // persistent nodes
  private built = false;
  private padOscs: OscillatorNode[] = [];
  private padFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private bassGain!: GainNode;
  private arpGain!: GainNode;
  private hatGain!: GainNode;
  private arpPattern = euclid(5, 16, 0);
  private arpIdx = 0;
  private arpDir = 1;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  // ── controller API ────────────────────────────────────────
  start(): void {
    this.wanted = true;
    const ctx = this.engine.ctx;
    if (!ctx || !this.engine.unlocked) return;
    if (!this.built) this.build();
    if (this.running) return;
    this.running = true;
    this.nextTime = ctx.currentTime + 0.1;
    this.applyScene(2.5);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.wanted = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    if (this.built) {
      const t = this.engine.now;
      for (const g of [this.padGain, this.bassGain, this.arpGain, this.hatGain]) g.gain.setTargetAtTime(0, t, 0.3);
    }
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.levels = SCENES[scene];
    if (scene === 'game' || scene === 'victory') this.arpPattern = euclid(scene === 'victory' ? 7 : 5, 16, this.step % 16);
    if (this.built) this.applyScene(scene === 'victory' ? 1.4 : 2.2);
  }

  onResume(): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    if (this.wanted && !this.running) this.start();
    // skip ahead instead of bursting missed notes
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
  }

  // ── internals ─────────────────────────────────────────────
  private build(): void {
    const ctx = this.engine.ctx!;
    const t = ctx.currentTime;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 400;
    this.padFilter.Q.value = 3.5;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padHp = ctx.createBiquadFilter();
    padHp.type = 'highpass';
    padHp.frequency.value = 70;
    this.padFilter.connect(padHp).connect(this.padGain);
    this.padGain.connect(this.engine.musicIn);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.55;
    this.padGain.connect(padSend).connect(this.engine.musicVerbIn);

    // slow filter sweep
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.045;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 280;
    this.lfo.connect(this.lfoGain).connect(this.padFilter.frequency);
    this.lfo.start(t);

    const chord = PROGRESSION[0];
    const voiceGain = 0.028;
    chord.pad.forEach((m, i) => {
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det + rand(-2, 2);
        const g = ctx.createGain();
        g.gain.value = voiceGain * (i === 0 ? 1.15 : 1);
        const p = ctx.createStereoPanner();
        p.pan.value = det < 0 ? -0.35 - i * 0.08 : 0.35 + i * 0.08;
        o.connect(g).connect(p).connect(this.padFilter);
        o.start(t);
        this.padOscs.push(o);
      }
    });

    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0;
    this.bassGain.connect(this.engine.musicIn);
    this.arpGain = ctx.createGain();
    this.arpGain.gain.value = 0;
    this.arpGain.connect(this.engine.musicIn);
    this.hatGain = ctx.createGain();
    this.hatGain.gain.value = 0;
    this.hatGain.connect(this.engine.musicIn);
    this.built = true;
  }

  private applyScene(tc: number): void {
    const t = this.engine.now;
    const L = this.levels;
    const on = this.running ? 1 : 0;
    this.padGain.gain.setTargetAtTime(L.pad * on, t, tc);
    this.bassGain.gain.setTargetAtTime(L.bass * on, t, tc * 0.6);
    this.arpGain.gain.setTargetAtTime(L.arp * on, t, tc * 0.6);
    this.hatGain.gain.setTargetAtTime(L.hat * on, t, tc * 0.6);
    this.padFilter.frequency.setTargetAtTime(L.cutoff, t, tc);
    this.lfoGain.gain.setTargetAtTime(L.cutoff * 0.45, t, tc);
  }

  private tick(): void {
    const ctx = this.engine.ctx;
    if (!ctx || ctx.state !== 'running' || this.engine.hidden) return;
    const now = ctx.currentTime;
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05; // recovered from a stall
    while (this.nextTime < now + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime - now);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private schedule(step: number, at: number): void {
    const E = this.engine;
    const L = this.levels;
    const s16 = step % 16;
    const chordIdx = Math.floor(step / STEPS_PER_CHORD) % PROGRESSION.length;
    const chord = PROGRESSION[chordIdx];

    // chord change → glide pad oscillators
    if (step % STEPS_PER_CHORD === 0) {
      const ctx = E.ctx!;
      const t = ctx.currentTime + at;
      chord.pad.forEach((m, i) => {
        for (let k = 0; k < 2; k++) {
          const o = this.padOscs[i * 2 + k];
          if (o) o.frequency.setTargetAtTime(mtof(m), t, 0.35);
        }
      });
      // occasionally re-roll the arp rhythm for variation
      if (Math.random() < 0.5) {
        const k = this.scene === 'victory' ? 7 : this.scene === 'game' ? pickInt(4, 6) : 3;
        this.arpPattern = euclid(k, 16, pickInt(0, 15));
      }
    }

    // soft kick + sub bass pulse
    if (L.bass > 0) {
      if (s16 === 0 || s16 === 8) {
        E.tone({ bus: 'music', out: this.bassGain, at, type: 'sine', freq: 120, freqEnd: 44, glideTime: 0.09, dur: 0.32, gain: 0.32, attack: 0.003 });
      }
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 11 || s16 === 14) {
        const f = mtof(chord.bass);
        const accent = s16 === 0 || s16 === 8 ? 1 : 0.7;
        E.tone({ bus: 'music', out: this.bassGain, at: at + 0.01, type: 'sine', freq: f, dur: 0.42, gain: 0.2 * accent, attack: 0.02 });
        E.tone({
          bus: 'music', out: this.bassGain, at: at + 0.01, type: 'sawtooth', freq: f * 2, dur: 0.28, gain: 0.04 * accent, attack: 0.01,
          filter: { type: 'lowpass', freq: 900, freqEnd: 180, glide: 0.2, q: 4 },
        });
      }
    }

    // hats
    if (L.hat > 0) {
      const off = s16 % 4 === 2;
      if (off || (Math.random() < 0.22 && s16 % 2 === 1)) {
        E.noise({
          bus: 'music', out: this.hatGain, at, dur: off ? 0.06 : 0.035, gain: off ? 0.05 : 0.025, attack: 0.001,
          filter: { type: 'highpass', freq: 7500, q: 0.8 }, pan: rand(-0.4, 0.4), priority: 0,
        });
      }
    }

    // arpeggio
    if (L.arp > 0 && this.arpPattern[s16] && Math.random() < L.arpDensity) {
      const notes = chord.arp;
      this.arpIdx += this.arpDir;
      if (this.arpIdx >= notes.length - 1 || this.arpIdx <= 0) this.arpDir *= -1;
      this.arpIdx = Math.max(0, Math.min(notes.length - 1, this.arpIdx));
      const m = notes[this.arpIdx] + (this.scene === 'victory' && Math.random() < 0.3 ? 12 : 0);
      const calm = this.scene === 'calm';
      E.tone({
        bus: 'music', out: this.arpGain, at, type: calm ? 'triangle' : 'square', freq: mtof(m),
        dur: calm ? 0.9 : 0.32, gain: calm ? 0.07 : 0.045, attack: calm ? 0.02 : 0.004,
        filter: { type: 'lowpass', freq: calm ? 1600 : 2600, freqEnd: 700, glide: 0.25, q: 2 },
        pan: rand(-0.5, 0.5), verb: 0.5, echo: 0.45, priority: 0,
      });
    }

    // rare high glints in calm/results for evolving texture
    if ((this.scene === 'calm' || this.scene === 'results') && s16 === 0 && Math.random() < 0.18) {
      E.tone({
        bus: 'music', out: this.arpGain, at, type: 'sine', freq: mtof(pickArr(chord.arp) + 24),
        dur: 2.2, gain: 0.025, attack: 0.4, env: 'pad', release: 1.6, pan: rand(-0.8, 0.8), verb: 0.9, echo: 0.3, priority: 0,
      });
    }
  }
}

function pickInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}
function pickArr(a: readonly number[]): number {
  return a[Math.floor(Math.random() * a.length)];
}

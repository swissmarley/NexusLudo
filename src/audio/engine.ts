// ─────────────────────────────────────────────────────────────
// NEXUS LUDO — procedural audio engine (Web Audio API, no assets)
//
// Graph:
//   sfx voices ──► sfxIn ─────────────┐
//              ├─► sfxVerbIn ► conv ──┼─► sfxGain ──┐
//              └─► sfxEchoIn ► pingpong┘             │
//   music voices ► musicIn / verb / echo ► musicGain ► musicDuck ─┤
//                                                    ▼
//                                   master ► limiter ► out ► destination
// ─────────────────────────────────────────────────────────────
import type { SettingsState } from '../store/settings';
import { useSettings } from '../store/settings';

export type Bus = 'sfx' | 'music';

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Optional fast excursion (e.g. brass "bwah"): ramp to `peak` by `peakAt` seconds. */
  peak?: number;
  peakAt?: number;
  /** Glide target reached after `glide` seconds (defaults to voice duration). */
  freqEnd?: number;
  glide?: number;
  q?: number;
}

export interface VoiceOpts {
  /** Start offset in seconds from "now". */
  at?: number;
  /** Total duration in seconds (including release). */
  dur: number;
  gain: number;
  attack?: number;
  /** perc = exponential decay over dur; pad = hold then linear release. */
  env?: 'perc' | 'pad';
  release?: number;
  filter?: FilterSpec;
  pan?: number;
  verb?: number;
  echo?: number;
  /** Waveshaper saturation amount (1..100). */
  drive?: number;
  /** Amplitude quantisation steps (bit-crush flavour), e.g. 6..16. */
  crush?: number;
  bus?: Bus;
  /** Override dry destination (music layers). */
  out?: AudioNode;
  /** 0 = cosmetic (dropped first under load), 1 = normal, 2 = critical. */
  priority?: number;
}

export interface ToneOpts extends VoiceOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Seconds to reach freqEnd (default dur). */
  glideTime?: number;
  glide?: 'exp' | 'lin';
  detune?: number;
  vibrato?: { rate: number; depth: number };
}

export interface NoiseOpts extends VoiceOpts {
  rate?: number;
}

export interface FmOpts extends VoiceOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Modulator frequency = freq * ratio. */
  ratio: number;
  /** Modulation index (deviation = index * modFreq). */
  index: number;
  indexEnd?: number;
}

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const volCurve = (v: number): number => Math.pow(Math.max(0, Math.min(1, v)), 1.6);

const SOFT_LIMIT = 40; // cosmetic voices dropped above this
const HARD_LIMIT = 96; // only critical voices above this

export interface MusicController {
  start(): void;
  stop(): void;
  setScene(scene: MusicScene): void;
  onResume(): void;
}

export type MusicScene = 'off' | 'calm' | 'game' | 'victory' | 'results';

export class AudioEngine {
  private static inst: AudioEngine | null = null;
  static get(): AudioEngine {
    if (!AudioEngine.inst) AudioEngine.inst = new AudioEngine();
    return AudioEngine.inst;
  }

  ctx: AudioContext | null = null;
  unlocked = false;
  hidden = false;
  voices = 0;

  master!: GainNode;
  limiter!: DynamicsCompressorNode;
  sfxGain!: GainNode;
  sfxIn!: GainNode;
  sfxVerbIn!: GainNode;
  sfxEchoIn!: GainNode;
  musicGain!: GainNode;
  musicDuck!: GainNode;
  musicIn!: GainNode;
  musicVerbIn!: GainNode;
  musicEchoIn!: GainNode;

  private noiseBuf: AudioBuffer | null = null;
  private curves = new Map<string, Float32Array<ArrayBuffer>>();
  private gates = new Map<string, number>();
  private settings: Pick<SettingsState, 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'muted' | 'speed'>;
  private music: MusicController | null = null;
  private suspendTimer: number | null = null;
  private duckUntil = 0;

  constructor() {
    const s = useSettings.getState();
    this.settings = {
      masterVolume: s.masterVolume,
      musicVolume: s.musicVolume,
      sfxVolume: s.sfxVolume,
      muted: s.muted,
      speed: s.speed,
    };
  }

  attachMusic(m: MusicController): void {
    this.music = m;
  }

  /** True when sounds can actually be heard/scheduled. */
  get ready(): boolean {
    return !!this.ctx && this.unlocked && !this.hidden && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get speed(): number {
    return Math.max(0.5, Math.min(2.5, this.settings.speed || 1));
  }

  /** Tail-length multiplier: shortens long sounds at high game speed so they don't smear together. */
  get tail(): number {
    return Math.max(0.55, Math.min(1, 1 / Math.sqrt(this.speed)));
  }

  // ── lifecycle ─────────────────────────────────────────────
  /** Call from a user-gesture handler. Creates / resumes the context. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    const first = !this.unlocked;
    this.unlocked = true;
    if (this.ctx.state !== 'running' && !this.hidden) {
      void this.ctx.resume().then(() => this.music?.onResume());
    }
    if (first) this.music?.start();
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return;
    const t = ctx.currentTime;
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (hidden) {
      this.master.gain.setTargetAtTime(0, t, 0.08);
      this.suspendTimer = window.setTimeout(() => {
        this.suspendTimer = null;
        if (this.hidden && ctx.state === 'running') void ctx.suspend();
      }, 450);
    } else {
      const resume = () => {
        this.applyGains();
        this.music?.onResume();
      };
      if (ctx.state !== 'running') void ctx.resume().then(resume);
      else resume();
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    const out = ctx.createGain();
    out.gain.value = 0.92;
    this.master.connect(this.limiter).connect(out).connect(ctx.destination);

    // SFX bus
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.sfxIn = ctx.createGain();
    this.sfxIn.connect(this.sfxGain);
    this.sfxVerbIn = ctx.createGain();
    const sfxConv = ctx.createConvolver();
    sfxConv.buffer = this.makeImpulse(2.2, 3.2, 3200);
    const sfxVerbRet = ctx.createGain();
    sfxVerbRet.gain.value = 0.8;
    this.sfxVerbIn.connect(sfxConv).connect(sfxVerbRet).connect(this.sfxGain);
    this.sfxEchoIn = ctx.createGain();
    this.makePingPong(this.sfxEchoIn, this.sfxGain, 0.19, 0.32, 3800);

    // Music bus
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicDuck = ctx.createGain();
    this.musicGain.connect(this.musicDuck).connect(this.master);
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.musicGain);
    this.musicVerbIn = ctx.createGain();
    const musicConv = ctx.createConvolver();
    musicConv.buffer = this.makeImpulse(4.2, 2.6, 2400);
    const musicVerbRet = ctx.createGain();
    musicVerbRet.gain.value = 0.9;
    this.musicVerbIn.connect(musicConv).connect(musicVerbRet).connect(this.musicGain);
    this.musicEchoIn = ctx.createGain();
    // dotted-eighth at 90 BPM = 0.5s
    this.makePingPong(this.musicEchoIn, this.musicGain, 0.5, 0.38, 2600);

    // noise
    const len = Math.floor(ctx.sampleRate * 2);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.applyGains(true);
  }

  private makeImpulse(seconds: number, decay: number, brightness: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const pre = Math.floor(sr * 0.012);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        // one-pole lowpass whose cutoff closes over time → darker tail
        const cutoff = brightness * (1 - x * 0.85);
        const a = Math.exp((-2 * Math.PI * cutoff) / sr);
        lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
        ch[i] = lp * Math.pow(1 - x, decay) * 2.2;
      }
    }
    return buf;
  }

  private makePingPong(input: AudioNode, output: AudioNode, time: number, fb: number, tone: number): void {
    const ctx = this.ctx!;
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = time;
    dr.delayTime.value = time;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tone;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const fbg = ctx.createGain();
    fbg.gain.value = fb;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.7;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.7;
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    input.connect(hp).connect(dl);
    dl.connect(dr);
    dr.connect(lp).connect(fbg).connect(dl);
    dl.connect(pl).connect(wet);
    dr.connect(pr).connect(wet);
    wet.connect(output);
  }

  // ── settings ──────────────────────────────────────────────
  applySettings(s: SettingsState): void {
    this.settings = {
      masterVolume: s.masterVolume,
      musicVolume: s.musicVolume,
      sfxVolume: s.sfxVolume,
      muted: s.muted,
      speed: s.speed,
    };
    this.applyGains();
  }

  private applyGains(instant = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.settings;
    const t = ctx.currentTime;
    const tc = instant ? 0.01 : 0.06;
    const master = this.hidden ? 0 : s.muted ? 0 : volCurve(s.masterVolume);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(master, t, this.hidden ? 0.08 : tc);
    this.sfxGain.gain.setTargetAtTime(volCurve(s.sfxVolume), t, tc);
    this.musicGain.gain.setTargetAtTime(volCurve(s.musicVolume) * 0.9, t, instant ? 1.2 : tc);
  }

  /** Temporarily lower the music (e.g. under the victory fanfare). */
  duckMusic(level: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const p = this.musicDuck.gain;
    const until = t + seconds;
    if (until < this.duckUntil && level >= p.value) return;
    this.duckUntil = until;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(level, t, 0.06);
    p.setTargetAtTime(1, until, 0.6);
  }

  // ── throttling ────────────────────────────────────────────
  /** Returns true if `key` hasn't fired within `ms` milliseconds. */
  gate(key: string, ms: number): boolean {
    const n = performance.now();
    const last = this.gates.get(key) ?? -1e9;
    if (n - last < ms) return false;
    this.gates.set(key, n);
    return true;
  }

  // ── curves ────────────────────────────────────────────────
  driveCurve(k: number): Float32Array<ArrayBuffer> {
    const key = 'd' + Math.round(k);
    let c = this.curves.get(key);
    if (!c) {
      const n = 1024;
      c = new Float32Array(n);
      const norm = Math.tanh(k);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(k * x) / norm;
      }
      this.curves.set(key, c);
    }
    return c;
  }

  crushCurve(steps: number): Float32Array<ArrayBuffer> {
    const key = 'c' + Math.round(steps);
    let c = this.curves.get(key);
    if (!c) {
      const n = 2048;
      c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.round(x * steps) / steps;
      }
      this.curves.set(key, c);
    }
    return c;
  }

  // ── voices ────────────────────────────────────────────────
  private admit(priority: number): boolean {
    if (!this.ready) return false;
    if (priority <= 0 && this.voices > SOFT_LIMIT) return false;
    if (priority < 2 && this.voices > HARD_LIMIT) return false;
    return true;
  }

  /**
   * Wires src → [shaper] → [crush] → [filter] → env gain → [pan] → bus (+ sends).
   * Handles start/stop scheduling and node cleanup.
   */
  private chain(
    sources: AudioScheduledSourceNode[],
    head: AudioNode,
    extra: AudioNode[],
    o: VoiceOpts,
    bufferOffset = 0,
  ): { t0: number; end: number } {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.006 + Math.max(0, o.at ?? 0);
    const dur = Math.max(0.01, o.dur);
    const end = t0 + dur;
    const nodes: AudioNode[] = [head, ...extra];
    let node: AudioNode = head;

    if (o.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.driveCurve(o.drive);
      ws.oversample = '2x';
      node.connect(ws);
      node = ws;
      nodes.push(ws);
    }
    if (o.crush) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.crushCurve(o.crush);
      node.connect(ws);
      node = ws;
      nodes.push(ws);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      const fs = o.filter;
      f.type = fs.type;
      f.Q.value = fs.q ?? 0.7;
      f.frequency.setValueAtTime(fs.freq, t0);
      if (fs.peak) f.frequency.exponentialRampToValueAtTime(Math.max(20, fs.peak), t0 + (fs.peakAt ?? 0.04));
      if (fs.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, fs.freqEnd), t0 + (fs.glide ?? dur));
      node.connect(f);
      node = f;
      nodes.push(f);
    }

    const g = ctx.createGain();
    nodes.push(g);
    const p = g.gain;
    const a = Math.min(Math.max(0.002, o.attack ?? 0.004), dur * 0.9);
    const peak = Math.max(0.00011, o.gain);
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(peak, t0 + a);
    if (o.env === 'pad') {
      const r = Math.min(o.release ?? dur * 0.35, dur - a);
      p.setValueAtTime(peak, Math.max(t0 + a, end - r));
      p.linearRampToValueAtTime(0, end);
    } else {
      p.exponentialRampToValueAtTime(0.0001, end);
      p.linearRampToValueAtTime(0, end + 0.01);
    }
    node.connect(g);
    node = g;

    if (o.pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(pn);
      node = pn;
      nodes.push(pn);
    }

    const music = o.bus === 'music';
    node.connect(o.out ?? (music ? this.musicIn : this.sfxIn));
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      node.connect(s).connect(music ? this.musicVerbIn : this.sfxVerbIn);
      nodes.push(s);
    }
    if (o.echo) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      node.connect(s).connect(music ? this.musicEchoIn : this.sfxEchoIn);
      nodes.push(s);
    }

    this.voices++;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      this.voices--;
      for (const n of nodes) n.disconnect();
      for (const s of sources) s.disconnect();
    };
    sources.forEach((s, i) => {
      if (i === 0 && bufferOffset > 0 && s instanceof AudioBufferSourceNode) s.start(t0, bufferOffset);
      else s.start(t0);
      s.stop(end + 0.03);
      if (i === 0) s.onended = cleanup;
    });
    return { t0, end };
  }

  tone(o: ToneOpts): number {
    if (!this.admit(o.priority ?? 1)) return 0;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    const t0 = ctx.currentTime + 0.006 + Math.max(0, o.at ?? 0);
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) {
      const tt = t0 + (o.glideTime ?? o.dur);
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.freqEnd, tt);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), tt);
    }
    if (o.detune) osc.detune.value = o.detune;
    const srcs: AudioScheduledSourceNode[] = [osc];
    const extra: AudioNode[] = [];
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato.rate;
      const lg = ctx.createGain();
      lg.gain.value = o.vibrato.depth;
      lfo.connect(lg).connect(osc.detune);
      srcs.push(lfo);
      extra.push(lg);
    }
    return this.chain(srcs, osc, extra, o).t0;
  }

  noise(o: NoiseOpts): number {
    if (!this.admit(o.priority ?? 1) || !this.noiseBuf) return 0;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    // random start offset so successive bursts differ
    const off = Math.random() * (this.noiseBuf.duration - 0.1);
    return this.chain([src], src, [], o, off).t0;
  }

  fm(o: FmOpts): number {
    if (!this.admit(o.priority ?? 1)) return 0;
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    car.type = o.type ?? 'sine';
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const t0 = ctx.currentTime + 0.006 + Math.max(0, o.at ?? 0);
    const dur = Math.max(0.01, o.dur);
    car.frequency.setValueAtTime(o.freq, t0);
    mod.frequency.setValueAtTime(o.freq * o.ratio, t0);
    mg.gain.setValueAtTime(o.index * o.freq * o.ratio, t0);
    if (o.freqEnd) {
      car.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + dur);
      mod.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd * o.ratio), t0 + dur);
    }
    if (o.indexEnd !== undefined) {
      const endF = (o.freqEnd ?? o.freq) * o.ratio;
      mg.gain.linearRampToValueAtTime(Math.max(0, o.indexEnd * endF), t0 + dur);
    }
    mod.connect(mg).connect(car.frequency);
    return this.chain([car, mod], car, [mg], o).t0;
  }
}

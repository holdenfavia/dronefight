// All sound is synthesized in the browser (ADR-0010): no audio files.

import { AUDIO } from './config';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Browsers only allow audio after a key press or click. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.master;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : AUDIO.master;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    osc.connect(g).connect(p).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, q = 0.8, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(filter).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  hit(dmg: number, pan: number): void {
    const heavy = Math.min(1, dmg / 14);
    this.burst(0.08 + heavy * 0.18, 0.5 + heavy * 0.4, 1800 - heavy * 1100, 0.7, pan);
    this.tone('square', 220 - heavy * 120, 50, 0.08 + heavy * 0.15, 0.25 + heavy * 0.2, pan);
  }

  smash(pan: number): void {
    this.burst(0.5, 0.8, 500, 0.5, pan);
    this.tone('sawtooth', 160, 30, 0.45, 0.35, pan);
  }

  shieldHit(pan: number): void {
    this.tone('triangle', 900, 600, 0.09, 0.25, pan);
  }

  shieldBreak(pan: number): void {
    this.tone('square', 1200, 80, 0.6, 0.3, pan);
    this.burst(0.4, 0.5, 3000, 1, pan);
  }

  swing(pan: number): void {
    this.burst(0.07, 0.12, 2400, 1.5, pan);
  }

  jump(air: boolean, pan: number): void {
    this.tone('sine', air ? 380 : 300, air ? 760 : 620, 0.12, 0.16, pan);
    this.burst(0.1, 0.1, 900, 1, pan);
  }

  land(pan: number): void {
    this.burst(0.06, 0.15, 400, 1, pan);
  }

  shot(kind: 'shot' | 'bomb' | 'mine' | 'gust' | 'hazard', look: string, pan: number): void {
    if (look === 'bullet') { this.burst(0.12, 0.5, 2400, 0.8, pan); this.tone('square', 900, 120, 0.1, 0.18, pan); return; }
    if (look === 'note') { this.tone('triangle', 660, 660, 0.18, 0.2, pan); this.tone('triangle', 990, 990, 0.14, 0.12, pan); return; }
    if (look === 'wisp') { this.tone('sine', 520, 260, 0.4, 0.15, pan); return; }
    if (kind === 'shot') this.tone('square', 1400, 400, 0.08, 0.12, pan);
    else if (kind === 'gust') this.burst(0.35, 0.3, 700, 0.4, pan);
    else this.tone('sine', 300, 180, 0.15, 0.2, pan);
  }

  /** Parry and counter: a bright ring. */
  parry(pan: number): void {
    this.tone('sine', 1800, 2400, 0.25, 0.22, pan);
    this.tone('triangle', 900, 1200, 0.2, 0.15, pan);
  }

  grab(pan: number): void {
    this.tone('square', 260, 160, 0.07, 0.15, pan);
    this.burst(0.05, 0.15, 1200, 1, pan);
  }

  /** Status effects: a cursed warble, a slow drone, a quick riff, a reload click. */
  status(kind: 'curse' | 'slow' | 'haste' | 'reload', pan: number): void {
    if (kind === 'curse') this.tone('sine', 300, 600, 0.35, 0.15, pan);
    else if (kind === 'slow') this.tone('sine', 440, 220, 0.5, 0.15, pan);
    else if (kind === 'haste') { this.tone('triangle', 660, 660, 0.08, 0.15, pan); this.tone('triangle', 880, 880, 0.16, 0.12, pan); }
    else this.burst(0.05, 0.3, 3000, 1, pan);
  }

  explode(pan: number): void {
    this.burst(0.6, 0.8, 300, 0.5, pan);
    this.tone('sine', 110, 35, 0.5, 0.5, pan);
  }

  ko(pan: number): void {
    this.burst(1.1, 0.9, 250, 0.4, pan);
    this.tone('sawtooth', 90, 25, 1.0, 0.45, pan);
    this.tone('sine', 1600, 200, 0.6, 0.15, pan);
  }

  beep(high: boolean): void {
    this.tone('square', high ? 1320 : 660, high ? 1320 : 660, high ? 0.45 : 0.15, 0.18);
  }

  click(): void {
    this.tone('triangle', 900, 700, 0.05, 0.12);
  }
}

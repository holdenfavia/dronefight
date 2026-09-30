import type { AudioEngine } from './audioEngine';

/** Synthesized one-shot effects (ADR-0010). Each call builds a few short-lived nodes. */

interface Position {
  x: number;
  y: number;
  z: number;
}

export class Sfx {
  constructor(private readonly engine: AudioEngine) {}

  /** One round. With a position it's the other pilot's gun, heard from where they are. */
  shot(from?: Position): void {
    const out = this.output(from, from ? 0.9 : 0.55);
    const t = this.engine.now;
    // Crack: bright noise burst.
    this.noise(out, t, 0.05, { type: 'highpass', freq: 1400 }, 0.5, 0.045);
    // Thump: pitched-down sine.
    this.tone(out, t, 'sine', 170, 50, 0.08, 0.45);
  }

  /** Your round hit: a bright double tick. */
  hitConfirm(): void {
    const out = this.output();
    const t = this.engine.now;
    this.tone(out, t, 'square', 1760, 1760, 0.035, 0.09);
    this.tone(out, t + 0.04, 'square', 2350, 2350, 0.04, 0.08);
  }

  /** You were hit: dull thud with grit. */
  damage(): void {
    const out = this.output();
    const t = this.engine.now;
    this.noise(out, t, 0.16, { type: 'lowpass', freq: 700 }, 0.55, 0.12);
    this.tone(out, t, 'sine', 90, 45, 0.18, 0.5);
  }

  /** Crash or shot down: impact plus a falling rumble. */
  crash(): void {
    const out = this.output();
    const t = this.engine.now;
    this.noise(out, t, 0.7, { type: 'lowpass', freq: 3200, to: 180 }, 0.8, 0.6);
    this.tone(out, t, 'sine', 70, 30, 0.5, 0.6);
    this.tone(out, t, 'square', 220, 60, 0.12, 0.08);
  }

  /** Betaflight-style arm beeps: rising when armed, falling when disarmed. */
  arm(armed: boolean): void {
    const out = this.output();
    const t = this.engine.now;
    const [a, b] = armed ? [1320, 1760] : [1760, 1320];
    this.tone(out, t, 'square', a, a, 0.07, 0.06);
    this.tone(out, t + 0.09, 'square', b, b, 0.09, 0.06);
  }

  /** Respawn countdown: short beeps, a higher one on the last second. */
  countdown(secondsLeft: number): void {
    const f = secondsLeft <= 1 ? 1320 : 880;
    this.tone(this.output(), this.engine.now, 'square', f, f, 0.08, 0.05);
  }

  click(): void {
    this.tone(this.output(), this.engine.now, 'square', 2000, 1400, 0.025, 0.04);
  }

  stinger(kind: 'kill' | 'death' | 'victory' | 'defeat'): void {
    const out = this.output();
    const t = this.engine.now;
    const notes: Record<typeof kind, number[]> = {
      kill: [660, 990],
      death: [440, 330, 247],
      victory: [523, 659, 784, 1047],
      defeat: [392, 330, 262, 196],
    };
    const step = kind === 'victory' || kind === 'defeat' ? 0.13 : 0.08;
    notes[kind].forEach((f, i) => {
      const last = i === notes[kind].length - 1;
      this.tone(out, t + i * step, 'triangle', f, f, last ? 0.35 : step, 0.16);
      this.tone(out, t + i * step, 'square', f, f, last ? 0.2 : step * 0.8, 0.035);
    });
  }

  // ---- building blocks

  private output(from?: Position, gain = 1): AudioNode {
    const ctx = this.engine.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (from) {
      const p = this.engine.createPanner();
      p.positionX.value = from.x;
      p.positionY.value = from.y;
      p.positionZ.value = from.z;
      // Positional sounds come from other pilots, so they go on the "other pilots" volume.
      g.connect(p).connect(this.engine.remote);
    } else {
      g.connect(this.engine.sfx);
    }
    return g;
  }

  private tone(out: AudioNode, t: number, type: OscillatorType, from: number, to: number, dur: number, gain: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(
    out: AudioNode,
    t: number,
    dur: number,
    filter: { type: BiquadFilterType; freq: number; to?: number },
    gain: number,
    decay: number,
  ): void {
    const ctx = this.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(out);
    // Random start so rapid shots don't sound identical.
    src.start(t, Math.random() * 1.5, dur);
  }
}

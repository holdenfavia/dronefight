import type { AudioEngine } from './audioEngine';

/**
 * The motor sound of one drone (ADR-0010). Slightly detuned sawtooth oscillators, one per motor,
 * through a low-pass filter. Pitch and brightness follow motor output; air noise follows speed.
 */
export interface MotorProfile {
  idleHz: number;
  maxHz: number;
  /** One entry per motor: detune as a fraction of pitch. */
  spread: readonly number[];
  wander: number;
  gainIdle: number;
  gainMax: number;
  cutoffIdle: number;
  cutoffMax: number;
  windFullSpeed: number;
  windGain: number;
  smoothing: number;
}

/** Four motors on a 5" quad. */
export const QUAD_MOTORS: MotorProfile = {
  /** Fundamental at idle and at full throttle (Hz). */
  idleHz: 95,
  maxHz: 470,
  /** Per-motor detune (fraction of pitch). The beating between them is the "four motors" texture. */
  spread: [-0.018, -0.006, 0.007, 0.02],
  /** Random wander added to each motor's detune, like a PID loop constantly correcting. */
  wander: 0.006,
  gainIdle: 0.05,
  gainMax: 0.22,
  cutoffIdle: 700,
  cutoffMax: 5200,
  /** Air rush: speed (m/s) where wind reaches full level. */
  windFullSpeed: 45,
  windGain: 0.2,
  /** How fast pitch/level follow the motors (seconds). */
  smoothing: 0.025,
};

/** One bigger pusher prop on the wing (ADR-0013): lower, smoother drone, more wind. */
export const WING_MOTOR: MotorProfile = {
  ...QUAD_MOTORS,
  idleHz: 70,
  maxHz: 320,
  spread: [-0.003, 0.004],
  wander: 0.002,
  gainIdle: 0.04,
  gainMax: 0.2,
  cutoffIdle: 500,
  cutoffMax: 3200,
  windFullSpeed: 55,
  windGain: 0.26,
};

export class MotorVoice {
  private readonly oscs: OscillatorNode[] = [];
  private readonly detune: number[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly body: GainNode;
  private readonly windGain: GainNode;
  private readonly wind: AudioBufferSourceNode;
  readonly output: GainNode;

  constructor(
    private readonly engine: AudioEngine,
    destination: AudioNode,
    private readonly profile: MotorProfile = QUAD_MOTORS,
  ) {
    const MOTOR = profile;
    const ctx = engine.ctx;
    this.output = ctx.createGain();
    this.output.connect(destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.5;
    this.body = ctx.createGain();
    this.body.gain.value = 0;
    this.filter.connect(this.body).connect(this.output);

    for (const spread of MOTOR.spread) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = MOTOR.idleHz * (1 + spread);
      osc.connect(this.filter);
      osc.start();
      this.oscs.push(osc);
      this.detune.push(spread);
    }

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind = ctx.createBufferSource();
    this.wind.buffer = engine.noise;
    this.wind.loop = true;
    this.wind.connect(windFilter).connect(this.windGain).connect(this.output);
    this.wind.start();
  }

  /**
   * @param motor motor output 0..1
   * @param speed airspeed m/s (0 if unknown)
   * @param active false when disarmed or crashed: motors stop
   */
  update(motor: number, speed: number, active: boolean): void {
    const MOTOR = this.profile;
    const t = this.engine.now;
    // 3D quads run motors backwards (negative output); they sound the same either way.
    const m = active ? Math.min(1, Math.abs(motor)) : 0;
    const base = MOTOR.idleHz + (MOTOR.maxHz - MOTOR.idleHz) * Math.sqrt(m);
    for (let i = 0; i < this.oscs.length; i++) {
      const spread = MOTOR.spread[i] ?? 0;
      const current = this.detune[i] ?? spread;
      // Random walk around each motor's base detune.
      const next = current + (Math.random() - 0.5) * MOTOR.wander * 0.3 + (spread - current) * 0.05;
      this.detune[i] = next;
      this.oscs[i]?.frequency.setTargetAtTime(base * (1 + next), t, MOTOR.smoothing);
    }
    this.filter.frequency.setTargetAtTime(MOTOR.cutoffIdle + (MOTOR.cutoffMax - MOTOR.cutoffIdle) * m, t, MOTOR.smoothing);
    const level = active ? MOTOR.gainIdle + (MOTOR.gainMax - MOTOR.gainIdle) * m : 0;
    this.body.gain.setTargetAtTime(level, t, active ? MOTOR.smoothing : 0.08);
    const wind = Math.min(1, speed / MOTOR.windFullSpeed);
    this.windGain.gain.setTargetAtTime(wind * wind * MOTOR.windGain, t, 0.1);
  }

  dispose(): void {
    for (const osc of this.oscs) osc.stop();
    this.wind.stop();
    this.output.disconnect();
  }
}

import { ramFactor, type Jet } from '../../../shared/propellers';
import type { AudioEngine } from './audioEngine';
import { MotorVoice, QUAD_MOTORS, WING_MOTOR } from './motorVoice';

/** Anything that sounds like a drone's engine: props (MotorVoice) or a jet (JetVoice). */
export interface EngineVoice {
  /** motor output 0..1, airspeed m/s, and false when disarmed or crashed. */
  update(motor: number, speed: number, active: boolean): void;
  dispose(): void;
}

/** Jet sound tuning (ADR-0038, ADR-0010). All synthesized. */
const JET = {
  turbine: {
    /** Compressor whine (Hz) at idle and full power, and its level. */
    whineIdleHz: 1700,
    whineMaxHz: 6200,
    whineGain: 0.07,
    /** Exhaust roar: low-pass noise, opening up with power. */
    roarCutoffIdle: 350,
    roarCutoffMax: 4200,
    roarGainIdle: 0.03,
    roarGainMax: 0.3,
  },
  pulsejet: {
    /** Pulse rate (Hz) at the lowest output and at full: the buzz-bomb putt-putt. */
    pulseIdleHz: 44,
    pulseMaxHz: 66,
    buzzGain: 0.16,
    cutoffIdle: 700,
    cutoffMax: 2200,
    /** Noise bursts gated by each pulse. */
    burstGain: 0.22,
  },
  ramjet: {
    /** Deep roar once lit: noise low-passed, plus a sub rumble (Hz). */
    roarCutoffCold: 180,
    roarCutoffLit: 1400,
    roarGain: 0.38,
    rumbleHz: 42,
    rumbleGain: 0.18,
    /** Booster hiss before it lights. */
    hissGain: 0.06,
  },
  windFullSpeed: 60,
  windGain: 0.24,
  smoothing: 0.05,
} as const;

export class JetVoice implements EngineVoice {
  readonly output: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  /** Per-kind nodes the update drives. */
  private readonly osc: OscillatorNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly filters: BiquadFilterNode[] = [];
  private readonly windGain: GainNode;

  constructor(
    private readonly engine: AudioEngine,
    destination: AudioNode,
    private readonly jet: Jet,
    private readonly id: 'turbine' | 'pulsejet' | 'ramjet' = jet.kind,
  ) {
    const ctx = engine.ctx;
    this.output = ctx.createGain();
    this.output.connect(destination);

    if (jet.kind === 'turbine') {
      // Whine: a sine and a slightly detuned triangle a fifth up.
      const whine = this.gain(0);
      for (const [type, ratio] of [['sine', 1], ['triangle', 1.498]] as const) {
        const o = this.oscillator(type, JET.turbine.whineIdleHz * ratio);
        o.connect(whine);
      }
      whine.connect(this.output);
      const roar = this.lowpass(JET.turbine.roarCutoffIdle, 0.7);
      const roarGain = this.gain(0);
      this.noise().connect(roar).connect(roarGain).connect(this.output);
    } else if (jet.kind === 'pulsejet') {
      // Buzz: a clipped sawtooth at the pulse rate, low-passed.
      const buzz = this.oscillator('sawtooth', JET.pulsejet.pulseIdleHz);
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClip();
      const filter = this.lowpass(JET.pulsejet.cutoffIdle, 3);
      const buzzGain = this.gain(0);
      buzz.connect(shaper).connect(filter).connect(buzzGain).connect(this.output);
      // Bursts: noise whose level pulses with a square wave at the same rate (gain = level + level * square).
      const lfo = this.oscillator('square', JET.pulsejet.pulseIdleHz);
      const burst = this.gain(0);
      const depth = this.gain(0);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.9;
      this.noise().connect(band).connect(burst).connect(this.output);
      lfo.connect(depth).connect(burst.gain);
    } else {
      // Roar and rumble once lit; a thin hiss from the booster before.
      const roar = this.lowpass(JET.ramjet.roarCutoffCold, 0.9);
      const roarGain = this.gain(0);
      this.noise().connect(roar).connect(roarGain).connect(this.output);
      const rumble = this.oscillator('sine', JET.ramjet.rumbleHz);
      const rumbleGain = this.gain(0);
      rumble.connect(rumbleGain).connect(this.output);
      const hiss = ctx.createBiquadFilter();
      hiss.type = 'highpass';
      hiss.frequency.value = 2600;
      this.filters.push(hiss);
      const hissGain = this.gain(0);
      this.noise().connect(hiss).connect(hissGain).connect(this.output);
    }

    // Air rush, like the prop voices.
    const wind = ctx.createBiquadFilter();
    wind.type = 'bandpass';
    wind.frequency.value = 900;
    wind.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise().connect(wind).connect(this.windGain).connect(this.output);
  }

  update(motor: number, speed: number, active: boolean): void {
    const t = this.engine.now;
    const s = JET.smoothing;
    const m = active ? Math.max(0, Math.min(1, Math.abs(motor))) : 0;
    const set = (p: AudioParam, v: number, tau: number = s) => p.setTargetAtTime(v, t, tau);
    if (this.jet.kind === 'turbine') {
      const T = JET.turbine;
      const hz = T.whineIdleHz + (T.whineMaxHz - T.whineIdleHz) * m;
      set(this.osc[0]!.frequency, hz);
      set(this.osc[1]!.frequency, hz * 1.498);
      set(this.gains[0]!.gain, active ? T.whineGain * (0.4 + 0.6 * m) : 0, active ? s : 0.6);
      set(this.filters[0]!.frequency, T.roarCutoffIdle + (T.roarCutoffMax - T.roarCutoffIdle) * m);
      set(this.gains[1]!.gain, active ? T.roarGainIdle + (T.roarGainMax - T.roarGainIdle) * m * m : 0, active ? s : 0.6);
    } else if (this.jet.kind === 'pulsejet') {
      const P = JET.pulsejet;
      const hz = P.pulseIdleHz + (P.pulseMaxHz - P.pulseIdleHz) * m;
      set(this.osc[0]!.frequency, hz);
      set(this.osc[1]!.frequency, hz);
      set(this.filters[0]!.frequency, P.cutoffIdle + (P.cutoffMax - P.cutoffIdle) * m);
      set(this.gains[0]!.gain, active ? P.buzzGain * (0.5 + 0.5 * m) : 0, active ? s : 0.05);
      const burst = active ? P.burstGain * (0.4 + 0.6 * m) * 0.5 : 0;
      set(this.gains[1]!.gain, burst, active ? s : 0.05);
      set(this.gains[2]!.gain, burst, active ? s : 0.05);
    } else {
      const R = JET.ramjet;
      const booster = this.jet.ram?.booster ?? 0;
      // How lit it is, 0..1, from the same airspeed curve as the thrust.
      const lit = booster < 1 ? (ramFactor(this.id, speed) - booster) / (1 - booster) : 1;
      const power = m * lit;
      set(this.filters[0]!.frequency, R.roarCutoffCold + (R.roarCutoffLit - R.roarCutoffCold) * power);
      set(this.gains[0]!.gain, active ? R.roarGain * power : 0, active ? 0.15 : 0.4);
      set(this.osc[0]!.frequency, R.rumbleHz * (0.8 + 0.4 * power));
      set(this.gains[1]!.gain, active ? R.rumbleGain * power : 0, active ? 0.15 : 0.4);
      set(this.gains[2]!.gain, active ? R.hissGain * m * (1 - lit) : 0);
    }
    const wind = Math.min(1, speed / JET.windFullSpeed);
    set(this.windGain.gain, wind * wind * JET.windGain, 0.1);
  }

  dispose(): void {
    for (const src of this.sources) src.stop();
    this.output.disconnect();
  }

  private oscillator(type: OscillatorType, hz: number): OscillatorNode {
    const o = this.engine.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.start();
    this.sources.push(o);
    this.osc.push(o);
    return o;
  }

  private gain(value: number): GainNode {
    const g = this.engine.ctx.createGain();
    g.gain.value = value;
    this.gains.push(g);
    return g;
  }

  private lowpass(hz: number, q: number): BiquadFilterNode {
    const f = this.engine.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = hz;
    f.Q.value = q;
    this.filters.push(f);
    return f;
  }

  private noise(): AudioBufferSourceNode {
    const n = this.engine.ctx.createBufferSource();
    n.buffer = this.engine.noise;
    n.loop = true;
    // Start each loop somewhere different so layered noises don't line up.
    n.start(0, Math.random() * (this.engine.noise.duration || 1));
    this.sources.push(n);
    return n;
  }
}

/** A soft-clipping curve: rounds the sawtooth into a growl. */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.5 * x);
  }
  return curve;
}

/** The right engine sound for a body and its propulsion (ADR-0010, ADR-0038). */
export function engineVoice(engine: AudioEngine, destination: AudioNode, wing: boolean, jet: Jet | undefined): EngineVoice {
  if (wing && jet) return new JetVoice(engine, destination, jet);
  return new MotorVoice(engine, destination, wing ? WING_MOTOR : QUAD_MOTORS);
}

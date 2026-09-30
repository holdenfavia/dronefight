import type { AudioEngine } from './audioEngine';

/**
 * The wing's rotary cannon (ADR-0014): one continuous "BRRRT", not separate shots. A buzzy tone at the
 * barrels' firing frequency plus noise chopped at the same rate, gated on while firing. The pitch spools
 * up for the first moment of each burst, like barrels spinning up.
 */
const CANNON = {
  /** Firing frequency once spun up, and where it starts (Hz). A real M61 fires ~100 rounds/s. */
  rateHz: 100,
  spinUpFromHz: 65,
  spinUpSeconds: 0.18,
  attack: 0.012,
  release: 0.07,
  toneGain: 0.22,
  noiseGain: 0.5,
} as const;

export class CannonVoice {
  private readonly gate: GainNode;
  private readonly buzz: OscillatorNode;
  private readonly chopper: OscillatorNode;
  private readonly noise: AudioBufferSourceNode;
  private firing = false;

  constructor(
    private readonly engine: AudioEngine,
    destination: AudioNode,
    level = 1,
  ) {
    const ctx = engine.ctx;
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    const out = ctx.createGain();
    out.gain.value = level;
    this.gate.connect(out).connect(destination);

    // Growl: sawtooth at the firing rate, rounded off.
    this.buzz = ctx.createOscillator();
    this.buzz.type = 'sawtooth';
    this.buzz.frequency.value = CANNON.rateHz;
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 1400;
    const tone = ctx.createGain();
    tone.gain.value = CANNON.toneGain;
    this.buzz.connect(toneFilter).connect(tone).connect(this.gate);

    // Rip: noise chopped on/off at the firing rate by a square wave driving its gain.
    this.noise = ctx.createBufferSource();
    this.noise.buffer = engine.noise;
    this.noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1100;
    noiseFilter.Q.value = 0.7;
    const chopped = ctx.createGain();
    chopped.gain.value = CANNON.noiseGain * 0.5;
    this.chopper = ctx.createOscillator();
    this.chopper.type = 'square';
    this.chopper.frequency.value = CANNON.rateHz;
    const depth = ctx.createGain();
    depth.gain.value = CANNON.noiseGain * 0.5;
    this.chopper.connect(depth).connect(chopped.gain);
    this.noise.connect(noiseFilter).connect(chopped).connect(this.gate);

    this.buzz.start();
    this.chopper.start();
    this.noise.start();
  }

  setFiring(on: boolean): void {
    if (on === this.firing) return;
    this.firing = on;
    const t = this.engine.now;
    this.gate.gain.cancelScheduledValues(t);
    this.gate.gain.setTargetAtTime(on ? 1 : 0, t, on ? CANNON.attack : CANNON.release);
    if (on) {
      for (const osc of [this.buzz, this.chopper]) {
        osc.frequency.cancelScheduledValues(t);
        osc.frequency.setValueAtTime(CANNON.spinUpFromHz, t);
        osc.frequency.linearRampToValueAtTime(CANNON.rateHz, t + CANNON.spinUpSeconds);
      }
    }
  }

  dispose(): void {
    this.buzz.stop();
    this.chopper.stop();
    this.noise.stop();
    this.gate.disconnect();
  }
}

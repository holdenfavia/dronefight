/**
 * Web Audio setup (ADR-0010): one context, a master chain with volume/mute/duck, and 3D listener updates.
 * Everything audible is synthesized; there are no audio files.
 */

/** How quickly volume changes settle (seconds). */
const GAIN_SMOOTHING = 0.05;
/** Master level while the menu is open. */
const DUCK_LEVEL = 0.25;

export class AudioEngine {
  readonly ctx: AudioContext;
  /** Effects bus. */
  readonly sfx: GainNode;
  /** Motor bus (your own quad). */
  readonly motors: GainNode;
  /** Two seconds of white noise, shared by every noisy sound. */
  readonly noise: AudioBuffer;

  private readonly master: GainNode;
  private volume = 0.7;
  private muted = false;
  private ducked = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    // A gentle limiter so stacked gunfire and explosions never clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(this.ctx.destination);

    this.sfx = this.ctx.createGain();
    this.motors = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.motors.connect(this.master);

    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Browsers start audio suspended until the page gets a click or key press.
    const unlock = () => void this.ctx.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Don't hum away in a background tab.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    this.applyGain();
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  /** Quieter while the menu is open. */
  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.applyGain();
  }

  /** A 3D panner for sounds that come from somewhere in the world. */
  createPanner(): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.2;
    p.maxDistance = 400;
    return p;
  }

  /** Put the listener's ears at the camera. */
  updateListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = ux;
      l.upY.value = uy;
      l.upZ.value = uz;
    } else {
      // Older Safari/Firefox API.
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  private applyGain(): void {
    const target = this.muted ? 0 : this.volume * (this.ducked ? DUCK_LEVEL : 1);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_SMOOTHING);
  }
}

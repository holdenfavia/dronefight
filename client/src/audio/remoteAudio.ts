import type { RemoteView } from '../render/remoteDrones';
import type { AudioEngine } from './audioEngine';
import { CannonVoice } from './cannonVoice';
import { MotorVoice, QUAD_MOTORS, WING_MOTOR } from './motorVoice';

/** A remote cannon counts as firing until this long after its last round arrived (ms). */
const CANNON_HOLD_MS = 90;

/** Other pilots' motors, positioned at their drones so you can hear where they are (ADR-0010). */
export class RemoteAudio {
  private readonly voices = new Map<string, { voice: MotorVoice; panner: PannerNode; wing: boolean; cannon: CannonVoice | null }>();
  private readonly lastCannon = new Map<string, number>();

  constructor(private readonly engine: AudioEngine) {}

  /** Another pilot's rotary cannon fired a round (ADR-0014). */
  markCannon(id: string): void {
    this.lastCannon.set(id, performance.now());
  }

  update(views: readonly RemoteView[]): void {
    const seen = new Set<string>();
    for (const view of views) {
      seen.add(view.id);
      const wing = view.droneClass === 'wing';
      let entry = this.voices.get(view.id);
      if (entry && entry.wing !== wing) {
        // They switched class (ADR-0013): swap to the matching motor sound.
        entry.voice.dispose();
        entry.cannon?.dispose();
        entry.panner.disconnect();
        entry = undefined;
      }
      if (!entry) {
        const panner = this.engine.createPanner();
        panner.connect(this.engine.remote);
        entry = {
          voice: new MotorVoice(this.engine, panner, wing ? WING_MOTOR : QUAD_MOTORS),
          panner,
          wing,
          // Any drone can carry a rotary cannon now (ADR-0033).
          cannon: new CannonVoice(this.engine, panner, 1.4),
        };
        this.voices.set(view.id, entry);
      }
      const p = view.position;
      entry.panner.positionX.value = p.x;
      entry.panner.positionY.value = p.y;
      entry.panner.positionZ.value = p.z;
      const active = view.mode !== 'hold' && view.armed && !view.crashed;
      entry.voice.update(view.motor, 0, active);
      entry.cannon?.setFiring(performance.now() - (this.lastCannon.get(view.id) ?? -Infinity) < CANNON_HOLD_MS);
    }
    for (const [id, entry] of this.voices) {
      if (seen.has(id)) continue;
      entry.voice.dispose();
      entry.cannon?.dispose();
      entry.panner.disconnect();
      this.voices.delete(id);
    }
  }
}

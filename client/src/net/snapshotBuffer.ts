import { Quaternion, Vector3 } from 'three';
import { NET, type DroneState } from '../../../shared/protocol';

/**
 * Remote-drone snapshots and interpolation (ADR-0004, Hard rule 1).
 *
 * - Bounded: at most NET.bufferSize snapshots. Older ones fall off.
 * - Latest state wins: out-of-order or duplicate snapshots are dropped.
 * - No replay: gaps snap to the newer state instead of sliding through missed time.
 * - Past the newest snapshot: extrapolate briefly, then hold still.
 */

export interface Snapshot {
  /** Server receive time (ms). The interpolation timeline. */
  st: number;
  s: DroneState;
}

export type SampleMode = 'empty' | 'interp' | 'extrap' | 'hold';

export interface SampledState {
  mode: SampleMode;
  pos: Vector3;
  rot: Quaternion;
  armed: boolean;
  crashed: boolean;
  motor: number;
  /** Sender's server-time estimate of the moment being shown. `serverNow - sourceTs` = true end-to-end delay. */
  sourceTs: number;
}

export function createSampledState(): SampledState {
  return { mode: 'empty', pos: new Vector3(), rot: new Quaternion(), armed: false, crashed: false, motor: 0, sourceTs: 0 };
}

const qa = new Quaternion();
const qb = new Quaternion();

export class SnapshotBuffer {
  private readonly snaps: Snapshot[] = [];

  get size(): number {
    return this.snaps.length;
  }

  get newest(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  clear(): void {
    this.snaps.length = 0;
  }

  /** Returns false if the snapshot was dropped (older than or equal to what we have). */
  push(snap: Snapshot): boolean {
    const newest = this.newest;
    if (newest && snap.st <= newest.st) return false;
    this.snaps.push(snap);
    while (this.snaps.length > NET.bufferSize) this.snaps.shift();
    return true;
  }

  sample(renderTime: number, out: SampledState): SampledState {
    const snaps = this.snaps;
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    if (!first || !last) {
      out.mode = 'empty';
      return out;
    }

    // Everything we need is at or after the last snapshot before renderTime; drop the rest.
    while (snaps.length > 2 && (snaps[1]?.st ?? Infinity) <= renderTime) snaps.shift();

    if (renderTime >= last.st) {
      const ahead = renderTime - last.st;
      const dt = Math.min(ahead, NET.maxExtrapolateMs);
      copyState(last.s, out);
      out.pos.x += (last.s.v[0] * dt) / 1000;
      out.pos.y += (last.s.v[1] * dt) / 1000;
      out.pos.z += (last.s.v[2] * dt) / 1000;
      out.sourceTs = last.s.ts + dt;
      out.mode = ahead <= NET.maxExtrapolateMs ? 'extrap' : 'hold';
      return out;
    }

    const a = snaps[0];
    const b = snaps[1];
    if (!a || !b || renderTime <= a.st) {
      copyState((a ?? first).s, out);
      out.mode = 'interp';
      return out;
    }

    if (b.st - a.st > NET.gapMs) {
      // A gap (hidden tab, lost packets): show the newer state, never play back the missing time.
      copyState(b.s, out);
      out.mode = 'interp';
      return out;
    }

    const t = (renderTime - a.st) / (b.st - a.st);
    out.pos.set(a.s.p[0], a.s.p[1], a.s.p[2]).lerp(tmpB.set(b.s.p[0], b.s.p[1], b.s.p[2]), t);
    qa.set(a.s.q[0], a.s.q[1], a.s.q[2], a.s.q[3]);
    qb.set(b.s.q[0], b.s.q[1], b.s.q[2], b.s.q[3]);
    out.rot.slerpQuaternions(qa, qb, t);
    const nearer = t < 0.5 ? a.s : b.s;
    out.armed = nearer.armed;
    out.crashed = nearer.crashed;
    out.motor = a.s.m + (b.s.m - a.s.m) * t;
    out.sourceTs = a.s.ts + (b.s.ts - a.s.ts) * t;
    out.mode = 'interp';
    return out;
  }
}

const tmpB = new Vector3();

function copyState(s: DroneState, out: SampledState): void {
  out.pos.set(s.p[0], s.p[1], s.p[2]);
  out.rot.set(s.q[0], s.q[1], s.q[2], s.q[3]);
  out.armed = s.armed;
  out.crashed = s.crashed;
  out.motor = s.m;
  out.sourceTs = s.ts;
}

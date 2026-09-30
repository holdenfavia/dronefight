import { describe, expect, it } from 'vitest';
import { NET, type DroneState } from '../../../shared/protocol';
import { createSampledState, SnapshotBuffer } from './snapshotBuffer';
import { ClockSync } from './clockSync';

function state(x: number, ts: number, vx = 0): DroneState {
  return { ts, p: [x, 1, 0], q: [0, 0, 0, 1], v: [vx, 0, 0], m: 0.3, armed: true, crashed: false };
}

/** Snapshots every 33 ms, x moving 1 m per snapshot. */
function filled(count: number, start = 1000): SnapshotBuffer {
  const buf = new SnapshotBuffer();
  for (let i = 0; i < count; i++) buf.push({ st: start + i * 33, s: state(i, start + i * 33 - 20, 30) });
  return buf;
}

describe('SnapshotBuffer (ADR-0004, Hard rule 1)', () => {
  it('never holds more than bufferSize snapshots, however many arrive', () => {
    const buf = filled(1000);
    expect(buf.size).toBe(NET.bufferSize);
  });

  it('drops out-of-order and duplicate snapshots', () => {
    const buf = filled(3);
    expect(buf.push({ st: 1000, s: state(99, 0) })).toBe(false);
    expect(buf.push({ st: 1066, s: state(99, 0) })).toBe(false);
    expect(buf.newest?.s.p[0]).toBe(2);
  });

  it('interpolates between the bracketing snapshots', () => {
    const out = filled(4).sample(1000 + 33 + 16.5, createSampledState());
    expect(out.mode).toBe('interp');
    expect(out.pos.x).toBeCloseTo(1.5);
  });

  it('extrapolates briefly past the newest, then holds', () => {
    const buf = filled(2); // newest at st=1033, x=1, vx=30 m/s
    const extrap = buf.sample(1033 + 100, createSampledState());
    expect(extrap.mode).toBe('extrap');
    expect(extrap.pos.x).toBeCloseTo(1 + 3);
    const hold = buf.sample(1033 + 5000, createSampledState());
    expect(hold.mode).toBe('hold');
    expect(hold.pos.x).toBeCloseTo(1 + 30 * (NET.maxExtrapolateMs / 1000));
  });

  it('snaps across a gap instead of replaying missed time', () => {
    const buf = new SnapshotBuffer();
    buf.push({ st: 1000, s: state(0, 980) });
    buf.push({ st: 31000, s: state(500, 30980) }); // 30 s later: tab was hidden
    const out = buf.sample(1500, createSampledState());
    expect(out.pos.x).toBe(500);
  });

  it('shows the newest state after a burst, not the oldest', () => {
    // A late burst of snapshots arrives at once (e.g. after a stall). Render time is "now".
    const buf = filled(50);
    const newest = buf.newest;
    expect(newest).toBeDefined();
    const out = buf.sample((newest?.st ?? 0) - NET.interpDelayMs / 10, createSampledState());
    expect(out.pos.x).toBeGreaterThan(48);
  });

  it('reports true end-to-end delay via sourceTs', () => {
    const buf = filled(10);
    const renderTime = 1000 + 5 * 33;
    const out = buf.sample(renderTime, createSampledState());
    // Sender stamped 20 ms before server receipt, so shown moment is 20 ms older than renderTime.
    expect(renderTime - out.sourceTs).toBeCloseTo(20);
  });
});

describe('ClockSync', () => {
  it('picks the lowest-latency sample for the offset', () => {
    const c = new ClockSync();
    // Server clock is local + 5000. Sample 1: slow (rtt 200, asymmetric). Sample 2: fast (rtt 20).
    c.onPong(0, 5000 + 150, 200);
    c.onPong(1000, 5000 + 1010, 1020);
    expect(c.offset).toBeCloseTo(5000);
    expect(c.serverNow(2000)).toBeCloseTo(7000);
  });
});

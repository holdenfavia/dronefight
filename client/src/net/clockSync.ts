/**
 * Estimates the server clock from ping/pong round trips (ADR-0004).
 * Uses the lowest-latency recent sample: it has the least queueing noise, so the best offset.
 */
export class ClockSync {
  /** serverTime ≈ localTime + offset */
  offset = 0;
  /** Smoothed round-trip time (ms), for display. */
  rtt = 0;
  synced = false;
  private samples: { rtt: number; offset: number }[] = [];

  constructor(private readonly maxSamples = 10) {}

  /** Rough first guess from the server's hello, before any round trip is measured. */
  seed(serverTime: number, localNow: number): void {
    if (!this.synced) this.offset = serverTime - localNow;
  }

  onPong(clientSendTime: number, serverTime: number, localNow: number): void {
    const rtt = Math.max(0, localNow - clientSendTime);
    const offset = serverTime + rtt / 2 - localNow;
    this.samples.push({ rtt, offset });
    if (this.samples.length > this.maxSamples) this.samples.shift();

    let best = this.samples[0];
    for (const s of this.samples) if (best && s.rtt < best.rtt) best = s;
    if (best) this.offset = best.offset;

    this.rtt = this.synced ? this.rtt + (rtt - this.rtt) * 0.2 : rtt;
    this.synced = true;
  }

  serverNow(localNow: number): number {
    return localNow + this.offset;
  }

  reset(): void {
    this.samples = [];
    this.synced = false;
    this.rtt = 0;
    this.offset = 0;
  }
}

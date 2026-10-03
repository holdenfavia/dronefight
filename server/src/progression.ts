import { XP, type XpReason } from '../../shared/progression.js';

/**
 * XP for signed-in pilots (ADR-0032). The room server is the only writer: it verifies a pilot's Supabase
 * token, keeps their running total, and adds awards to the `progress` table through `award_progress`,
 * batched per pilot. Without SUPABASE_URL and SUPABASE_SECRET_KEY it's disabled and the game runs as before.
 */

export type ProgressEvent = XpReason | 'death';

interface Pending {
  xp: number;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
}

const empty = (): Pending => ({ xp: 0, kills: 0, deaths: 0, wins: 0, matches: 0 });

export interface ProgressionOptions {
  url?: string;
  secretKey?: string;
  fetch?: typeof fetch;
  /** Batch window for database writes (ms). */
  flushMs?: number;
  log?: (msg: string) => void;
}

export class Progression {
  readonly enabled: boolean;
  private readonly url: string;
  private readonly key: string;
  private readonly fetch: typeof fetch;
  private readonly flushMs: number;
  private readonly log: (msg: string) => void;
  private readonly pending = new Map<string, Pending>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(opts: ProgressionOptions = {}) {
    this.url = (opts.url ?? '').replace(/\/$/, '');
    this.key = opts.secretKey ?? '';
    this.enabled = !!this.url && !!this.key;
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.flushMs = opts.flushMs ?? 5000;
    this.log = opts.log ?? ((m) => console.log(m));
  }

  /** Who a Supabase access token belongs to, and their XP so far; null if it isn't valid. */
  async identify(token: string): Promise<{ userId: string; xp: number } | null> {
    if (!this.enabled) return null;
    try {
      const res = await this.fetch(`${this.url}/auth/v1/user`, { headers: { apikey: this.key, authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const user = (await res.json()) as { id?: unknown };
      if (typeof user.id !== 'string') return null;
      const rows = await this.fetch(`${this.url}/rest/v1/progress?id=eq.${encodeURIComponent(user.id)}&select=xp`, { headers: { apikey: this.key } });
      const data = rows.ok ? ((await rows.json()) as { xp?: number }[]) : [];
      return { userId: user.id, xp: Number(data[0]?.xp ?? 0) };
    } catch (e) {
      this.log(`progression: identify failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Record an event for a pilot; returns the XP it's worth (0 for deaths). Written in the next batch. */
  award(userId: string, event: ProgressEvent): number {
    if (!this.enabled) return 0;
    const p = this.pending.get(userId) ?? empty();
    let gained = 0;
    if (event === 'death') p.deaths++;
    else {
      gained = XP[event];
      p.xp += gained;
      if (event === 'kill') p.kills++;
      if (event === 'win') p.wins++;
      if (event === 'finish') p.matches++;
    }
    this.pending.set(userId, p);
    if (!this.timers.has(userId)) this.timers.set(userId, setTimeout(() => void this.flush(userId), this.flushMs));
    return gained;
  }

  /** Write a pilot's pending awards now (also on leaving and at match end). */
  async flush(userId: string): Promise<void> {
    const timer = this.timers.get(userId);
    if (timer) clearTimeout(timer);
    this.timers.delete(userId);
    const p = this.pending.get(userId);
    this.pending.delete(userId);
    if (!p || !this.enabled) return;
    try {
      const res = await this.fetch(`${this.url}/rest/v1/rpc/award_progress`, {
        method: 'POST',
        headers: { apikey: this.key, 'content-type': 'application/json' },
        body: JSON.stringify({ p_user: userId, p_xp: p.xp, p_kills: p.kills, p_deaths: p.deaths, p_wins: p.wins, p_matches: p.matches }),
      });
      if (!res.ok) this.log(`progression: award failed (${res.status}): ${await res.text()}`);
    } catch (e) {
      this.log(`progression: award failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Write everything pending (server shutdown). */
  async flushAll(): Promise<void> {
    await Promise.all([...this.pending.keys()].map((id) => this.flush(id)));
  }
}

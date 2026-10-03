import { describe, expect, it } from 'vitest';
import { XP } from '../../shared/progression.js';
import { Progression } from './progression.js';

/** A fake Supabase: one valid token, a progress table, and the award function. */
function fakeSupabase() {
  const calls: { url: string; body?: unknown; headers: Record<string, string> }[] = [];
  const xp = new Map<string, number>([['user-1', 1200]]);
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, headers });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.endsWith('/auth/v1/user')) return headers.authorization === 'Bearer good' ? json({ id: 'user-1' }) : json({ msg: 'bad jwt' }, 401);
    if (url.includes('/rest/v1/progress')) return json(xp.has('user-1') ? [{ xp: xp.get('user-1') }] : []);
    if (url.endsWith('/rest/v1/rpc/award_progress')) return json(1200 + (body as { p_xp: number }).p_xp);
    return json({}, 404);
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

describe('progression (ADR-0032)', () => {
  it('is off without the project URL and secret key', () => {
    const p = new Progression();
    expect(p.enabled).toBe(false);
    expect(p.award('user-1', 'kill')).toBe(0);
  });

  it('identifies a valid token, with XP so far; rejects a bad one', async () => {
    const sb = fakeSupabase();
    const p = new Progression({ url: 'https://x.supabase.co', secretKey: 'sb_secret_test', fetch: sb.fetch, log: () => {} });
    expect(await p.identify('good')).toEqual({ userId: 'user-1', xp: 1200 });
    expect(await p.identify('forged')).toBeNull();
    // The secret key goes in the apikey header, never in a URL.
    expect(sb.calls.every((c) => !c.url.includes('sb_secret'))).toBe(true);
  });

  it('batches awards into one write with the totals', async () => {
    const sb = fakeSupabase();
    const p = new Progression({ url: 'https://x.supabase.co', secretKey: 'k', fetch: sb.fetch, flushMs: 60_000, log: () => {} });
    expect(p.award('user-1', 'kill')).toBe(XP.kill);
    p.award('user-1', 'kill');
    p.award('user-1', 'assist');
    p.award('user-1', 'death');
    p.award('user-1', 'finish');
    p.award('user-1', 'win');
    await p.flush('user-1');
    const writes = sb.calls.filter((c) => c.url.endsWith('/rpc/award_progress'));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toEqual({
      p_user: 'user-1',
      p_xp: 2 * XP.kill + XP.assist + XP.finish + XP.win,
      p_kills: 2,
      p_deaths: 1,
      p_wins: 1,
      p_matches: 1,
    });
    // Nothing left to write.
    await p.flush('user-1');
    expect(sb.calls.filter((c) => c.url.endsWith('/rpc/award_progress'))).toHaveLength(1);
  });
});

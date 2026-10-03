import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.js';

describe('parseClientMessage: shots', () => {
  it('accepts a shot and re-normalizes its direction', () => {
    const msg = parseClientMessage(JSON.stringify({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1.2], w: 'rail' } }));
    expect(msg).toEqual({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1], w: 'rail' } });
  });

  it('a shot must name a known weapon (ADR-0033)', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1] } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1], w: 'laser' } }))).toBeNull();
  });

  it('loadouts are cleaned on the way in (ADR-0033)', () => {
    const msg = parseClientMessage(JSON.stringify({ t: 'loadout', loadout: { body: 'racer', weapons: ['rail', 'rail'], special: 'maneuver' } }));
    expect(msg).toEqual({ t: 'loadout', loadout: { body: 'racer', weapons: ['rail'], special: null } });
  });

  it('rejects malformed or degenerate shots', () => {
    for (const bad of [
      { t: 'shot' },
      { t: 'shot', s: { ts: 5, p: [0, 1], d: [0, 0, -1] } },
      { t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, 0] } },
      { t: 'shot', s: { ts: 'x', p: [0, 1, 2], d: [0, 0, -1] } },
      { t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, 1e9] } },
    ]) {
      expect(parseClientMessage(JSON.stringify(bad))).toBeNull();
    }
  });
});

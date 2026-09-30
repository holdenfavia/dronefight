import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.js';

describe('parseClientMessage: shots', () => {
  it('accepts a shot and re-normalizes its direction', () => {
    const msg = parseClientMessage(JSON.stringify({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1.2] } }));
    expect(msg).toEqual({ t: 'shot', s: { ts: 5, p: [0, 1, 2], d: [0, 0, -1] } });
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

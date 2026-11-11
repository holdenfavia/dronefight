import { describe, expect, it } from 'vitest';
import { lobbyHost, parseLobbyMessage } from './lobby.js';

describe('lobby messages', () => {
  it('accepts a pick and rejects anything else', () => {
    expect(parseLobbyMessage({ t: 'pick', fighter: 'ninja', ready: true })).toEqual({ t: 'pick', fighter: 'ninja', ready: true });
    expect(parseLobbyMessage({ t: 'pick', fighter: 'nobody', ready: true })).toBeNull();
    expect(parseLobbyMessage({ t: 'pick', fighter: 'ninja' })).toBeNull();
    expect(parseLobbyMessage('pick')).toBeNull();
    expect(parseLobbyMessage(null)).toBeNull();
  });

  it('makes the longest-standing member host', () => {
    expect(lobbyHost([3, 1, 2])).toBe(1);
    expect(lobbyHost([])).toBe(-1);
  });
});

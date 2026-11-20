import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../../shared/fighter/sim.js';
import { encodeInput, mergeInputs, type MatchStart } from '../../shared/online.js';
import { OnlineMatch } from './match.js';

const START: MatchStart = {
  stage: 'rooftop',
  stocks: 3,
  seed: 7,
  fighters: [
    { fighter: 'brawler', member: 0, level: 0, team: -1 },
    { fighter: 'blade', member: 1, level: 0, team: -1 },
  ],
  rules: {},
};

const LEFT = encodeInput({ ...NO_INPUT, left: true });
const ATTACK = encodeInput({ ...NO_INPUT, attack: true, aimRight: true });

describe('online input queue (ADR-0088)', () => {
  it('keeps keys newly pressed in a skipped frame', () => {
    expect(mergeInputs(0, ATTACK, 0)).toBe(ATTACK);
    expect(mergeInputs(LEFT, LEFT, 0)).toBe(0); // Held then released: the release wins.
    expect(mergeInputs(0, LEFT, LEFT | ATTACK)).toBe(LEFT | ATTACK);
  });

  it('drains a burst to one frame of backlog instead of keeping it', () => {
    const m = new OnlineMatch(START);
    m.step();
    for (let i = 0; i < 5; i++) m.input(0, LEFT);
    m.step();
    // The burst is folded: only one input is left waiting, so the next keys apply one frame later, not five.
    m.input(0, 0);
    m.step();
    expect(m.step()[0]).toBe(0);
  });

  it('never loses a tap inside a burst', () => {
    const m = new OnlineMatch(START);
    m.step();
    m.input(0, 0);
    m.input(0, ATTACK); // Tapped for one frame...
    m.input(0, 0);
    m.input(0, 0);
    const used = [m.step()[0], m.step()[0], m.step()[0]];
    expect(used).toContain(ATTACK);
  });
});

describe('input acks (ADR-0089)', () => {
  it('reports the sequence number of the last input used, the newer one when merged', () => {
    const m = new OnlineMatch(START);
    expect(m.acks()).toEqual([-1, -1]);
    m.input(0, LEFT, 1);
    m.step();
    expect(m.acks()[0]).toBe(1);
    for (let s = 2; s <= 5; s++) m.input(0, LEFT, s);
    m.step();
    expect(m.acks()[0]).toBe(4); // 2..4 folded into one frame, 5 waits.
    m.step();
    expect(m.acks()[0]).toBe(5);
    m.step(); // Starved: the last keys repeat, nothing new is acked.
    expect(m.acks()[0]).toBe(5);
  });
});

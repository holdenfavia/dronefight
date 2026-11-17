import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_TEXT, FeedbackSink, parseFeedback } from './feedback.js';

describe('feedback', () => {
  it('keeps a trimmed note, name and screen', () => {
    const e = parseFeedback(JSON.stringify({ text: '  jab feels slow ', name: 'Sam', screen: 'main' }), 'UA', new Date(0));
    expect(e).toEqual({ at: '1970-01-01T00:00:00.000Z', text: 'jab feels slow', name: 'Sam', screen: 'main', ua: 'UA' });
  });

  it('rejects empty or malformed notes', () => {
    expect(parseFeedback('not json')).toBeNull();
    expect(parseFeedback(JSON.stringify({ text: '   ' }))).toBeNull();
    expect(parseFeedback(JSON.stringify({ text: 5 }))).toBeNull();
    expect(parseFeedback('null')).toBeNull();
  });

  it('cuts long notes', () => {
    const e = parseFeedback(JSON.stringify({ text: 'x'.repeat(FEEDBACK_MAX_TEXT + 50) }));
    expect(e?.text.length).toBe(FEEDBACK_MAX_TEXT);
  });

  it('limits notes per address per minute', () => {
    const sink = new FeedbackSink(null, () => undefined);
    const sent = Array.from({ length: 7 }, () => sink.allow('1.2.3.4', 1000));
    expect(sent.filter(Boolean).length).toBe(5);
    expect(sink.allow('5.6.7.8', 1000)).toBe(true);
    expect(sink.allow('1.2.3.4', 1000 + 61_000)).toBe(true);
  });

  it('logs each note as one line', async () => {
    const lines: string[] = [];
    const sink = new FeedbackSink(null, (l) => lines.push(l));
    await sink.store({ at: 'now', text: 'hi', name: '', screen: 'select', ua: '' });
    expect(lines).toEqual(['[feedback] {"at":"now","text":"hi","name":"","screen":"select","ua":""}']);
  });
});

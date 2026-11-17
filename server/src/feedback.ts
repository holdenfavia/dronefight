// Player feedback from the menus' Feedback button: POST /api/feedback with JSON { text, name?, screen? }.
// Each note is printed to the server log as one `[feedback]` line (read with `fly logs`) and, when
// FEEDBACK_FILE is set, appended to that file as JSON lines.
import { appendFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const FEEDBACK_PATH = '/api/feedback';
/** Longest note the form allows (characters). */
export const FEEDBACK_MAX_TEXT = 1000;
const FEEDBACK_MAX_NAME = 40;
const FEEDBACK_MAX_SCREEN = 20;
const MAX_BODY_BYTES = 8192;
/** Notes one address may send per window, so a stuck key or a bored friend can't flood the log. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

export interface FeedbackEntry {
  at: string;
  text: string;
  name: string;
  screen: string;
  ua: string;
}

/** Validate a posted body; null when it isn't a usable note. */
export function parseFeedback(body: string, ua = '', now = new Date()): FeedbackEntry | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const text = str(d.text, FEEDBACK_MAX_TEXT);
  if (!text) return null;
  return {
    at: now.toISOString(),
    text,
    name: str(d.name, FEEDBACK_MAX_NAME),
    screen: str(d.screen, FEEDBACK_MAX_SCREEN),
    ua: ua.slice(0, 200),
  };
}

export class FeedbackSink {
  private recent = new Map<string, number[]>();

  constructor(private file: string | null = process.env.FEEDBACK_FILE || null, private log: (line: string) => void = console.log) {}

  /** True when this address may send another note now (and counts it). */
  allow(addr: string, now = Date.now()): boolean {
    const times = (this.recent.get(addr) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (times.length >= RATE_LIMIT) {
      this.recent.set(addr, times);
      return false;
    }
    times.push(now);
    this.recent.set(addr, times);
    if (this.recent.size > 1000) this.recent.clear();
    return true;
  }

  async store(entry: FeedbackEntry): Promise<void> {
    const line = JSON.stringify(entry);
    this.log(`[feedback] ${line}`);
    if (this.file) await appendFile(this.file, line + '\n').catch((e) => console.error('feedback file:', e));
  }

  handle(req: IncomingMessage, res: ServerResponse): void {
    const reply = (status: number, ok: boolean) =>
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ ok }));
    if (req.method !== 'POST') return void reply(405, false);
    const addr = String(req.headers['fly-client-ip'] ?? req.socket.remoteAddress ?? '');
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reply(413, false);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.headersSent) return;
      const entry = parseFeedback(Buffer.concat(chunks).toString('utf8'), String(req.headers['user-agent'] ?? ''));
      if (!entry) return void reply(400, false);
      if (!this.allow(addr)) return void reply(429, false);
      void this.store(entry).then(() => reply(200, true));
    });
  }
}

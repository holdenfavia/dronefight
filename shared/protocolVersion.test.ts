// Guard: any change to the wire format (shared/protocol.ts, comments and blank lines aside) must bump
// PROTOCOL_VERSION, so an old page and a new server refuse each other instead of misreading messages.
// Types protocol.ts imports from other files (loadouts, maps) aren't covered: bump by hand when those change shape.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './constants.js';

/** The protocol's code with comments and whitespace removed, hashed. Update together with PROTOCOL_VERSION. */
const PROTOCOL_HASH = { version: 19, sha: 'e6e4d667ee5d7043' };

function protocolHash(): string {
  const src = readFileSync(new URL('./protocol.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, '');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}

describe('protocol version guard', () => {
  it('protocol.ts changes come with a PROTOCOL_VERSION bump', () => {
    const sha = protocolHash();
    if (sha !== PROTOCOL_HASH.sha) {
      expect.fail(
        `shared/protocol.ts changed (hash ${sha}). Bump PROTOCOL_VERSION in shared/constants.ts if the wire format changed, ` +
          `then set PROTOCOL_HASH in shared/protocolVersion.test.ts to { version: <new>, sha: '${sha}' }.`,
      );
    }
    expect(PROTOCOL_VERSION).toBe(PROTOCOL_HASH.version);
  });
});

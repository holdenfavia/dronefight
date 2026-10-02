import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

/** Minimal static file server for the built client (ADR-0021). Unknown paths get index.html. */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function fileAt(root: string, urlPath: string): string | null {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let urlPath: string;
  try {
    urlPath = new URL(req.url ?? '/', 'http://x').pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = fileAt(root, urlPath) ?? fileAt(root, '/index.html');
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  // Vite puts content-hashed files under assets/: cache them forever, never cache the page.
  const hashed = urlPath.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

// The Winter Village (seasonal stage, ADR-0091): a snowy village square at dusk. Only looks, nothing here touches
// the fight. A raised stone square under a cap of snow with a big decorated tree behind it, a market-stall roof
// (left), a parked sleigh (right) and a garland of lights strung between two lamp posts (high middle) as the
// pass-through platforms; houses with lit windows and snowy hills behind; snow drifting across the screen.

import type { Projectile } from '../../shared/fighter/sim';
import type { Platform, StageDef } from '../../shared/fighter/stages';
import { PALETTE, WINTER } from './config';
import type { Layer, View } from './stageDetail';

const P = Math.PI;

function tint(v: View, color: string, purple: string): string {
  return v.purple ? purple : color;
}

/** Dusk sky: deep blue to rose, a low moon, a few stars. Replaces the city sky on this stage. */
export function drawWinterSky(v: View, camY: number): void {
  const ctx = v.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, v.h);
  g.addColorStop(0, v.purple ? PALETTE.purpleTop : WINTER.skyTop);
  g.addColorStop(0.7, v.purple ? PALETTE.purpleHorizon : WINTER.skyHorizon);
  g.addColorStop(1, v.purple ? '#f0dcff' : WINTER.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
  // Stars, twinkling.
  for (let i = 0; i < 40; i++) {
    const x = ((i * 977) % 1000) / 1000 * v.w - v.camX * 0.01;
    const y = ((i * 613) % 1000) / 1000 * v.h * 0.45 + camY * 0.01;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(v.time * 0.05 + i * 1.7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(((x % v.w) + v.w) % v.w, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  // The moon.
  const mx = v.w * 0.78 - v.camX * 0.02, my = v.h * 0.18, mr = v.h * 0.045;
  const mg = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
  mg.addColorStop(0, 'rgba(255,248,230,0.35)');
  mg.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.fillStyle = '#fff8e6';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, P * 2);
  ctx.fill();
}

/** Snowy hills, pines and a row of village houses with lit windows. */
export function drawWinterBackdrop(v: View, layer: (parallax: number, zoomK: number, horizon: number) => Layer): void {
  const ctx = v.ctx;
  const hills = (L: Layer, color: string, base: number, amp: number, freq: number, shift: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, v.h);
    for (let px = 0; px <= v.w + 20; px += 20) {
      const wx = (px - v.w / 2) / L.s;
      ctx.lineTo(px, L.y(base + Math.sin(wx * freq + shift) * amp + Math.sin(wx * freq * 2.3 + shift) * amp * 0.3));
    }
    ctx.lineTo(v.w, v.h);
    ctx.fill();
  };
  const far = layer(0.05, 0.5, 0.66);
  hills(far, tint(v, WINTER.hillFar, '#8a63c9'), 150, 70, 0.004, 1);
  const mid = layer(0.15, 0.6, 0.74);
  hills(mid, tint(v, WINTER.hillMid, '#6c4aa8'), 80, 30, 0.007, 2);
  // Pines on the middle hills.
  for (let i = -16; i <= 16; i++) {
    const tx = i * 120 + ((i * 37) % 50);
    const x = mid.x(tx);
    if (x < -40 || x > v.w + 40) continue;
    pine(ctx, x, mid.y(70), (36 + ((i * 13) & 15)) * mid.s, tint(v, '#2f5a4a', '#4a2f7a'), tint(v, WINTER.snow, '#d9c8ff'));
  }
  // Village houses on the near layer: walls, snowy roofs, lit windows, chimneys.
  const near = layer(0.3, 0.7, 0.86);
  const walls = ['#8a3a3a', '#3a5a8a', '#6b4a2a', '#4a6a4a', '#7a5a8a'];
  for (let i = -10; i <= 10; i++) {
    const hx = i * 170 + ((i * 53) % 30);
    const w = (110 + ((i * 29) & 31)) * near.s;
    const hgt = (80 + ((i * 17) & 31)) * near.s;
    const x = near.x(hx);
    if (x + w < 0 || x - w > v.w) continue;
    const base = near.y(0);
    ctx.fillStyle = tint(v, walls[((i % walls.length) + walls.length) % walls.length]!, '#3e2a66');
    ctx.fillRect(x - w / 2, base - hgt, w, hgt + 40);
    // Roof.
    ctx.fillStyle = tint(v, '#3a2a2a', '#2a1a4a');
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 8 * near.s, base - hgt);
    ctx.lineTo(x, base - hgt - w * 0.42);
    ctx.lineTo(x + w / 2 + 8 * near.s, base - hgt);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tint(v, WINTER.snow, '#e0d0ff');
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 9 * near.s, base - hgt + 2);
    ctx.lineTo(x, base - hgt - w * 0.42 - 3 * near.s);
    ctx.lineTo(x + w / 2 + 9 * near.s, base - hgt + 2);
    ctx.lineTo(x + w / 2 + 2, base - hgt + 6 * near.s);
    ctx.lineTo(x, base - hgt - w * 0.36);
    ctx.lineTo(x - w / 2 - 2, base - hgt + 6 * near.s);
    ctx.closePath();
    ctx.fill();
    // Chimney with a curl of smoke.
    ctx.fillStyle = tint(v, '#5a3a2a', '#3a2a5a');
    ctx.fillRect(x + w * 0.18, base - hgt - w * 0.36, 12 * near.s, w * 0.22);
    ctx.fillStyle = 'rgba(230,236,245,0.35)';
    for (let k = 0; k < 3; k++) {
      const age = (((v.time * 0.01 + k / 3 + i * 0.13) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(x + w * 0.18 + 6 * near.s + Math.sin(age * 6 + i) * 6 * near.s, base - hgt - w * 0.38 - age * 60 * near.s, (5 + age * 10) * near.s, 0, P * 2);
      ctx.fill();
    }
    // Lit windows.
    ctx.fillStyle = tint(v, WINTER.windows, 'rgba(255,214,255,0.5)');
    const ww = 14 * near.s, wh = 18 * near.s;
    for (const dx of [-0.28, 0.12]) ctx.fillRect(x + w * dx, base - hgt * 0.75, ww, wh);
    ctx.fillRect(x - ww / 2, base - hgt * 0.4, ww, wh * 1.3);
  }
  // A snowbank in front of the houses.
  hills(layer(0.4, 0.75, 0.9), tint(v, WINTER.hillNear, '#c9b0f0'), 10, 8, 0.01, 4);
}

function pine(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, green: string, snow: string): void {
  for (let k = 0; k < 3; k++) {
    const top = y - h * (0.45 + k * 0.28);
    const half = h * (0.32 - k * 0.07);
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.3);
    ctx.lineTo(x + half, top + h * 0.12);
    ctx.lineTo(x - half, top + h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.3);
    ctx.lineTo(x + half * 0.45, top - h * 0.12);
    ctx.lineTo(x - half * 0.45, top - h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(x - h * 0.04, y - h * 0.38, h * 0.08, h * 0.38);
}

function rect(v: View, x1: number, y1: number, x2: number, y2: number, color: string): void {
  v.ctx.fillStyle = color;
  v.ctx.fillRect(v.sx(x1), v.sy(Math.max(y1, y2)), (x2 - x1) * v.s, Math.abs(y2 - y1) * v.s);
}

/** A lumpy cap of snow along the top of a surface. */
function snowCap(v: View, x1: number, x2: number, y: number, thick: number): void {
  const ctx = v.ctx;
  ctx.fillStyle = tint(v, WINTER.snow, '#e8dcff');
  ctx.beginPath();
  ctx.moveTo(v.sx(x1 - 4), v.sy(y));
  const n = Math.max(3, Math.round((x2 - x1) / 30));
  for (let i = 0; i <= n; i++) {
    const x = x1 - 4 + ((x2 - x1 + 8) * i) / n;
    ctx.lineTo(v.sx(x), v.sy(y + thick * (0.6 + 0.4 * Math.sin(i * 2.1 + x1))));
  }
  ctx.lineTo(v.sx(x2 + 4), v.sy(y));
  // Icicle drips under the edge.
  for (let i = n; i >= 0; i--) {
    const x = x1 + ((x2 - x1) * i) / n;
    ctx.lineTo(v.sx(x + 5), v.sy(y - 2));
    if (i % 2 === 0) ctx.lineTo(v.sx(x), v.sy(y - thick * 0.9));
  }
  ctx.closePath();
  ctx.fill();
}

/** A string of colored bulbs from (x1, y1) to (x2, y2), sagging; they blink in turn. */
function lights(v: View, x1: number, y1: number, x2: number, y2: number, sag: number, n: number, phase = 0): void {
  const ctx = v.ctx;
  ctx.strokeStyle = '#1e2a22';
  ctx.lineWidth = Math.max(1, 1.5 * v.s);
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k - Math.sin(k * P) * sag;
    if (i === 0) ctx.moveTo(v.sx(x), v.sy(y)); else ctx.lineTo(v.sx(x), v.sy(y));
  }
  ctx.stroke();
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k - Math.sin(k * P) * sag - 4;
    const on = ((v.time >> 4) + i + phase) % 3 !== 0;
    const c = WINTER.lights[(i + phase) % WINTER.lights.length]!;
    if (on) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(v.sx(x), v.sy(y), Math.max(3, 9 * v.s), 0, P * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = on ? c : '#3a3a40';
    ctx.beginPath();
    ctx.ellipse(v.sx(x), v.sy(y), Math.max(1.5, 3 * v.s), Math.max(2, 4.5 * v.s), 0, 0, P * 2);
    ctx.fill();
  }
}

/** The big decorated tree behind the square. */
function bigTree(v: View, x: number, ground: number): void {
  const ctx = v.ctx;
  const s = v.s;
  const h = 330;
  rect(v, x - 12, ground, x + 12, ground + 40, '#4a3020');
  for (let k = 0; k < 4; k++) {
    const top = ground + 60 + k * 62 + 90;
    const half = 150 - k * 30;
    ctx.fillStyle = tint(v, k % 2 ? WINTER.pine : WINTER.pineDark, '#4a2f7a');
    ctx.beginPath();
    ctx.moveTo(v.sx(x), v.sy(top));
    ctx.lineTo(v.sx(x + half), v.sy(top - 120));
    ctx.lineTo(v.sx(x - half), v.sy(top - 120));
    ctx.closePath();
    ctx.fill();
    snowCapTri(v, x, top, half * 0.35);
  }
  // Lights spiral across the tree and a star on top.
  lights(v, x - 140, ground + 50, x + 120, ground + 120, -20, 9, 0);
  lights(v, x + 100, ground + 140, x - 90, ground + 200, -14, 7, 1);
  lights(v, x - 60, ground + 230, x + 55, ground + 270, -8, 5, 2);
  const sx = v.sx(x), sy = v.sy(ground + h + 20);
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(v.time * 0.08);
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.arc(sx, sy, 30 * s, 0, P * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd23a';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -P / 2 + (i / 10) * P * 2;
    const rr = (i % 2 ? 7 : 17) * s;
    ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function snowCapTri(v: View, x: number, top: number, half: number): void {
  const ctx = v.ctx;
  ctx.fillStyle = tint(v, WINTER.snow, '#e0d0ff');
  ctx.beginPath();
  ctx.moveTo(v.sx(x), v.sy(top));
  ctx.lineTo(v.sx(x + half), v.sy(top - 40));
  ctx.lineTo(v.sx(x + half * 0.4), v.sy(top - 32));
  ctx.lineTo(v.sx(x), v.sy(top - 42));
  ctx.lineTo(v.sx(x - half * 0.4), v.sy(top - 32));
  ctx.lineTo(v.sx(x - half), v.sy(top - 40));
  ctx.closePath();
  ctx.fill();
}

function lampPost(v: View, x: number, ground: number, top: number): void {
  const ctx = v.ctx;
  ctx.strokeStyle = '#1e2228';
  ctx.lineWidth = Math.max(2, 6 * v.s);
  ctx.beginPath();
  ctx.moveTo(v.sx(x), v.sy(ground));
  ctx.lineTo(v.sx(x), v.sy(top + 6));
  ctx.stroke();
  rect(v, x - 9, top + 6, x + 9, top + 26, '#2a2e36');
  const g = ctx.createRadialGradient(v.sx(x), v.sy(top + 16), 0, v.sx(x), v.sy(top + 16), 50 * v.s);
  g.addColorStop(0, 'rgba(255,220,150,0.55)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(v.sx(x) - 50 * v.s, v.sy(top + 16) - 50 * v.s, 100 * v.s, 100 * v.s);
  rect(v, x - 6, top + 9, x + 6, top + 23, '#ffe0a0');
  snowCap(v, x - 12, x + 12, top + 26, 5);
}

function marketStall(v: View, p: Platform, ground: number): void {
  const ctx = v.ctx;
  // Posts and a counter under the roof.
  for (const x of [p.x1 + 10, p.x2 - 10]) rect(v, x - 4, ground, x + 4, p.y, '#5a3a22');
  rect(v, p.x1 + 6, ground, p.x2 - 6, ground + 34, tint(v, WINTER.wood, '#4a2f7a'));
  ctx.fillStyle = '#ffd890';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(v.sx(p.x1 + 14), v.sy(ground + 30), (p.x2 - p.x1 - 28) * v.s, 6 * v.s);
  ctx.globalAlpha = 1;
  // Striped awning roof (the platform).
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x1 = p.x1 + ((p.x2 - p.x1) * i) / n, x2 = p.x1 + ((p.x2 - p.x1) * (i + 1)) / n;
    rect(v, x1, p.y - 14, x2, p.y, i % 2 ? '#fafafa' : '#c8283c');
    ctx.fillStyle = i % 2 ? '#fafafa' : '#c8283c';
    ctx.beginPath();
    ctx.arc(v.sx((x1 + x2) / 2), v.sy(p.y - 14), ((x2 - x1) / 2) * v.s, 0, P);
    ctx.fill();
  }
  snowCap(v, p.x1, p.x2, p.y, 7);
}

function sleigh(v: View, p: Platform, ground: number): void {
  const ctx = v.ctx;
  const s = v.s;
  // Runners.
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = Math.max(2, 4 * s);
  ctx.beginPath();
  ctx.moveTo(v.sx(p.x1 + 6), v.sy(ground + 6));
  ctx.lineTo(v.sx(p.x2 - 10), v.sy(ground + 6));
  ctx.quadraticCurveTo(v.sx(p.x2 + 14), v.sy(ground + 6), v.sx(p.x2 + 8), v.sy(ground + 30));
  ctx.stroke();
  for (const x of [p.x1 + 30, p.x2 - 40]) rect(v, x - 3, ground + 6, x + 3, ground + 22, '#c9a24a');
  // Body: a curled red sleigh; the seat back is the platform.
  ctx.fillStyle = tint(v, '#b82030', '#6c4aa8');
  ctx.beginPath();
  ctx.moveTo(v.sx(p.x1), v.sy(p.y));
  ctx.lineTo(v.sx(p.x1 + 40), v.sy(p.y));
  ctx.lineTo(v.sx(p.x1 + 50), v.sy(ground + 56));
  ctx.lineTo(v.sx(p.x2 - 20), v.sy(ground + 56));
  ctx.quadraticCurveTo(v.sx(p.x2 + 20), v.sy(ground + 60), v.sx(p.x2), v.sy(p.y - 10));
  ctx.lineTo(v.sx(p.x2 - 10), v.sy(ground + 22));
  ctx.lineTo(v.sx(p.x1 + 10), v.sy(ground + 22));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd23a';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.stroke();
  rect(v, p.x1, p.y - 8, p.x1 + 42, p.y, '#8a1828');
  rect(v, p.x1 + 40, ground + 56, p.x2 - 18, ground + 62, '#8a1828');
  // A pile of presents in the back.
  const gifts: [number, number, string][] = [[p.x1 + 60, 28, '#3a8a5a'], [p.x1 + 92, 22, '#3a5ab8'], [p.x1 + 74, 18, '#e8b23a']];
  let stack = ground + 56;
  for (const [x, size, c] of gifts) {
    const y = x === p.x1 + 74 ? stack + 26 : ground + 56;
    rect(v, x, y, x + size, y + size, c);
    rect(v, x + size / 2 - 2, y, x + size / 2 + 2, y + size, '#fafafa');
    if (x !== p.x1 + 74) stack = Math.max(stack, ground + 56);
  }
  snowCap(v, p.x1, p.x1 + 42, p.y, 5);
}

/** Everything that holds the stage up and the platforms themselves. */
export function drawWinterStage(v: View, stage: StageDef): void {
  const main = stage.platforms[0]!;
  const ground = main.y;
  const ctx = v.ctx;
  // The big tree behind the square.
  bigTree(v, 0, ground);
  // The square: a stone plinth with steps, going down off the bottom of the screen.
  const bottom = ground - 1600;
  rect(v, main.x1 + 30, ground - main.depth, main.x2 - 30, bottom, tint(v, '#3a3e4c', '#3e2a66'));
  rect(v, main.x1, ground, main.x2, ground - main.depth, tint(v, WINTER.stone, '#5a4a8a'));
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = ground - 25; y > ground - main.depth; y -= 25) {
    ctx.moveTo(v.sx(main.x1), v.sy(y));
    ctx.lineTo(v.sx(main.x2), v.sy(y));
    const off = ((y / 25) & 1) * 30;
    for (let x = main.x1 + off; x < main.x2; x += 60) {
      ctx.moveTo(v.sx(x), v.sy(y));
      ctx.lineTo(v.sx(x), v.sy(y + 25));
    }
  }
  ctx.stroke();
  // Windows of the building the square sits on.
  ctx.fillStyle = tint(v, 'rgba(255,216,144,0.35)', 'rgba(255,214,255,0.25)');
  for (let y = ground - main.depth - 40; v.sy(y) < v.h + 40 && y > bottom; y -= 60) {
    for (let x = main.x1 + 60; x < main.x2 - 60; x += 70) ctx.fillRect(v.sx(x), v.sy(y), 26 * v.s, 34 * v.s);
  }
  // Garland posts, then the snow on the square.
  const garland = stage.platforms.find((p) => !p.solid && p.y > 200);
  if (garland) for (const x of [garland.x1, garland.x2]) lampPost(v, x, ground, garland.y);
  snowCap(v, main.x1, main.x2, ground, 10);
  // A little snowman and a lantern on the square, faded so they read as scenery.
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = WINTER.snow;
  for (const [dy, rr] of [[14, 14], [36, 10], [52, 7]] as const) {
    ctx.beginPath();
    ctx.arc(v.sx(330), v.sy(ground + dy), rr * v.s, 0, P * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Platforms.
  for (const p of stage.platforms) {
    if (p.solid) continue;
    if (p === garland) {
      // The garland itself: a fir rope with bulbs.
      ctx.strokeStyle = tint(v, WINTER.pine, '#4a2f7a');
      ctx.lineWidth = Math.max(3, 9 * v.s);
      ctx.beginPath();
      ctx.moveTo(v.sx(p.x1), v.sy(p.y));
      ctx.lineTo(v.sx(p.x2), v.sy(p.y));
      ctx.stroke();
      lights(v, p.x1, p.y + 2, p.x2, p.y + 2, 0, 10, 0);
      lights(v, p.x1, p.y + 26, p.x2, p.y + 26, 18, 8, 2);
    } else if (p.x1 < 0) marketStall(v, p, ground);
    else sleigh(v, p, ground);
  }
}

/** Snow drifting down across the screen (only the look: nothing in the fight). */
export function drawSnowfall(v: View): void {
  const ctx = v.ctx;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < WINTER.flakeCount; i++) {
    const speed = 0.5 + (i % 7) * 0.12;
    const size = 1.2 + (i % 4) * 0.7;
    const x = ((i * 173 + Math.sin(v.time * 0.02 + i) * 25 - v.camX * 0.1 * (i % 3)) % (v.w + 40) + v.w + 40) % (v.w + 40) - 20;
    const y = ((i * 97 + v.time * speed) % (v.h + 20)) - 10;
    ctx.globalAlpha = 0.5 + (i % 4) * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, P * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The Christmas fighters' projectiles. Returns false for any other look. */
export function drawChristmasLook(ctx: CanvasRenderingContext2D, p: Projectile, px: number, py: number, r: number): boolean {
  const ink = PALETTE.ink;
  const ball = (fillColor: string, rr = r, line = 2) => {
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, P * 2);
    ctx.fill();
    ctx.stroke();
  };
  switch (p.look) {
    case 'snowball':
      ball('#f6f9ff');
      ctx.fillStyle = '#c9d6ec';
      ctx.beginPath(); ctx.arc(px - r * 0.3, py + r * 0.3, r * 0.45, 0, P * 2); ctx.fill();
      return true;
    case 'avalanche': {
      // A huge rolling snowball, drawn bigger than it hits.
      const R = r * 1.6;
      ball('#f6f9ff', R, 2.5);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.age * 0.25 * (Math.sign(p.vx) || 1));
      ctx.fillStyle = '#c9d6ec';
      for (const [dx, dy, rr] of [[0.4, 0.2, 0.3], [-0.35, -0.3, 0.25], [-0.1, 0.5, 0.18]] as const) {
        ctx.beginPath(); ctx.arc(dx * R, dy * R, rr * R, 0, P * 2); ctx.fill();
      }
      ctx.restore();
      return true;
    }
    case 'ice':
      ctx.fillStyle = 'rgba(170,225,255,0.75)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.6, r * 1.6, r * 0.4, 0, 0, P * 2);
      ctx.fill();
      ctx.stroke();
      return true;
    case 'toyball':
      ball('#c8283c');
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(px - r, py - 1.5, r * 2, 3);
      return true;
    case 'train': {
      const d = Math.sign(p.vx) || 1;
      ctx.fillStyle = '#c8283c';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.fillRect(px - r * 1.3, py - r * 0.7, r * 2.6, r * 1.2);
      ctx.strokeRect(px - r * 1.3, py - r * 0.7, r * 2.6, r * 1.2);
      ctx.fillStyle = '#2a4a8a';
      ctx.fillRect(px - d * r * 1.3 - (d > 0 ? 0 : -r * 0.2) , py - r * 1.3, r * 1.0 * d, r * 0.7);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(px + d * r * 0.6 - 2, py - r * 1.4, 4, r * 0.8);
      for (const dx of [-0.8, 0.8]) {
        ctx.beginPath(); ctx.arc(px + dx * r, py + r * 0.6, r * 0.4, 0, P * 2); ctx.fillStyle = '#1b1b1b'; ctx.fill();
      }
      return true;
    }
    case 'bouncyball':
      ball('#3fd06a');
      ctx.strokeStyle = '#fafafa';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r * 0.6, 0.3, P - 0.3); ctx.stroke();
      return true;
    case 'top': {
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = (p.age >> 2) % 2 ? '#ffd23a' : '#ff4fd8';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.2);
      ctx.lineTo(r, -r * 0.2);
      ctx.lineTo(0, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-1.5, -r, 3, r * 0.8);
      ctx.restore();
      return true;
    }
    case 'gift':
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.age * 0.15);
      ctx.fillStyle = '#3a8a5a';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#e8322a';
      ctx.fillRect(-2, -r, 4, r * 2);
      ctx.fillRect(-r, -2, r * 2, 4);
      ctx.beginPath();
      ctx.ellipse(-4, -r - 2, 4, 2.5, -0.5, 0, P * 2);
      ctx.ellipse(4, -r - 2, 4, 2.5, 0.5, 0, P * 2);
      ctx.fill();
      ctx.restore();
      return true;
    case 'nosebeam':
    case 'beacon': {
      const big = p.look === 'beacon';
      const d = Math.sign(p.vx) || 1;
      ctx.strokeStyle = big ? 'rgba(255,90,60,0.55)' : 'rgba(255,70,50,0.45)';
      ctx.lineWidth = r * (big ? 3 : 1.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - d * r * (big ? 10 : 6), py);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.fillStyle = big ? '#fff2b0' : '#ffb0a0';
      ctx.beginPath();
      ctx.arc(px, py, r * (big ? 1.4 : 0.8), 0, P * 2);
      ctx.fill();
      return true;
    }
    case 'gumdrop': {
      const colors = ['#ff4a4a', '#4ad06a', '#ffd23a', '#4ab8ff'];
      ctx.fillStyle = colors[p.id % colors.length]!;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py + r * 0.3, r, P, 0);
      ctx.lineTo(px + r, py + r * 0.6);
      ctx.lineTo(px - r, py + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (const [dx, dy] of [[-0.4, -0.1], [0.3, -0.3], [0.1, 0.2]] as const) ctx.fillRect(px + dx * r, py + dy * r, 1.5, 1.5);
      return true;
    }
    default:
      return false;
  }
}

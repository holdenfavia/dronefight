// Shading tools for the stage art: a mild one-point perspective so solid things show a top and a side, light from the
// stage's sun, soft contact shadows and haze. Everything works in screen pixels; world-to-screen happens before.

/** Where the eye is (the vanishing point), and how strong the perspective is. */
export interface Eye {
  /** Vanishing point on screen (the camera's center). */
  vx: number;
  vy: number;
  /** Pixels per world unit, so depths in world units scale with zoom. */
  s: number;
  /** +1: the sun is to the right; -1: to the left. */
  light: 1 | -1;
}

/** Focal length in pixels: bigger is flatter. */
export const FOCAL = 1500;

/** A screen point on the z = 0 plane moved to depth z (world units; positive is away from the viewer). */
export function project(e: Eye, x: number, y: number, z: number): [number, number] {
  const f = FOCAL / (FOCAL + z * e.s);
  return [e.vx + (x - e.vx) * f, e.vy + (y - e.vy) * f];
}

const mixCache = new Map<string, string>();

/** A color mixed toward white (amount > 0) or black (amount < 0). */
export function tone(hex: string, amount: number): string {
  const key = hex + amount;
  const hit = mixCache.get(key);
  if (hit) return hit;
  let h = toHex(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const to = amount > 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(amount));
  const ch = (v: number) => Math.round(v + (to - v) * a);
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  if (mixCache.size > 2000) mixCache.clear();
  mixCache.set(key, out);
  return out;
}

/** A color mixed toward another color. */
export function blend(hex: string, toward: string, amount: number): string {
  const key = hex + toward + amount;
  const hit = mixCache.get(key);
  if (hit) return hit;
  const p = (c: string) => {
    let h = toHex(c).replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(toward);
  const out = `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * amount)).join(',')})`;
  if (mixCache.size > 2000) mixCache.clear();
  mixCache.set(key, out);
  return out;
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly [number, number][], fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fill();
}

export interface BoxStyle {
  /** Base color (hex). */
  color: string;
  /** Top face color; defaults to the base lit by the sky. */
  top?: string;
  /** Front face fill; defaults to a top-lit vertical gradient of the base color. */
  front?: string | CanvasGradient;
  /** Skip the front face (something else draws it). */
  noFront?: boolean;
  /** A bright line along the front top edge. */
  rim?: boolean;
}

/**
 * A solid block in perspective: its front face is the screen rectangle x1..x2, y1 (top)..y2 (bottom) at depth z1, and it
 * runs back to depth z2. Draws whichever side and top or bottom the eye can see, then the front.
 */
export function box3(ctx: CanvasRenderingContext2D, e: Eye, x1: number, y1: number, x2: number, y2: number, z1: number, z2: number, st: BoxStyle): void {
  const P = (x: number, y: number, z: number) => project(e, x, y, z);
  const [fx1, fy1] = P(x1, y1, z1);
  const [fx2, fy2] = P(x2, y2, z1);
  const [bx1, by1] = P(x1, y1, z2);
  const [bx2, by2] = P(x2, y2, z2);
  // Sides: the left one shows when the eye is left of the block, the right one when it is right.
  if (e.vx < fx1) poly(ctx, [[fx1, fy1], [bx1, by1], [bx1, by2], [fx1, fy2]], tone(st.color, e.light < 0 ? 0.12 : -0.35));
  if (e.vx > fx2) poly(ctx, [[fx2, fy1], [bx2, by1], [bx2, by2], [fx2, fy2]], tone(st.color, e.light > 0 ? 0.12 : -0.35));
  // Top when the eye is above it, bottom when below.
  if (e.vy < fy1) poly(ctx, [[fx1, fy1], [fx2, fy1], [bx2, by1], [bx1, by1]], st.top ?? tone(st.color, 0.22));
  else if (e.vy > fy2) poly(ctx, [[fx1, fy2], [fx2, fy2], [bx2, by2], [bx1, by2]], tone(st.color, -0.3));
  if (!st.noFront) {
    let front = st.front;
    if (!front) {
      const g = ctx.createLinearGradient(0, fy1, 0, fy2);
      g.addColorStop(0, tone(st.color, 0.08));
      g.addColorStop(1, tone(st.color, -0.22));
      front = g;
    }
    ctx.fillStyle = front;
    ctx.fillRect(fx1, fy1, fx2 - fx1, fy2 - fy1);
  }
  if (st.rim) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(fx1, fy1, fx2 - fx1, Math.max(1, 1.5 * e.s));
  }
}

/** The front rectangle of a box3 at depth z (to draw details onto it). */
export function frontRect(e: Eye, x1: number, y1: number, x2: number, y2: number, z: number): { x: number; y: number; w: number; h: number } {
  const [ax, ay] = project(e, x1, y1, z);
  const [bx, by] = project(e, x2, y2, z);
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

/** An upright cylinder (tank, trunk, silo): lit on the sun side, dark on the other, an elliptical top if seen from above. */
export function cylinder(ctx: CanvasRenderingContext2D, e: Eye, x1: number, y1: number, x2: number, y2: number, color: string): void {
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  const lit = tone(color, 0.25);
  const dark = tone(color, -0.4);
  g.addColorStop(0, e.light < 0 ? lit : dark);
  g.addColorStop(e.light < 0 ? 0.3 : 0.7, color);
  g.addColorStop(1, e.light < 0 ? dark : lit);
  const rx = (x2 - x1) / 2;
  const ry = Math.min(rx * 0.3, Math.abs(e.vy - y1) * 0.08 + 1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1, y2);
  ctx.ellipse(x1 + rx, y2, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x2, y1);
  ctx.closePath();
  ctx.fill();
  if (e.vy < y1) {
    ctx.fillStyle = tone(color, 0.15);
    ctx.beginPath();
    ctx.ellipse(x1 + rx, y1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A ball lit from the sun side and above. */
export function sphere(ctx: CanvasRenderingContext2D, e: Eye, cx: number, cy: number, rx: number, ry: number, color: string): void {
  const g = ctx.createRadialGradient(cx + e.light * rx * 0.35, cy - ry * 0.4, Math.min(rx, ry) * 0.1, cx, cy, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, tone(color, 0.3));
  g.addColorStop(0.55, color);
  g.addColorStop(1, tone(color, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A soft dark pool on the ground under something. */
export function contactShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha = 0.35): void {
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** Haze over everything drawn so far, thickest at y1 (toward the horizon), fading out by y0. */
export function haze(ctx: CanvasRenderingContext2D, w: number, y0: number, y1: number, rgb: string, alpha: number): void {
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, bottom - top);
}

/** Soft glow (screen space). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A hex or rgb() color's "r,g,b" (for haze). */
export function rgbOf(color: string): string {
  if (color.startsWith('rgb')) return color.replace(/rgba?\(|\)/g, '').split(',').slice(0, 3).join(',');
  let h = color.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Any "#rgb", "#rrggbb", "rgb()" or "rgba()" color as "#rrggbb" (alpha dropped), for tone() and blend(). */
export function toHex(color: string): string {
  if (color.startsWith('#')) return color;
  const [r, g, b] = rgbOf(color).split(',').map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))));
  return '#' + [r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('');
}

// The ten roster fighters in their dressed looks (ADR-0084; concept sheets in docs/art/retexture/), drawn on the
// stick-figure skeleton from figures.ts so every attack pose and hitbox still lines up. The player's slot, own or
// team color is each look's main piece, so fighters stay easy to tell apart. When the signature meter (ADR-0079)
// fills, it shows on the body. Local units around the body centre, y down, facing +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { PALETTE } from './config';
import type { FigurePose } from './figures';
import { drawDressedSeasonal } from './dressedSeasonal';

export interface Skeleton {
  H: number;
  lw: number;
  headR: number;
  headY: number;
  neckY: number;
  shoulderY: number;
  hipY: number;
  footY: number;
  legLen: number;
  shoulderW: number;
  hipW: number;
  airborne: boolean;
  /** Each leg as [hipX, hipY, kneeX, kneeY, footX, footY]; the first is the front leg. */
  legs: number[][];
  /** Each arm as [shoulderX, shoulderY, elbowX, elbowY, handX, handY]; the first is the front arm. */
  arms: number[][];
  hands: { x: number; y: number; angle: number }[];
  swordLength: number;
}

export const DRESSED: ReadonlySet<FighterId> = new Set<FighterId>([
  'brawler', 'blade', 'spark', 'titan', 'ninja', 'gunslinger', 'chef', 'ghost', 'yoyo', 'bard',
  // River and the Thanksgiving fighters (dressedSeasonal.ts).
  'river', 'turkey', 'pilgrim', 'firstlight',
]);

/** Fixed colors of each look; the slot color fills the main piece. */
const LOOK = {
  skin: '#f2c9a0',
  skinShade: '#d9a77a',
  gold: '#e8b23a',
  steel: '#c7ced6',
  denim: '#3f5f8f',
  brawler: { tights: '#1b1b1b', wrap: '#1b1b1b', mask: '#ffffff', fullEyes: '#ff3b1f' },
  blade: { pants: '#3d2a1c', boots: '#141414', shirt: '#f1e6cf', hat: '#141414', beard: '#3a2418' },
  spark: { beard: '#f4f4f4', staff: '#6b4226', sand: '#f0c050', glass: '#e8f4ff' },
  titan: { iron: '#7b828a', ironDark: '#555c64', rivet: '#c9ced3', hot: '#ffb000', rust: '#a65a2a' },
  ninja: { gi: '#26305a', wrap: '#e9e1cf', eyes: '#ffd23a', steel: '#c7ced6' },
  gunslinger: { pants: '#3d2a1c', hat: '#2a1a10', bandana: '#2a4a8a', belt: '#5a3418', bullet: '#c7a35a', hot: '#ffd23a' },
  chef: { jacket: '#fafafa', pants: '#333333', mustache: '#2a1a10', pan: '#2f3338', flame: '#ff9a1a' },
  ghost: { skin: '#d8fff0', hat: '#1a2a30', glow: '#7affc8' },
  yoyo: { cap: '#d9233a', shoes: '#fafafa', board: '#c8873a' },
  bard: { beanie: '#d97a2a', wood: '#d9a046', neck: '#6b4226', boots: '#6b4226' },
} as const;

/** A darker (k < 1) or lighter (k > 1) version of a #rrggbb color. */
export function shade(color: string, k: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = parseInt(color.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Stroke a limb: a dark outline, then the color on top. */
export function limb(ctx: CanvasRenderingContext2D, pts: readonly number[], w: number, color: string, from = 0): void {
  ctx.beginPath();
  ctx.moveTo(pts[from]!, pts[from + 1]!);
  for (let i = from + 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = w + 2.2;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, line = 1.4): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (line > 0) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = line;
    ctx.stroke();
  }
}

/** A soft glow: a few stacked translucent discs (cheaper than a gradient every frame). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, strength = 1): void {
  const a = ctx.globalAlpha;
  ctx.fillStyle = color;
  for (const [k, al] of [[1, 0.12], [0.7, 0.18], [0.45, 0.25]] as const) {
    ctx.globalAlpha = a * al * strength;
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = a;
}

export function fill(ctx: CanvasRenderingContext2D, color: string, line = 1.6): void {
  ctx.fillStyle = color;
  ctx.fill();
  if (line > 0) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = line;
    ctx.stroke();
  }
}

/** A torso: a four-sided shape from the shoulders to the hips. */
export function torso(ctx: CanvasRenderingContext2D, top: number, bottom: number, wTop: number, wBottom: number, color: string, dx = 0): void {
  ctx.beginPath();
  ctx.moveTo(-wTop + dx, top);
  ctx.lineTo(wTop + dx, top);
  ctx.lineTo(wBottom + dx, bottom);
  ctx.lineTo(-wBottom + dx, bottom);
  ctx.closePath();
  fill(ctx, color, 1.8);
}

/** A shoe at the end of a leg, pointing forward. */
export function shoe(ctx: CanvasRenderingContext2D, leg: readonly number[], w: number, color: string): void {
  const x = leg[4]!, y = leg[5]!;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.35, y, w * 0.85, w * 0.5, 0, 0, Math.PI * 2);
  fill(ctx, color, 1.3);
}

export function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: FigurePose, color: string = PALETTE.ink): void {
  ctx.fillStyle = color;
  if (pose.blink > 0.5) ctx.fillRect(x - r, y - 0.6, r * 2, 1.4);
  else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.25 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function note(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, 2.4 * s, 1.8 * s, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2.1 * s, y - 0.6 * s);
  ctx.lineTo(x + 2.1 * s, y - 8 * s);
  ctx.quadraticCurveTo(x + 5 * s, y - 6.5 * s, x + 4.6 * s, y - 3.5 * s);
  ctx.stroke();
}

export function drawDressed(ctx: CanvasRenderingContext2D, id: FighterId, pose: FigurePose, sk: Skeleton): void {
  const A = pose.color;
  const meter = Math.max(0, Math.min(1, pose.meter ?? 0));
  const full = pose.ready === true || meter >= 1;
  const { H, lw, headR: r, headY: hy, shoulderY: sy, hipY: hipY, legs, arms, hands } = sk;
  const legW = lw * 1.35;
  const armW = lw * 1.15;
  const front = { leg: legs[0], arm: arms[0], hand: hands[0] };
  const back = { leg: legs[1], arm: arms[1], hand: hands[1] };
  const t = pose.phase;
  const P = Math.PI;

  switch (id) {
    // ── Brawler: lucha libre. Mask, trunks, boots and cape in the slot color; at full KO meter the mask's eyes
    // burn red and the cape flares out.
    case 'brawler': {
      const L = LOOK.brawler;
      const flare = full ? 1.6 : 1;
      const wave = Math.sin(t * 0.4) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, sy - 1);
      ctx.quadraticCurveTo(-r * 1.6 * flare, hipY, -r * 1.3 * flare - 3 + wave, hipY + sk.legLen * 0.75);
      ctx.lineTo(r * 0.2 * flare - 4 + wave, hipY + sk.legLen * 0.8);
      ctx.lineTo(r * 0.7, sy);
      ctx.closePath();
      fill(ctx, shade(A, 0.75), 1.6);
      if (back.leg) { limb(ctx, back.leg, legW, L.tights); limb(ctx, back.leg, legW + 0.6, A, 2); shoe(ctx, back.leg, legW, A); }
      if (back.arm) { limb(ctx, back.arm, armW, LOOK.skin); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.75, L.wrap); }
      torso(ctx, sy - 1, hipY + 1, r * 0.95, r * 0.75, LOOK.skin);
      ctx.beginPath();
      ctx.moveTo(-r * 0.78, hipY - 2);
      ctx.lineTo(r * 0.78, hipY - 2);
      ctx.lineTo(r * 0.85, hipY + 4);
      ctx.lineTo(-r * 0.85, hipY + 4);
      ctx.closePath();
      fill(ctx, A, 1.4);
      ctx.fillStyle = PALETTE.white;
      ctx.fillRect(-r * 0.78, hipY - 2.6, r * 1.56, 1.4);
      if (front.leg) { limb(ctx, front.leg, legW, L.tights); limb(ctx, front.leg, legW + 0.6, A, 2); shoe(ctx, front.leg, legW, A); }
      if (front.arm) {
        limb(ctx, front.arm, armW, LOOK.skin);
        const hx = front.arm[4]!, hy2 = front.arm[5]!;
        if (full || (pose.rage ?? 0) >= 1) glow(ctx, hx, hy2, armW * 3.4, '#ff3b1f');
        disc(ctx, hx, hy2, armW * 0.8, L.wrap);
      }
      // Masked head.
      if (full) glow(ctx, 0, hy, r * 2.4, '#ff3b1f', 0.8);
      disc(ctx, 0, hy, r, A, 1.8);
      // White flame crest and eye holes.
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, hy - r * 0.55);
      ctx.quadraticCurveTo(-r * 0.4, hy - r * 1.35, -r * 0.1, hy - r * 0.75);
      ctx.quadraticCurveTo(r * 0.15, hy - r * 1.45, r * 0.35, hy - r * 0.75);
      ctx.quadraticCurveTo(r * 0.6, hy - r * 1.2, r * 0.75, hy - r * 0.5);
      ctx.quadraticCurveTo(0, hy - r * 0.75, -r * 0.7, hy - r * 0.55);
      fill(ctx, L.mask, 1);
      ctx.beginPath();
      ctx.ellipse(r * 0.42, hy - r * 0.08, r * 0.36, r * 0.27, -0.2, 0, Math.PI * 2);
      fill(ctx, L.mask, 1);
      eye(ctx, r * 0.5, hy - r * 0.08, Math.max(1, r * 0.15), pose, full ? L.fullEyes : PALETTE.ink);
      ctx.beginPath();
      ctx.ellipse(r * 0.5, hy + r * 0.5, r * 0.22, r * 0.14, 0, 0, Math.PI * 2);
      fill(ctx, LOOK.skin, 0.8);
      break;
    }

    // ── Blade: pirate captain. Long coat in the slot color, tricorn, eyepatch, gold earring, a curved cutlass that
    // glints when the edge is sharp.
    case 'blade': {
      const L = LOOK.blade;
      if (back.leg) { limb(ctx, back.leg, legW, L.pants); limb(ctx, back.leg, legW + 1, L.boots, 2); shoe(ctx, back.leg, legW, L.boots); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.8)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      // Coat tails behind the front leg.
      const tail = hipY + sk.legLen * 0.55;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, hipY - 2);
      ctx.lineTo(-r * 1.2 + Math.sin(t * 0.35) * 1.2, tail);
      ctx.lineTo(-r * 0.1, tail - 2);
      ctx.lineTo(r * 0.2, hipY);
      ctx.closePath();
      fill(ctx, shade(A, 0.8), 1.4);
      torso(ctx, sy - 1, hipY + 2, r * 0.95, r * 0.85, A);
      ctx.fillStyle = L.shirt;
      ctx.fillRect(-r * 0.25, sy, r * 0.55, hipY - sy - 2);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(-r * 0.9, hipY - 4, r * 1.8, 2.4);
      ctx.fillStyle = LOOK.gold;
      ctx.fillRect(-r * 0.15, hipY - 4.4, r * 0.4, 3.2);
      if (front.leg) { limb(ctx, front.leg, legW, L.pants); limb(ctx, front.leg, legW + 1, L.boots, 2); shoe(ctx, front.leg, legW, L.boots); }
      // The cutlass, behind the front arm: a curved blade from the hand.
      const h = front.hand;
      if (h) {
        const fx = Math.sin(h.angle), fy = Math.cos(h.angle);
        const nx = fy, ny = -fx; // Perpendicular, toward the blade's back.
        const len = sk.swordLength;
        const tipX = h.x + fx * len + nx * 5, tipY = h.y + fy * len + ny * 5;
        ctx.beginPath();
        ctx.moveTo(h.x + nx * 1.2, h.y + ny * 1.2);
        ctx.quadraticCurveTo(h.x + fx * len * 0.6 + nx * 4.5, h.y + fy * len * 0.6 + ny * 4.5, tipX, tipY);
        ctx.quadraticCurveTo(h.x + fx * len * 0.55 - nx * 1.5, h.y + fy * len * 0.55 - ny * 1.5, h.x - nx * 2.2, h.y - ny * 2.2);
        ctx.closePath();
        fill(ctx, full ? '#ffffff' : LOOK.steel, 1.2);
        // Gold hand guard.
        ctx.strokeStyle = LOOK.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 3.2, Math.atan2(fy, fx) + 0.6, Math.atan2(fy, fx) + P * 1.4);
        ctx.stroke();
        if (full) {
          const tw = 0.6 + 0.4 * Math.sin(t * 0.5);
          glow(ctx, tipX, tipY, 9, '#ffffff', 0.8);
          star(ctx, tipX, tipY, 5 + tw * 3, '#ffffff');
          star(ctx, h.x + fx * len * 0.55 + nx * 3, h.y + fy * len * 0.55 + ny * 3, 2 + tw * 2, '#ffffff');
        }
      }
      if (front.arm) { limb(ctx, front.arm, armW, A); disc(ctx, front.arm[4]!, front.arm[5]!, armW * 0.6, LOOK.skin); }
      // Head: beard, eyepatch, earring, tricorn.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, hy + r * 0.1);
      ctx.quadraticCurveTo(-r * 0.6, hy + r * 1.45, r * 0.4, hy + r * 1.25);
      ctx.quadraticCurveTo(r * 1.0, hy + r * 0.9, r * 0.95, hy + r * 0.2);
      ctx.quadraticCurveTo(r * 0.3, hy + r * 0.55, -r * 0.95, hy + r * 0.1);
      fill(ctx, L.beard, 0);
      eye(ctx, r * 0.2, hy - r * 0.1, Math.max(1, r * 0.14), pose);
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.ellipse(r * 0.62, hy - r * 0.1, r * 0.25, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, hy - r * 0.45);
      ctx.lineTo(r * 0.95, hy - r * 0.05);
      ctx.stroke();
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-r * 0.35, hy + r * 0.45, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      if (full) star(ctx, -r * 0.35, hy + r * 0.7, 2.5, '#fff6c8');
      const capY = hy - r * 0.55;
      ctx.beginPath();
      ctx.moveTo(-r * 1.75, capY + r * 0.1);
      ctx.quadraticCurveTo(0, capY + r * 0.55, r * 1.75, capY + r * 0.1);
      ctx.quadraticCurveTo(r * 1.0, capY - r * 0.35, r * 0.75, capY - r * 1.2);
      ctx.quadraticCurveTo(0, capY - r * 0.9, -r * 0.75, capY - r * 1.2);
      ctx.quadraticCurveTo(-r * 1.0, capY - r * 0.35, -r * 1.75, capY + r * 0.1);
      fill(ctx, L.hat, 1.2);
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 1.55, capY + r * 0.1);
      ctx.quadraticCurveTo(0, capY + r * 0.45, r * 1.55, capY + r * 0.1);
      ctx.stroke();
      disc(ctx, 0, capY - r * 0.45, r * 0.22, PALETTE.white, 0);
      break;
    }

    // ── Spark: hourglass sage. Robe and star hat in the slot color, a long white beard, a staff topped with an
    // hourglass whose sand is the mana: it drains as he casts and glows when full.
    case 'spark': {
      const L = LOOK.spark;
      const dark = shade(A, 0.7);
      // Staff in the back hand, behind everything.
      const sh = back.hand;
      if (sh) {
        const sx = sh.x, syy = sh.y;
        const top = syy - H * 0.55;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(sx, syy + H * 0.3); ctx.lineTo(sx, top); ctx.stroke();
        ctx.strokeStyle = L.staff;
        ctx.lineWidth = 2;
        ctx.stroke();
        const gx = sx, gy = top - 6, gw = 4.2, gh = 6;
        if (full || meter > 0.6) glow(ctx, gx, gy, 14, '#ffe680', full ? 1 : 0.5);
        ctx.fillStyle = LOOK.gold;
        ctx.fillRect(gx - gw - 1, gy - gh - 1.6, gw * 2 + 2, 1.8);
        ctx.fillRect(gx - gw - 1, gy + gh - 0.2, gw * 2 + 2, 1.8);
        ctx.beginPath();
        ctx.moveTo(gx - gw, gy - gh); ctx.lineTo(gx + gw, gy - gh); ctx.lineTo(gx + 0.8, gy);
        ctx.lineTo(gx + gw, gy + gh); ctx.lineTo(gx - gw, gy + gh); ctx.lineTo(gx - 0.8, gy);
        ctx.closePath();
        fill(ctx, L.glass, 1);
        // Sand: the top bulb holds what's left of the mana, the rest has fallen.
        const k = meter;
        ctx.fillStyle = L.sand;
        if (k > 0.02) {
          const ty = gy - gh * k;
          ctx.beginPath();
          ctx.moveTo(gx - gw * k, ty); ctx.lineTo(gx + gw * k, ty); ctx.lineTo(gx + 0.6, gy - 0.4); ctx.lineTo(gx - 0.6, gy - 0.4);
          ctx.closePath(); ctx.fill();
        }
        const b = 1 - k;
        if (b > 0.02) {
          const by = gy + gh - gh * b * 0.9;
          ctx.beginPath();
          ctx.moveTo(gx - gw * 0.95, gy + gh - 0.4); ctx.lineTo(gx + gw * 0.95, gy + gh - 0.4);
          ctx.lineTo(gx + gw * 0.95 * (1 - b * 0.7), by); ctx.lineTo(gx - gw * 0.95 * (1 - b * 0.7), by);
          ctx.closePath(); ctx.fill();
        }
        if (full) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2.5, 2]);
          ctx.beginPath();
          ctx.arc(gx, gy, 10, t * 0.08, t * 0.08 + P * 1.5);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (back.leg) { limb(ctx, back.leg, legW * 0.9, dark); shoe(ctx, back.leg, legW, PALETTE.ink); }
      if (front.leg) { limb(ctx, front.leg, legW * 0.9, dark); shoe(ctx, front.leg, legW, PALETTE.ink); }
      if (back.arm) { limb(ctx, back.arm, armW * 1.15, dark); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      // Robe down to the shins, flaring with the legs.
      const hem = hipY + sk.legLen * 0.72;
      const spread = Math.abs((front.leg?.[4] ?? 0) - (back.leg?.[4] ?? 0)) * 0.45;
      torso(ctx, sy - 1, hem, r * 0.75, r * 1.25 + spread, A);
      ctx.fillStyle = LOOK.gold;
      ctx.fillRect(-r * 1.2 - spread, hem - 2.5, (r * 1.2 + spread) * 2, 1.6);
      for (const dx of [-0.4, 0.1, 0.6]) star(ctx, r * dx, hipY + r * 0.5 + dx * 4, 1.8, LOOK.gold);
      if (front.arm) {
        limb(ctx, front.arm, armW * 1.15, A);
        const hx = front.arm[4]!, hy2 = front.arm[5]!;
        glow(ctx, hx, hy2, armW * 2.4, A, 0.7);
        disc(ctx, hx, hy2, armW * 0.6, LOOK.skin);
      }
      // Head, long beard, star hat.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, hy + r * 0.3);
      ctx.quadraticCurveTo(-r * 0.3, hy + r * 2.7, r * 0.45, hy + r * 2.9);
      ctx.quadraticCurveTo(r * 1.0, hy + r * 1.6, r * 0.95, hy + r * 0.3);
      ctx.quadraticCurveTo(r * 0.3, hy + r * 0.7, -r * 0.6, hy + r * 0.3);
      fill(ctx, L.beard, 1);
      eye(ctx, r * 0.45, hy - r * 0.1, Math.max(1, r * 0.15), pose);
      ctx.strokeStyle = L.beard;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(r * 0.15, hy - r * 0.42); ctx.lineTo(r * 0.8, hy - r * 0.32); ctx.stroke();
      const capY = hy - r * 0.6;
      ctx.beginPath();
      ctx.ellipse(0, capY, r * 1.6, r * 0.32, 0, 0, Math.PI * 2);
      fill(ctx, dark, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, capY);
      ctx.lineTo(-r * 0.5, capY - r * 2.2);
      ctx.lineTo(-r * 1.0, capY - r * 2.6);
      ctx.lineTo(-r * 0.15, capY - r * 2.4);
      ctx.lineTo(r * 0.85, capY);
      ctx.closePath();
      fill(ctx, dark, 1.2);
      star(ctx, -r * 0.2, capY - r * 0.9, 2.2, LOOK.gold);
      star(ctx, r * 0.25, capY - r * 0.4, 1.6, LOOK.gold);
      break;
    }

    // ── Titan: an original iron giant. A round riveted boiler body with a furnace that heats with payback, a dome
    // head with a slit visor, shoulder smokestacks. The slot color is the belly band and the visor.
    case 'titan': {
      const L = LOOK.titan;
      const tLeg = legW * 0.85, tArm = armW * 0.75;
      const heat = full ? 1 : meter;
      const bodyR = H * 0.3;
      const by = (sy + hipY) / 2 + 2;
      if (back.leg) { limb(ctx, back.leg, tLeg, L.ironDark); shoe(ctx, back.leg, tLeg, L.iron); }
      if (back.arm) { limb(ctx, back.arm, tArm, L.ironDark); disc(ctx, back.arm[4]!, back.arm[5]!, tArm * 0.9, L.iron); }
      // Smokestacks, with steam when payback is ready.
      for (const dx of [-0.55, 0.45]) {
        ctx.beginPath();
        ctx.rect(bodyR * dx - 2.5, sy - bodyR * 0.55, 5, bodyR * 0.5);
        fill(ctx, L.ironDark, 1.2);
        if (full) for (let i = 0; i < 3; i++) {
          const k = ((t * 0.05 + i / 3) % 1);
          ctx.globalAlpha = 0.7 * (1 - k);
          disc(ctx, bodyR * dx + k * 4, sy - bodyR * 0.6 - k * 16, 3 + k * 5, '#ffffff', 0);
          ctx.globalAlpha = 1;
        }
      }
      if (heat > 0.3) glow(ctx, 0, by, bodyR * 2, '#ff9a1a', heat * 0.9);
      ctx.beginPath();
      ctx.ellipse(0, by, bodyR, bodyR * 1.02, 0, 0, Math.PI * 2);
      fill(ctx, L.iron, 2);
      // Belly band in the slot color, and rivets.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, by, bodyR, bodyR * 1.02, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = A;
      ctx.fillRect(-bodyR, by + bodyR * 0.42, bodyR * 2, bodyR * 0.22);
      ctx.fillStyle = L.rust;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(bodyR * 0.45, by - bodyR * 0.55, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      const rivet = heat >= 1 ? '#ffb347' : L.rivet;
      for (let i = -3; i <= 3; i++) {
        disc(ctx, i * bodyR * 0.26, by - bodyR * 0.2 + Math.abs(i) * 0.6, 1.1, rivet, 0);
      }
      // The furnace porthole.
      const pr = bodyR * 0.32;
      const fur = heat >= 1 ? L.hot : heat > 0 ? shade('#ff6a00', 0.3 + heat * 0.7) : '#2a2a2a';
      disc(ctx, bodyR * 0.25, by + bodyR * 0.1, pr, fur, 2);
      if (heat > 0.1) {
        ctx.fillStyle = '#fff27a';
        ctx.globalAlpha = heat;
        ctx.beginPath();
        ctx.moveTo(bodyR * 0.25 - pr * 0.5, by + bodyR * 0.1 + pr * 0.5);
        ctx.quadraticCurveTo(bodyR * 0.25, by + bodyR * 0.1 - pr * (0.4 + 0.3 * Math.sin(t * 0.6)), bodyR * 0.25 + pr * 0.5, by + bodyR * 0.1 + pr * 0.5);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (front.leg) { limb(ctx, front.leg, tLeg, L.ironDark); shoe(ctx, front.leg, tLeg, L.iron); }
      if (front.arm) {
        disc(ctx, front.arm[0]!, front.arm[1]!, tArm * 1.1, L.iron);
        limb(ctx, front.arm, tArm, L.ironDark);
        const hx = front.arm[4]!, hy2 = front.arm[5]!;
        ctx.beginPath();
        ctx.roundRect(hx - tArm, hy2 - tArm * 0.85, tArm * 2, tArm * 1.7, tArm * 0.7);
        fill(ctx, L.iron, 1.6);
      }
      // Dome head with a slit visor.
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, hy + r * 0.8);
      ctx.lineTo(-r * 1.05, hy - r * 0.1);
      ctx.quadraticCurveTo(0, hy - r * 1.55, r * 1.05, hy - r * 0.1);
      ctx.lineTo(r * 1.05, hy + r * 0.8);
      ctx.closePath();
      fill(ctx, L.iron, 1.8);
      ctx.fillStyle = full ? '#ffe680' : pose.blink > 0.5 ? PALETTE.ink : A;
      ctx.beginPath();
      ctx.roundRect(-r * 0.35, hy - r * 0.05, r * 1.25, r * 0.32, r * 0.16);
      ctx.fill();
      disc(ctx, 0, hy - r * 0.95, 1.4, L.rivet, 0.8);
      break;
    }

    // ── Ninja: classic night indigo. Hood with an eye slit, headband, belt and tails in the slot color, a sword on
    // the back and a shuriken in hand; eyes glow gold when marks are full.
    case 'ninja': {
      const L = LOOK.ninja;
      // Sword on the back.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(-r * 1.1, hipY - 1); ctx.lineTo(r * 0.6, sy - r * 1.1); ctx.stroke();
      ctx.strokeStyle = '#3a2418';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = LOOK.gold;
      ctx.fillRect(r * 0.2, sy - r * 0.95, 3, 2);
      if (back.leg) { limb(ctx, back.leg, legW, shade(L.gi, 0.85)); shoe(ctx, back.leg, legW * 0.9, PALETTE.ink); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(L.gi, 0.85)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, L.gi); }
      torso(ctx, sy - 1, hipY + 2, r * 0.85, r * 0.75, L.gi);
      ctx.strokeStyle = shade(L.gi, 1.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, sy); ctx.lineTo(r * 0.15, hipY - 3); ctx.moveTo(r * 0.7, sy); ctx.lineTo(-r * 0.15, hipY - 3); ctx.stroke();
      ctx.fillStyle = A;
      ctx.fillRect(-r * 0.8, hipY - 3, r * 1.6, 3);
      if (front.leg) {
        limb(ctx, front.leg, legW, L.gi);
        ctx.strokeStyle = L.wrap; ctx.lineWidth = 0.9;
        const [, , kx, ky, fx, fy] = front.leg;
        for (const k of [0.3, 0.55, 0.8]) { const x = kx! + (fx! - kx!) * k, y = ky! + (fy! - ky!) * k; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y - 0.6); ctx.stroke(); }
        shoe(ctx, front.leg, legW * 0.9, PALETTE.ink);
      }
      if (front.arm) {
        limb(ctx, front.arm, armW, L.gi);
        const hx = front.arm[4]!, hy2 = front.arm[5]!;
        disc(ctx, hx, hy2, armW * 0.6, L.gi);
        if (!pose.attack) {
          ctx.save();
          ctx.translate(hx + 2.5, hy2 - 2.5);
          ctx.rotate(t * 0.05);
          star(ctx, 0, 0, 3.6, L.steel);
          ctx.restore();
        }
      }
      // Hood, eye slit, headband with tails.
      disc(ctx, 0, hy, r, L.gi, 1.8);
      ctx.fillStyle = LOOK.skin;
      ctx.beginPath();
      ctx.roundRect(-r * 0.05, hy - r * 0.35, r * 1.0, r * 0.48, r * 0.22);
      ctx.fill();
      const ec = full ? L.eyes : PALETTE.ink;
      if (full) glow(ctx, r * 0.55, hy - r * 0.1, r * 1.3, L.eyes, 0.8);
      eye(ctx, r * 0.55, hy - r * 0.1, Math.max(1, r * 0.16), pose, ec);
      ctx.fillStyle = A;
      ctx.fillRect(-r * 1.02, hy - r * 0.75, r * 2.04, r * 0.3);
      const flap = Math.sin(t * 0.5) * 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, hy - r * 0.65);
      ctx.lineTo(-r * 2.3, hy - r * 0.3 + flap);
      ctx.lineTo(-r * 2.0, hy + flap * 0.5);
      ctx.lineTo(-r * 2.3, hy + r * 0.35 + flap);
      ctx.lineTo(-r * 0.9, hy - r * 0.4);
      ctx.closePath();
      ctx.fill();
      disc(ctx, 0, hy - r * 0.6, 1.2, LOOK.gold, 0);
      break;
    }

    // ── Gunslinger: masked bandit. Poncho in the slot color, flat black hat, bandana over the face, a bandolier
    // whose bullets light up with the hot streak, and the revolver.
    case 'gunslinger': {
      const L = LOOK.gunslinger;
      if (back.leg) { limb(ctx, back.leg, legW, shade(L.pants, 0.85)); shoe(ctx, back.leg, legW, PALETTE.ink); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.75)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      if (front.leg) { limb(ctx, front.leg, legW, L.pants); shoe(ctx, front.leg, legW, PALETTE.ink); }
      // Poncho: wide triangle from the neck, fringed.
      const pw = r * 1.75;
      const pb = hipY + 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, sy - 2);
      ctx.lineTo(r * 0.6, sy - 2);
      ctx.lineTo(pw, pb);
      ctx.lineTo(-pw, pb);
      ctx.closePath();
      fill(ctx, A, 1.8);
      ctx.strokeStyle = '#ffd23a';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 1.5]);
      ctx.beginPath(); ctx.moveTo(-pw * 0.8, pb - 3); ctx.lineTo(pw * 0.8, pb - 3); ctx.stroke();
      ctx.setLineDash([]);
      // Bandolier with six bullets; lit ones show the streak.
      const lit = Math.round(meter * 6);
      ctx.strokeStyle = L.belt;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-r * 0.55, sy); ctx.lineTo(r * 1.2, pb - 1); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        const x = -r * 0.45 + k * r * 1.55, y = sy + 1 + k * (pb - sy - 3);
        const on = i < lit;
        if (on && full) glow(ctx, x, y, 4, L.hot, 0.8);
        ctx.fillStyle = on ? (full && i === 5 ? LOOK.gold : full ? L.hot : L.bullet) : '#5a5a5a';
        ctx.fillRect(x - 0.8, y - 1.6, 1.6, 3.2);
      }
      if (front.arm) {
        limb(ctx, front.arm, armW, A);
        const h = front.hand!;
        const fx = Math.sin(h.angle), fy = Math.cos(h.angle);
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + fx * 11, h.y + fy * 11); ctx.stroke();
        ctx.strokeStyle = full ? LOOK.gold : '#8d939a';
        ctx.lineWidth = 2;
        ctx.stroke();
        disc(ctx, h.x, h.y, armW * 0.6, LOOK.skin);
      }
      // Head: bandana up to the eyes, flat wide hat.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, hy + r * 0.05);
      ctx.lineTo(r * 1.0, hy + r * 0.05);
      ctx.lineTo(r * 0.8, hy + r * 0.85);
      ctx.lineTo(r * 0.2, hy + r * 1.35);
      ctx.lineTo(-r * 0.8, hy + r * 0.7);
      ctx.closePath();
      fill(ctx, L.bandana, 1);
      disc(ctx, r * 0.5, hy + r * 0.5, 0.8, '#ffffff', 0);
      disc(ctx, -r * 0.1, hy + r * 0.7, 0.8, '#ffffff', 0);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(r * 0.15, hy - r * 0.48); ctx.lineTo(r * 0.75, hy - r * 0.3); ctx.stroke();
      eye(ctx, r * 0.5, hy - r * 0.15, Math.max(1, r * 0.14), pose, full ? L.hot : PALETTE.ink);
      const capY = hy - r * 0.6;
      ctx.beginPath();
      ctx.ellipse(0, capY, r * 2.0, r * 0.3, 0, 0, Math.PI * 2);
      fill(ctx, L.hat, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, capY);
      ctx.lineTo(-r * 0.75, capY - r * 0.8);
      ctx.lineTo(r * 0.75, capY - r * 0.8);
      ctx.lineTo(r * 0.85, capY);
      ctx.closePath();
      fill(ctx, L.hat, 1.2);
      ctx.fillStyle = L.bullet;
      ctx.fillRect(-r * 0.8, capY - r * 0.3, r * 1.6, r * 0.18);
      break;
    }

    // ── Chef: head chef. White jacket with a neckerchief and toque band in the slot color, a big mustache, the
    // frying pan; a full pantry sets the pan alight.
    case 'chef': {
      const L = LOOK.chef;
      if (back.leg) { limb(ctx, back.leg, legW, shade(L.pants, 0.85)); shoe(ctx, back.leg, legW, PALETTE.ink); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(L.jacket, 0.85)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      torso(ctx, sy - 1, hipY + 3, r * 1.0, r * 0.95, L.jacket);
      for (const y of [0.25, 0.5, 0.75]) {
        const yy = sy + (hipY - sy) * y;
        disc(ctx, -r * 0.05, yy, 0.9, '#333', 0);
        disc(ctx, r * 0.55, yy, 0.9, '#333', 0);
      }
      // Apron.
      ctx.beginPath();
      ctx.rect(-r * 0.9, hipY - 2, r * 1.8, sk.legLen * 0.35);
      fill(ctx, L.jacket, 1.2);
      // Neckerchief.
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, sy - 1);
      ctx.lineTo(r * 0.7, sy - 1);
      ctx.lineTo(r * 0.15, sy + r * 0.6);
      ctx.closePath();
      fill(ctx, A, 1);
      if (front.leg) { limb(ctx, front.leg, legW, L.pants); shoe(ctx, front.leg, legW, PALETTE.ink); }
      if (front.arm) {
        limb(ctx, front.arm, armW, L.jacket);
        const h = front.hand!;
        const fx = Math.sin(h.angle), fy = Math.cos(h.angle);
        const px = h.x + fx * 13, py = h.y + fy * 13;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(px, py); ctx.stroke();
        const cx = px + fx * 6, cy = py + fy * 6;
        if (full) {
          glow(ctx, cx, cy - 5, 14, L.flame, 0.9);
          const fl = Math.sin(t * 0.7) * 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy - 1);
          ctx.quadraticCurveTo(cx - 6, cy - 9 + fl, cx - 2, cy - 13);
          ctx.quadraticCurveTo(cx - 1, cy - 8, cx + 1, cy - 9);
          ctx.quadraticCurveTo(cx + 2, cy - 15 - fl, cx + 4, cy - 11);
          ctx.quadraticCurveTo(cx + 7, cy - 7, cx + 6, cy - 1);
          ctx.closePath();
          fill(ctx, L.flame, 1);
        }
        ctx.beginPath();
        ctx.ellipse(cx, cy, 8, 8, 0, 0, Math.PI * 2);
        fill(ctx, L.pan, 1.2);
        disc(ctx, h.x, h.y, armW * 0.6, LOOK.skin);
      }
      // Head: big mustache, tall toque.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      eye(ctx, r * 0.45, hy - r * 0.15, Math.max(1, r * 0.15), pose);
      ctx.beginPath();
      ctx.moveTo(r * 0.45, hy + r * 0.25);
      ctx.quadraticCurveTo(-r * 0.2, hy + r * 0.05, -r * 0.35, hy + r * 0.55);
      ctx.quadraticCurveTo(r * 0.2, hy + r * 0.65, r * 0.45, hy + r * 0.4);
      ctx.quadraticCurveTo(r * 0.9, hy + r * 0.65, r * 1.25, hy + r * 0.45);
      ctx.quadraticCurveTo(r * 1.0, hy + r * 0.05, r * 0.45, hy + r * 0.25);
      fill(ctx, L.mustache, 0);
      const capY = hy - r * 0.75;
      ctx.beginPath();
      ctx.rect(-r * 0.8, capY - r * 0.35, r * 1.6, r * 0.55);
      fill(ctx, L.jacket, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, capY - r * 0.3);
      ctx.quadraticCurveTo(-r * 1.4, capY - r * 1.2, -r * 0.6, capY - r * 1.75);
      ctx.quadraticCurveTo(-r * 0.2, capY - r * 2.3, r * 0.2, capY - r * 1.8);
      ctx.quadraticCurveTo(r * 0.7, capY - r * 2.2, r * 0.95, capY - r * 1.5);
      ctx.quadraticCurveTo(r * 1.4, capY - r * 0.9, r * 0.8, capY - r * 0.3);
      ctx.closePath();
      fill(ctx, L.jacket, 1.2);
      ctx.fillStyle = A;
      ctx.fillRect(-r * 0.8, capY - r * 0.05, r * 1.6, r * 0.25);
      break;
    }

    // ── Ghost: phantom gentleman. See-through, a coat in the slot color that trails off into a wisp (no legs),
    // top hat and monocle, a cane; at full haunt the monocle eye glows and an aura surrounds him.
    case 'ghost': {
      const L = LOOK.ghost;
      const a0 = ctx.globalAlpha;
      if (full) glow(ctx, 0, (sy + hipY) / 2, H * 0.7, L.glow, 0.9);
      ctx.globalAlpha = a0 * 0.82;
      const ch = back.hand;
      if (ch) {
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(ch.x, ch.y); ctx.lineTo(ch.x - 2, ch.y + H * 0.45); ctx.stroke();
        disc(ctx, ch.x, ch.y - 1, 1.6, LOOK.gold, 0);
      }
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.65)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, L.skin); }
      // Coat body trailing into a wisp.
      const sway = Math.sin(t * 0.35) * 3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, sy - 1);
      ctx.lineTo(r * 0.9, sy - 1);
      ctx.lineTo(r * 1.1, hipY + 4);
      ctx.quadraticCurveTo(r * 0.6, sk.footY - 2, -r * 0.6 + sway, sk.footY + 2);
      ctx.quadraticCurveTo(r * 0.0 + sway * 0.5, hipY + 8, -r * 1.1, hipY + 4);
      ctx.closePath();
      fill(ctx, shade(A, 0.7), 1.6);
      // Shirt front and cravat.
      ctx.beginPath();
      ctx.moveTo(-r * 0.25, sy - 1); ctx.lineTo(r * 0.45, sy - 1); ctx.lineTo(r * 0.1, sy + r * 1.1);
      ctx.closePath();
      fill(ctx, '#e9fff6', 0.8);
      disc(ctx, r * 0.1, sy + 1, 1.4, A, 0.6);
      if (front.arm) { limb(ctx, front.arm, armW, shade(A, 0.8)); disc(ctx, front.arm[4]!, front.arm[5]!, armW * 0.6, L.skin); }
      // Head: pale face, monocle, mustache, top hat.
      disc(ctx, 0, hy, r, L.skin, 1.8);
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(r * 0.5, hy - r * 0.1, r * 0.33, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.5, hy + r * 0.23); ctx.quadraticCurveTo(r * 0.7, hy + r * 0.9, r * 0.3, hy + r * 1.3); ctx.stroke();
      if (full) glow(ctx, r * 0.5, hy - r * 0.1, r * 1.2, L.glow, 1);
      eye(ctx, r * 0.5, hy - r * 0.1, Math.max(1, r * 0.15), pose, full ? L.glow : PALETTE.ink);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(r * 0.1, hy + r * 0.4); ctx.quadraticCurveTo(r * 0.45, hy + r * 0.2, r * 0.95, hy + r * 0.4); ctx.stroke();
      const capY = hy - r * 0.7;
      ctx.beginPath();
      ctx.ellipse(0, capY, r * 1.35, r * 0.24, 0, 0, Math.PI * 2);
      fill(ctx, L.hat, 1.1);
      ctx.beginPath();
      ctx.rect(-r * 0.75, capY - r * 1.35, r * 1.5, r * 1.35);
      fill(ctx, L.hat, 1.1);
      ctx.fillStyle = A;
      ctx.fillRect(-r * 0.75, capY - r * 0.45, r * 1.5, r * 0.3);
      ctx.globalAlpha = a0;
      break;
    }

    // ── Yo-yo Kid: skater kid. Hoodie in the slot color, backwards cap, jeans, skateboard on the back; a live
    // trick combo gives the yo-yo a rainbow trail.
    case 'yoyo': {
      const L = LOOK.yoyo;
      // Skateboard on the back.
      ctx.save();
      ctx.translate(-r * 0.95, (sy + hipY) / 2);
      ctx.rotate(-0.25);
      ctx.beginPath();
      ctx.roundRect(-2.2, -H * 0.32, 4.4, H * 0.62, 2.2);
      fill(ctx, L.board, 1.2);
      disc(ctx, -2.6, -H * 0.24, 1.3, '#555', 0.6);
      disc(ctx, -2.6, H * 0.22, 1.3, '#555', 0.6);
      ctx.restore();
      if (back.leg) { limb(ctx, back.leg, legW, shade(LOOK.denim, 0.85)); shoe(ctx, back.leg, legW, L.shoes); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.75)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      torso(ctx, sy - 1, hipY + 3, r * 0.75, r * 0.85, A);
      ctx.beginPath();
      ctx.rect(-r * 0.4, hipY - r * 0.55, r * 0.95, r * 0.45);
      fill(ctx, shade(A, 0.8), 0.9);
      ctx.strokeStyle = '#fafafa';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(r * 0.1, sy); ctx.lineTo(r * 0.0, sy + r * 0.9); ctx.moveTo(r * 0.4, sy); ctx.lineTo(r * 0.5, sy + r * 0.9); ctx.stroke();
      if (front.leg) { limb(ctx, front.leg, legW, LOOK.denim); shoe(ctx, front.leg, legW, L.shoes); }
      if (front.arm) {
        limb(ctx, front.arm, armW, A);
        const h = front.hand!;
        const fx = Math.sin(h.angle), fy = Math.cos(h.angle);
        const out = pose.attack ? 6 + (pose.strike ?? 0) * 34 : 12;
        const yx = pose.attack ? h.x + fx * out : h.x;
        const yy = pose.attack ? h.y + fy * out : h.y + out;
        if (meter > 0.2) {
          const rainbow = ['#ff3b1f', '#ff9a1a', '#ffd23a', '#7dff6a', '#38e8ff', '#c86bff'];
          for (let i = 0; i < 6; i++) {
            const k = (i + 1) / 7;
            const tx = h.x + (yx - h.x) * k - fy * Math.sin(k * P) * 6;
            const ty = h.y + (yy - h.y) * k + fx * Math.sin(k * P) * 6;
            ctx.globalAlpha = 0.25 + 0.6 * k * Math.min(1, meter * 1.5);
            disc(ctx, tx, ty, 1.8 + k * 1.6, rainbow[i]!, 0);
          }
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(yx, yy); ctx.stroke();
        if (full) glow(ctx, yx, yy, 10, '#ffd23a', 0.9);
        disc(ctx, yx, yy, 4.5, L.cap, 1.4);
        ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(yx - 4.5, yy); ctx.lineTo(yx + 4.5, yy); ctx.stroke();
        disc(ctx, yx, yy, 1.3, '#ffffff', 0.6);
        disc(ctx, h.x, h.y, armW * 0.6, LOOK.skin);
      }
      // Head: big grin when the combo's on, backwards cap.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      eye(ctx, r * 0.45, hy - r * 0.05, Math.max(1, r * 0.17), pose);
      ctx.fillStyle = '#f0a0a0';
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(r * 0.2, hy + r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(r * 0.45, hy + r * 0.3, r * (meter > 0.2 ? 0.32 : 0.22), 0.2, P - 0.6);
      ctx.stroke();
      const capY = hy - r * 0.2;
      ctx.beginPath();
      ctx.arc(0, capY, r * 1.0, P, 0);
      ctx.closePath();
      fill(ctx, L.cap, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, capY - r * 0.1);
      ctx.quadraticCurveTo(-r * 1.9, capY - r * 0.05, -r * 2.0, capY + r * 0.25);
      ctx.lineTo(-r * 0.9, capY + r * 0.15);
      ctx.closePath();
      fill(ctx, L.cap, 1.1);
      break;
    }

    // ── Bard: street busker. Flannel shirt in the slot color, beanie, jeans, acoustic guitar across the body;
    // notes rise as the groove builds and swirl at full groove.
    case 'bard': {
      const L = LOOK.bard;
      if (back.leg) { limb(ctx, back.leg, legW, shade(LOOK.denim, 0.85)); shoe(ctx, back.leg, legW, L.boots); }
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.75)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      torso(ctx, sy - 1, hipY + 2, r * 0.9, r * 0.8, A);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-r * 0.9, sy - 1, r * 1.8, hipY - sy + 3);
      ctx.clip();
      ctx.strokeStyle = shade(A, 0.65);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = -r * 0.6; x < r; x += r * 0.55) { ctx.moveTo(x, sy); ctx.lineTo(x, hipY + 3); }
      for (let y = sy + r * 0.4; y < hipY; y += r * 0.55) { ctx.moveTo(-r, y); ctx.lineTo(r, y); }
      ctx.stroke();
      ctx.restore();
      if (front.leg) { limb(ctx, front.leg, legW, LOOK.denim); shoe(ctx, front.leg, legW, L.boots); }
      // Acoustic guitar across the body.
      ctx.save();
      ctx.translate(H * 0.05, hipY - H * 0.05);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.ellipse(-6, 0, 8, 6.8, 0, 0, Math.PI * 2);
      fill(ctx, L.wood, 1.4);
      ctx.beginPath();
      ctx.ellipse(1, 0, 5.5, 5, 0, 0, Math.PI * 2);
      fill(ctx, L.wood, 1.4);
      ctx.fillStyle = L.wood;
      ctx.fillRect(-6, -4.5, 7, 9);
      disc(ctx, -2, 0, 2.1, '#3a2418', 0);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(22, 0); ctx.stroke();
      ctx.strokeStyle = L.neck;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(21, -2.2, 4, 4.4);
      ctx.restore();
      if (front.arm) { limb(ctx, front.arm, armW, A); disc(ctx, front.arm[4]!, front.arm[5]!, armW * 0.6, LOOK.skin); }
      // Head: stubble, beanie with a pompom.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      if (full) {
        ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(r * 0.45, hy - r * 0.05, r * 0.15, P, 0); ctx.stroke();
      } else eye(ctx, r * 0.45, hy - r * 0.1, Math.max(1, r * 0.15), pose);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(r * 0.5, hy + r * 0.35, r * (full ? 0.3 : 0.2), 0.3, P - 0.8); ctx.stroke();
      ctx.fillStyle = 'rgba(90,60,40,0.35)';
      ctx.beginPath(); ctx.arc(r * 0.2, hy + r * 0.4, r * 0.65, 0.1, P - 0.1); ctx.fill();
      const capY = hy - r * 0.35;
      ctx.beginPath();
      ctx.moveTo(-r * 1.02, capY + r * 0.15);
      ctx.quadraticCurveTo(-r * 1.0, capY - r * 1.25, 0, capY - r * 1.3);
      ctx.quadraticCurveTo(r * 1.0, capY - r * 1.25, r * 1.02, capY + r * 0.15);
      ctx.closePath();
      fill(ctx, L.beanie, 1.2);
      ctx.beginPath();
      ctx.roundRect(-r * 1.08, capY - r * 0.12, r * 2.16, r * 0.38, r * 0.15);
      fill(ctx, shade(L.beanie, 0.8), 1);
      disc(ctx, 0, capY - r * 1.35, r * 0.28, '#f4f4f4', 0.9);
      // Notes rise with the groove.
      const n = full ? 4 : Math.round(meter * 3);
      for (let i = 0; i < n; i++) {
        const k = ((t * 0.02 + i / Math.max(1, n)) % 1);
        const x = r * (1.2 + i * 0.6) + Math.sin(t * 0.1 + i) * 2;
        const y = hy - r * 1.6 - k * 14;
        ctx.globalAlpha = 1 - k * 0.8;
        note(ctx, x, y, 0.85, full ? ['#ff5a7a', '#ffd23a', '#7dff6a', '#38e8ff'][i % 4]! : A);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      drawDressedSeasonal(ctx, id, pose, sk);
  }
}

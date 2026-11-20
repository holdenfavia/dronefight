// Dressed looks (ADR-0084) for the Christmas fighters (ADR-0091), drawn on the same stick-figure skeleton as the
// rest of the cast (dressed.ts) so poses and hitboxes still line up. The player's slot, own or team color is each
// look's main piece, and each signature meter shows on the body. Original designs (Hard rule 3).
// Local units around the body centre, y down, facing +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { PALETTE } from './config';
import { disc, eye, fill, glow, limb, shade, shoe, star, torso, type Skeleton } from './dressed';
import type { FigurePose } from './figures';

export const CHRISTMAS_DRESSED: ReadonlySet<FighterId> = new Set<FighterId>(['snowman', 'nutcracker', 'elf', 'santa', 'reindeer', 'gingerbread']);

/** Fixed colors of each look; the slot color fills the main piece. */
const LOOK = {
  skin: '#f2c9a0',
  cheek: '#f0a0a0',
  gold: '#e8b23a',
  white: '#fafafa',
  snowman: { snow: '#f6f9ff', shade: '#c9d6ec', twig: '#6b4226', coal: '#232326', carrot: '#f08a24', hat: '#1f1f22', frost: '#9fdcff' },
  nutcracker: { shako: '#1f1f22', trousers: '#f1ede4', boots: '#141414', wood: '#e8c9a0', beard: '#fafafa', belt: '#fafafa', steel: '#d8dee6', key: '#c9a24a' },
  elf: { stripe: '#fafafa', shoe: '#6b4226', cane: '#e8322a', bell: '#ffd23a', hair: '#c8873a', belt: '#2a1a10' },
  santa: { fur: '#fafafa', belt: '#1b1b1b', boots: '#1b1b1b', sack: '#a8834e', sackDark: '#7a5a32', coal: '#2b2b30', ember: '#ff7a2a' },
  reindeer: { fur: '#8a5a32', furDark: '#6b4226', belly: '#d9b98a', hoof: '#2a1a10', antler: '#d9c19a', nose: '#ff2a1f', bell: '#ffd23a' },
  gingerbread: { cookie: '#c8803c', dark: '#9a5a26', icing: '#fafafa', gum: ['#ff4a4a', '#4ad06a', '#ffd23a'], heat: '#ffb05a' },
} as const;

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, line = 1.6, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  fill(ctx, color, line);
}

/** A six-armed snowflake. */
function flake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, spin = 0): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.stroke();
}

/** A wavy line of icing along a limb. */
function icing(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const n = 4;
  const nx = -(y1 - y0), ny = x1 - x0;
  const len = Math.hypot(nx, ny) || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const k = i / (n * 2);
    const w = (i % 2 ? 1.4 : -1.4) / len;
    const x = x0 + (x1 - x0) * k + nx * w, y = y0 + (y1 - y0) * k + ny * w;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawDressedChristmas(ctx: CanvasRenderingContext2D, id: FighterId, pose: FigurePose, sk: Skeleton): void {
  const A = pose.color;
  const meter = Math.max(0, Math.min(1, pose.meter ?? 0));
  const full = pose.ready === true || meter >= 1;
  const { H, lw, headR: r, headY: hy, shoulderY: sy, hipY, legs, arms, hands } = sk;
  const legW = lw * 1.35;
  const armW = lw * 1.15;
  const front = { leg: legs[0], arm: arms[0], hand: hands[0] };
  const back = { leg: legs[1], arm: arms[1], hand: hands[1] };
  const t = pose.phase;
  const P = Math.PI;

  switch (id) {
    // ── Snowman: three packed snowballs on stumpy snow legs, twig arms, coal eyes and buttons, a carrot nose, a
    // scarf in the slot color and a black top hat with a slot-color band. Snowpack shows as little snowballs on
    // the hat brim; full (Avalanche) the snowman frosts over and a snowflake glints on the hat.
    case 'snowman': {
      const L = LOOK.snowman;
      if (full) glow(ctx, 0, (hy + hipY) / 2, H * 0.75, L.frost, 0.6 + 0.2 * Math.sin(t * 0.4));
      const twig = (a: readonly number[] | undefined) => {
        if (!a) return;
        limb(ctx, a, lw * 0.55, L.twig);
        const hx = a[4]!, hy2 = a[5]!;
        const ang = Math.atan2(hy2 - a[3]!, hx - a[2]!);
        for (const d of [-0.6, 0.6]) limb(ctx, [hx, hy2, hx + Math.cos(ang + d) * 4, hy2 + Math.sin(ang + d) * 4], 1, L.twig);
      };
      const stump = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW * 1.2, shade(L.snow, k), 2);
        ellipse(ctx, l[4]! + 1, l[5]!, legW * 1.1, legW * 0.6, shade(L.shade, k), 1.2);
      };
      twig(back.arm);
      stump(back.leg, 0.92);
      stump(front.leg, 1);
      // Bottom and middle balls.
      const bottomY = hipY + H * 0.02, bottomR = H * 0.26;
      ellipse(ctx, 0, bottomY, bottomR * 1.05, bottomR * 0.9, L.snow, 1.8);
      ctx.fillStyle = L.shade;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.ellipse(-bottomR * 0.3, bottomY + bottomR * 0.35, bottomR * 0.7, bottomR * 0.35, 0, 0, P * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const midY = (sy + hipY) / 2 - H * 0.02, midR = H * 0.19;
      ellipse(ctx, 0, midY, midR, midR * 0.95, L.snow, 1.8);
      for (const k of [-0.45, 0, 0.45]) disc(ctx, midR * 0.55, midY + midR * k, 1.6, L.coal, 0);
      disc(ctx, bottomR * 0.55, bottomY - bottomR * 0.3, 1.7, L.coal, 0);
      twig(front.arm);
      // Head.
      disc(ctx, 0, hy, r, L.snow, 1.8);
      eye(ctx, r * 0.35, hy - r * 0.2, Math.max(1.2, r * 0.15), pose, L.coal);
      eye(ctx, r * 0.75, hy - r * 0.18, Math.max(1, r * 0.12), pose, L.coal);
      ctx.beginPath();
      ctx.moveTo(r * 0.75, hy - r * 0.02);
      ctx.lineTo(r * 1.75, hy + r * 0.1);
      ctx.lineTo(r * 0.75, hy + r * 0.24);
      ctx.closePath();
      fill(ctx, L.carrot, 1.1);
      for (let i = 0; i < 4; i++) disc(ctx, r * (0.2 + i * 0.17), hy + r * (0.5 + Math.sin(i * 0.9) * 0.06), 0.9, L.coal, 0);
      // Scarf, its tail blowing back.
      const wave = Math.sin(t * 0.3) * 2;
      ctx.beginPath();
      ctx.roundRect(-r * 0.95, hy + r * 0.78, r * 1.9, r * 0.36, r * 0.15);
      fill(ctx, A, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, hy + r * 1.0);
      ctx.lineTo(-r * 1.5, hy + r * 1.7 + wave);
      ctx.lineTo(-r * 1.05, hy + r * 1.9 + wave);
      ctx.lineTo(-r * 0.25, hy + r * 1.1);
      ctx.closePath();
      fill(ctx, shade(A, 0.8), 1.1);
      // Top hat.
      const brim = hy - r * 0.72;
      ctx.beginPath();
      ctx.roundRect(-r * 1.05, brim - r * 0.12, r * 2.1, r * 0.24, r * 0.1);
      fill(ctx, L.hat, 1);
      ctx.beginPath();
      ctx.rect(-r * 0.68, brim - r * 1.15, r * 1.36, r * 1.05);
      fill(ctx, L.hat, 1.2);
      ctx.fillStyle = A;
      ctx.fillRect(-r * 0.68, brim - r * 0.42, r * 1.36, r * 0.24);
      // Snowpack: one little snowball on the brim per pack.
      const packs = Math.round(meter * 3);
      for (let i = 0; i < packs; i++) disc(ctx, -r * 0.7 + i * r * 0.42, brim - r * 0.2, r * 0.16, L.snow, 0.9);
      if (full) flake(ctx, r * 0.35, brim - r * 0.75, r * 0.32, L.frost, t * 0.05);
      break;
    }

    // ── Nutcracker: a wooden toy soldier. A tall black shako with a gold plate and plume, a jacket in the slot
    // color with gold buttons and white cross-belts, white trousers, black boots, a square wooden face with a white
    // beard and a big jaw, and a saber. The wind-up key on its back turns as it winds; fully wound, it shines gold.
    case 'nutcracker': {
      const L = LOOK.nutcracker;
      // Wind-up key behind.
      const kx = -r * 0.95, ky = (sy + hipY) / 2;
      limb(ctx, [kx + r * 0.4, ky, kx - r * 0.2, ky], 2, L.key);
      ctx.save();
      ctx.translate(kx - r * 0.35, ky);
      ctx.rotate(meter * P * 4 + (full ? t * 0.2 : 0));
      if (full) glow(ctx, 0, 0, r * 1.2, '#ffe27a', 0.8);
      for (const s of [-1, 1]) ellipse(ctx, 0, s * r * 0.35, r * 0.2, r * 0.35, full ? '#ffe27a' : L.key, 1);
      ctx.restore();
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW, shade(L.trousers, k));
        limb(ctx, l, legW + 0.8, shade(L.boots, k), 2);
        shoe(ctx, l, legW, L.boots);
      };
      leg(back.leg, 0.88);
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.78)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.7, LOOK.white); }
      torso(ctx, sy - 1, hipY + 2, r * 0.85, r * 0.75, A);
      // Cross-belts and buttons.
      ctx.strokeStyle = L.belt;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, sy); ctx.lineTo(r * 0.7, hipY);
      ctx.moveTo(r * 0.75, sy); ctx.lineTo(-r * 0.7, hipY);
      ctx.stroke();
      for (let y = sy + 3; y < hipY - 1; y += 3.5) disc(ctx, r * 0.35, y, 0.9, LOOK.gold, 0);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(-r * 0.8, hipY - 1, r * 1.6, 2.2);
      leg(front.leg, 1);
      // Saber from the front hand.
      if (front.hand) {
        const h = front.hand;
        const a = P / 2 - h.angle;
        const len = sk.swordLength * 0.9;
        limb(ctx, [h.x, h.y, h.x + Math.cos(a) * len, h.y + Math.sin(a) * len], 1.8, L.steel);
        limb(ctx, [h.x - Math.sin(a) * 3, h.y + Math.cos(a) * 3, h.x + Math.sin(a) * 3, h.y - Math.cos(a) * 3], 1.6, LOOK.gold);
      }
      if (front.arm) {
        limb(ctx, front.arm, armW, A);
        disc(ctx, front.arm[4]!, front.arm[5]!, armW * 0.7, LOOK.white);
        // Gold epaulette.
        ellipse(ctx, front.arm[0]!, front.arm[1]! - 1, armW * 0.9, armW * 0.5, LOOK.gold, 1);
      }
      // Square wooden head, white beard and the big jaw.
      ctx.beginPath();
      ctx.roundRect(-r * 0.85, hy - r * 0.8, r * 1.75, r * 1.7, r * 0.35);
      fill(ctx, L.wood, 1.8);
      ctx.beginPath();
      ctx.roundRect(-r * 0.6, hy + r * 0.35, r * 1.5, r * 0.75, r * 0.2);
      fill(ctx, L.beard, 1.2);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(r * 0.1, hy + r * 0.52, r * 0.75, 1.3);
      ctx.fillStyle = LOOK.cheek;
      ctx.beginPath(); ctx.arc(r * 0.3, hy + r * 0.15, r * 0.18, 0, P * 2); ctx.fill();
      eye(ctx, r * 0.5, hy - r * 0.25, Math.max(1, r * 0.15), pose);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(r * 0.3, hy - r * 0.55, r * 0.45, 1.3);
      // Shako: tall, black, a gold plate, a plume in the slot color.
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, hy - r * 0.7);
      ctx.lineTo(r * 0.85, hy - r * 0.7);
      ctx.lineTo(r * 0.75, hy - r * 2.0);
      ctx.lineTo(-r * 0.7, hy - r * 2.0);
      ctx.closePath();
      fill(ctx, L.shako, 1.4);
      ctx.fillStyle = LOOK.gold;
      ctx.fillRect(-r * 0.82, hy - r * 0.86, r * 1.7, r * 0.18);
      star(ctx, r * 0.2, hy - r * 1.35, r * 0.32, LOOK.gold);
      ellipse(ctx, r * 0.1, hy - r * 2.25, r * 0.22, r * 0.38, A, 1);
      break;
    }

    // ── Elf: a workshop elf. A tunic and pointy hat in the slot color with white trim and a bell on the tip,
    // red-and-white striped stockings, curled shoes, pointed ears, and a candy cane. Sugar Rush sparkles around
    // it as it fills; full, the hat bell glows and candy-colored sparks fly.
    case 'elf': {
      const L = LOOK.elf;
      if (full) glow(ctx, 0, (hy + hipY) / 2, H * 0.7, '#7dff9a', 0.5 + 0.3 * Math.sin(t * 0.9));
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW * 0.9, shade(L.stripe, k));
        ctx.save();
        ctx.setLineDash([2.2, 2.2]);
        limb(ctx, l, legW * 0.9, shade('#e8322a', k));
        ctx.restore();
        const fx = l[4]!, fy = l[5]!;
        ctx.beginPath();
        ctx.moveTo(fx - 2, fy - 1.5);
        ctx.quadraticCurveTo(fx + 6, fy + 2, fx + 7, fy - 3);
        ctx.quadraticCurveTo(fx + 4, fy + 2.5, fx - 2, fy + 2);
        ctx.closePath();
        fill(ctx, L.shoe, 1);
      };
      leg(back.leg, 0.85);
      if (back.arm) { limb(ctx, back.arm, armW, shade(A, 0.78)); disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.6, LOOK.skin); }
      // Tunic with a zigzag white hem and a belt.
      torso(ctx, sy - 1, hipY + 3, r * 0.75, r * 0.95, A);
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.95 + (i * r * 1.9) / 6, hipY + (i % 2 ? 6 : 2.5));
      ctx.lineTo(r * 0.95, hipY + 2);
      ctx.lineTo(-r * 0.95, hipY + 2);
      ctx.closePath();
      fill(ctx, L.stripe, 1);
      ctx.fillStyle = L.belt;
      ctx.fillRect(-r * 0.85, hipY - 3, r * 1.7, 2.2);
      ctx.fillStyle = LOOK.gold;
      ctx.fillRect(-1.5, hipY - 3.3, 3, 2.8);
      leg(front.leg, 1);
      // Candy cane.
      if (front.hand) {
        const h = front.hand;
        const a = P / 2 - h.angle;
        const len = H * 0.55;
        const ex = h.x + Math.cos(a) * len * 0.75, ey = h.y + Math.sin(a) * len * 0.75;
        const bx = h.x - Math.cos(a) * len * 0.25, by = h.y - Math.sin(a) * len * 0.25;
        limb(ctx, [bx, by, ex, ey], 2.4, L.stripe);
        ctx.save();
        ctx.setLineDash([2.4, 2.4]);
        ctx.strokeStyle = L.cane;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = L.cane;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(ex - Math.sin(a) * 3, ey + Math.cos(a) * 3, 3, a - P / 2, a + P / 2, true);
        ctx.stroke();
      }
      if (front.arm) { limb(ctx, front.arm, armW, A); disc(ctx, front.arm[4]!, front.arm[5]!, armW * 0.6, LOOK.skin); }
      // Head: pointed ear, a little smile, freckles.
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, hy - r * 0.1);
      ctx.lineTo(-r * 1.45, hy - r * 0.55);
      ctx.lineTo(-r * 0.4, hy + r * 0.35);
      ctx.closePath();
      fill(ctx, LOOK.skin, 1.2);
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.fillStyle = L.hair;
      ctx.beginPath(); ctx.arc(-r * 0.2, hy - r * 0.35, r * 0.75, P, P * 1.9); ctx.fill();
      eye(ctx, r * 0.5, hy - r * 0.05, Math.max(1, r * 0.15), pose);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r * 0.5, hy + r * 0.3, r * 0.22, 0.2, P - 0.6); ctx.stroke();
      ctx.fillStyle = LOOK.cheek;
      ctx.beginPath(); ctx.arc(r * 0.2, hy + r * 0.25, r * 0.16, 0, P * 2); ctx.fill();
      // Pointy hat flopping back, white trim, a bell on the tip.
      const flop = Math.sin(t * 0.3) * 1.5;
      const tipX = -r * 1.5 + flop, tipY = hy - r * 2.0;
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, hy - r * 0.45);
      ctx.quadraticCurveTo(-r * 0.2, hy - r * 2.3, tipX, tipY);
      ctx.quadraticCurveTo(r * 0.3, hy - r * 1.4, r * 1.0, hy - r * 0.45);
      ctx.closePath();
      fill(ctx, A, 1.3);
      ctx.beginPath();
      ctx.roundRect(-r * 1.08, hy - r * 0.62, r * 2.16, r * 0.34, r * 0.15);
      fill(ctx, L.stripe, 1);
      if (full) glow(ctx, tipX, tipY, r * 0.9, L.bell, 0.9);
      disc(ctx, tipX, tipY, r * 0.24, L.bell, 1);
      // Sugar sparkles, more as it fills.
      const n = Math.round(meter * 4);
      const candy = ['#ff5a7a', '#7dff6a', '#ffd23a', '#38e8ff'];
      for (let i = 0; i < n; i++) {
        const a = t * 0.08 + (i / Math.max(1, n)) * P * 2;
        star(ctx, Math.cos(a) * H * 0.42, (sy + hipY) / 2 + Math.sin(a) * H * 0.38, 2.4, candy[i % 4]!);
      }
      break;
    }

    // ── Santa: a big jolly suit in the slot color with white fur trim, a black belt and gold buckle, black boots,
    // a full white beard, rosy cheeks and the hat with a pompom; the gift sack over his back. With anyone on the
    // Naughty List, a lump of coal smoulders in his free hand.
    case 'santa': {
      const L = LOOK.santa;
      // Gift sack behind.
      ellipse(ctx, -r * 1.1, sy + H * 0.08, r * 0.95, r * 1.1, L.sack, 1.6, -0.3);
      ctx.strokeStyle = L.sackDark;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, sy - r * 0.6); ctx.lineTo(-r * 0.2, sy - r * 0.95); ctx.stroke();
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW * 1.2, shade(A, k * 0.85));
        limb(ctx, l, legW * 1.3, shade(L.boots, k), 2);
        shoe(ctx, l, legW * 1.1, L.boots);
      };
      leg(back.leg, 0.85);
      if (back.arm) {
        limb(ctx, back.arm, armW * 1.2, shade(A, 0.78));
        disc(ctx, back.arm[4]!, back.arm[5]!, armW * 0.75, shade(L.fur, 0.85));
      }
      // Round suit, fur down the front and along the hem.
      const cy = (sy + hipY) / 2 + H * 0.03;
      ellipse(ctx, H * 0.02, cy, H * 0.27, H * 0.25, A, 2);
      ctx.fillStyle = L.fur;
      ctx.fillRect(H * 0.08, sy, 3.2, hipY - sy + H * 0.08);
      ctx.beginPath();
      ctx.roundRect(-H * 0.24, hipY + H * 0.03, H * 0.52, 4, 2);
      fill(ctx, L.fur, 1);
      ctx.fillStyle = L.belt;
      ctx.fillRect(-H * 0.26, hipY - 3, H * 0.55, 3.4);
      ctx.beginPath();
      ctx.rect(H * 0.06, hipY - 4, 6, 5.4);
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      leg(front.leg, 1);
      if (front.arm) {
        limb(ctx, front.arm, armW * 1.2, A);
        const hx = front.arm[4]!, hy2 = front.arm[5]!;
        ellipse(ctx, (front.arm[2]! + hx) / 2, (front.arm[3]! + hy2) / 2, armW * 0.9, armW * 0.6, L.fur, 0.8);
        if (full) {
          glow(ctx, hx + 2, hy2, armW * 2.5, L.ember, 0.6 + 0.3 * Math.sin(t * 0.7));
          ellipse(ctx, hx + 2, hy2, 3.4, 2.8, L.coal, 1);
          disc(ctx, hx + 3, hy2 - 0.5, 0.9, L.ember, 0);
        }
        disc(ctx, hx, hy2, armW * 0.75, L.fur);
      }
      // Head: beard, mustache, rosy cheeks.
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, hy + r * 0.05);
      ctx.quadraticCurveTo(-r * 0.7, hy + r * 1.9, r * 0.5, hy + r * 1.7);
      ctx.quadraticCurveTo(r * 1.15, hy + r * 1.2, r * 0.98, hy + r * 0.15);
      ctx.quadraticCurveTo(r * 0.3, hy + r * 0.55, -r * 0.75, hy + r * 0.05);
      fill(ctx, L.fur, 1.3);
      ellipse(ctx, r * 0.55, hy + r * 0.38, r * 0.42, r * 0.17, L.fur, 1, -0.1);
      ctx.fillStyle = LOOK.cheek;
      ctx.beginPath(); ctx.arc(r * 0.3, hy + r * 0.12, r * 0.18, 0, P * 2); ctx.fill();
      eye(ctx, r * 0.5, hy - r * 0.15, Math.max(1, r * 0.14), pose);
      ctx.beginPath(); ctx.arc(r * 0.82, hy + r * 0.1, r * 0.16, 0, P * 2); ctx.fillStyle = '#f0a0a0'; ctx.fill();
      // Hat flopping back with a pompom.
      const flop = Math.sin(t * 0.25) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, hy - r * 0.5);
      ctx.quadraticCurveTo(-r * 0.1, hy - r * 2.1, -r * 1.3 + flop, hy - r * 1.3);
      ctx.quadraticCurveTo(r * 0.5, hy - r * 1.5, r * 0.98, hy - r * 0.5);
      ctx.closePath();
      fill(ctx, A, 1.3);
      ctx.beginPath();
      ctx.roundRect(-r * 1.08, hy - r * 0.7, r * 2.16, r * 0.38, r * 0.17);
      fill(ctx, L.fur, 1);
      disc(ctx, -r * 1.35 + flop, hy - r * 1.25, r * 0.3, L.fur, 1);
      break;
    }

    // ── Reindeer: a flying reindeer on two legs. Brown fur, a pale belly, dark hooves, branching antlers, a short
    // tail, and a harness collar in the slot color with a gold sleigh bell. The nose glows brighter with each
    // pip of Glow; full (Beacon) it shines.
    case 'reindeer': {
      const L = LOOK.reindeer;
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW, shade(L.fur, k));
        ellipse(ctx, l[4]! + 0.8, l[5]!, legW * 0.75, legW * 0.6, L.hoof, 1);
      };
      // Tail.
      ellipse(ctx, -r * 0.85, hipY - 1, r * 0.3, r * 0.22, L.belly, 1.1, -0.5);
      leg(back.leg, 0.82);
      if (back.arm) { limb(ctx, back.arm, armW, shade(L.fur, 0.8)); ellipse(ctx, back.arm[4]!, back.arm[5]!, armW * 0.65, armW * 0.55, L.hoof, 1); }
      torso(ctx, sy - 1, hipY + 2, r * 0.85, r * 0.8, L.fur);
      ellipse(ctx, r * 0.3, (sy + hipY) / 2 + 1, r * 0.45, (hipY - sy) * 0.4, L.belly, 0);
      leg(front.leg, 1);
      if (front.arm) { limb(ctx, front.arm, armW, L.fur); ellipse(ctx, front.arm[4]!, front.arm[5]!, armW * 0.65, armW * 0.55, L.hoof, 1); }
      // Antlers.
      const antler = (dx: number, k: number) => {
        const bx = dx, by = hy - r * 0.75;
        const tx = dx - r * 0.5, ty = by - r * 1.4;
        const col = shade(L.antler, k);
        limb(ctx, [bx, by, dx - r * 0.1, by - r * 0.7, tx, ty], 1.6, col);
        limb(ctx, [dx - r * 0.1, by - r * 0.7, dx + r * 0.45, by - r * 1.2], 1.3, col);
        limb(ctx, [dx - r * 0.25, by - r * 1.05, dx - r * 0.9, by - r * 1.25], 1.3, col);
      };
      antler(-r * 0.35, 0.82);
      // Long head with a muzzle, ear, and the nose.
      ellipse(ctx, -r * 0.6, hy - r * 0.45, r * 0.42, r * 0.2, L.furDark, 1.1, -0.5);
      disc(ctx, 0, hy, r * 0.95, L.fur, 1.8);
      ellipse(ctx, r * 0.75, hy + r * 0.25, r * 0.6, r * 0.45, L.belly, 1.3);
      antler(r * 0.15, 1);
      eye(ctx, r * 0.35, hy - r * 0.2, Math.max(1, r * 0.15), pose);
      const noseX = r * 1.3, noseY = hy + r * 0.12;
      if (meter > 0) glow(ctx, noseX, noseY, r * (0.8 + meter * 1.4), L.nose, 0.4 + meter * 0.6 + (full ? 0.2 * Math.sin(t * 0.8) : 0));
      disc(ctx, noseX, noseY, r * 0.26, full ? '#ff6a4a' : L.nose, 1);
      disc(ctx, noseX + r * 0.06, noseY - r * 0.09, r * 0.07, '#ffffff', 0);
      // Harness collar and bell.
      ctx.beginPath();
      ctx.roundRect(-r * 0.75, sy - 2, r * 1.6, 3.4, 1.6);
      fill(ctx, A, 1);
      disc(ctx, r * 0.45, sy + 3, 2.2, L.bell, 1);
      break;
    }

    // ── Gingerbread: a gingerbread cookie with wavy white icing on its limbs, gumdrop buttons, an icing smile and
    // a bow tie in the slot color. Fresh Batch: the cookie glows warmer as it fills; full, steam curls off it.
    case 'gingerbread': {
      const L = LOOK.gingerbread;
      if (meter > 0.3) glow(ctx, 0, (hy + hipY) / 2, H * (0.5 + meter * 0.3), L.heat, (meter - 0.3) * 0.9);
      const cookieLimb = (a: readonly number[] | undefined, w: number, k: number) => {
        if (!a) return;
        limb(ctx, a, w, shade(L.cookie, k));
        disc(ctx, a[4]!, a[5]!, w * 0.62, shade(L.cookie, k), 0);
        icing(ctx, a[2]! + (a[4]! - a[2]!) * 0.55, a[3]! + (a[5]! - a[3]!) * 0.55, a[4]!, a[5]!, L.icing);
      };
      cookieLimb(back.arm, armW * 1.25, 0.85);
      cookieLimb(back.leg, legW * 1.35, 0.85);
      torso(ctx, sy - 2, hipY + 3, r * 0.8, r * 0.8, L.cookie);
      cookieLimb(front.leg, legW * 1.35, 1);
      // Gumdrop buttons.
      const by0 = sy + (hipY - sy) * 0.25;
      for (let i = 0; i < 3; i++) {
        const y = by0 + i * (hipY - sy) * 0.3;
        ctx.beginPath();
        ctx.arc(r * 0.1, y + 1, 2, P, 0);
        ctx.lineTo(r * 0.1 + 2, y + 1.6);
        ctx.lineTo(r * 0.1 - 2, y + 1.6);
        ctx.closePath();
        fill(ctx, L.gum[i]!, 0.8);
      }
      cookieLimb(front.arm, armW * 1.25, 1);
      // Head: icing eyes and smile, the bow tie.
      disc(ctx, 0, hy, r, L.cookie, 1.8);
      ctx.strokeStyle = L.icing;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * P * 2;
        const rr = r * (i % 2 ? 0.8 : 0.86);
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, hy + Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, hy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
      if (pose.blink > 0.5) { ctx.fillStyle = L.icing; ctx.fillRect(r * 0.15, hy - r * 0.2, r * 0.5, 1.2); }
      else for (const ex of [r * 0.2, r * 0.6]) disc(ctx, ex, hy - r * 0.15, Math.max(1, r * 0.13), L.icing, 0);
      ctx.strokeStyle = L.icing;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(r * 0.4, hy + r * 0.15, r * 0.3, 0.3, P - 0.3); ctx.stroke();
      const tieY = hy + r * 1.05;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.1, tieY);
        ctx.lineTo(r * 0.1 + s * r * 0.5, tieY - r * 0.28);
        ctx.lineTo(r * 0.1 + s * r * 0.5, tieY + r * 0.28);
        ctx.closePath();
        fill(ctx, A, 1);
      }
      disc(ctx, r * 0.1, tieY, r * 0.12, shade(A, 0.8), 0.8);
      if (full) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.03 + i / 3) % 1;
          const x = -r * 0.6 + i * r * 0.6;
          const y = hy - r * 1.2 - k * 12;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.moveTo(x, y + 6);
          ctx.quadraticCurveTo(x + 3, y + 3, x, y);
          ctx.quadraticCurveTo(x - 3, y - 3, x, y - 6);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }

    default:
      break;
  }
}

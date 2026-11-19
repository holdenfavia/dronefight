// Dressed looks (ADR-0084) for the secret River (ADR-0077, ADR-0078) and the Thanksgiving fighters (ADR-0082),
// drawn on the same stick-figure skeleton as the main ten (dressed.ts) so poses and hitboxes still line up. The
// player's slot, own or team color is each look's main piece. Local units around the body centre, y down, facing +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { SISTERS } from '../../shared/fighter/signature';
import { PALETTE } from './config';
import { disc, eye, fill, glow, limb, shade, shoe, torso, type Skeleton } from './dressed';
import type { FigurePose } from './figures';

/** Fixed colors of each look; the slot color fills the main piece. */
const LOOK = {
  skin: '#f2c9a0',
  cheek: '#f0a0a0',
  gold: '#e8b23a',
  river: { shorts: '#c8a46a', shoe: '#fafafa', stripe: '#fafafa', prop: '#ffd23f', prop2: '#e8402a' },
  turkey: {
    body: '#6b4226', dark: '#46291a', bronze: '#8a5a2e', band: '#2e1c10', rust: '#c8642b',
    leg: '#d8743a', face: '#c3d4ec', red: '#d8312b', beak: '#f2b632', thunder: '#fff27a',
  },
  pilgrim: {
    hat: '#1f1f22', breeches: '#2b2b30', stocking: '#f1ede4', collar: '#fafafa', belt: '#4a2c18',
    wood: '#7a4a22', brass: '#c9a24a', hair: '#6b4226', wheat: '#e2b84a', hot: '#ff9a1a',
  },
  chief: {
    skin: '#b9784e', hide: '#c39a66', fringe: '#7d5a34', hair: '#1f1a17', moccasin: '#8a5a32',
    wampum: '#5b3a86', shell: '#f4efe6', paddle: '#c99a5b', water: '#5fd4ff',
    corn: '#f2c94c', husk: '#6fa046', bean: '#4f9a3c', squash: '#e8862a',
  },
} as const;

/** Part of a limb's first segment (shoulder→elbow or hip→knee), from k0 to k1 along it. */
function upper(pts: readonly number[], k0 = 0, k1 = 1): number[] {
  const x0 = pts[0]!, y0 = pts[1]!, x1 = pts[2]!, y1 = pts[3]!;
  return [x0 + (x1 - x0) * k0, y0 + (y1 - y0) * k0, x0 + (x1 - x0) * k1, y0 + (y1 - y0) * k1];
}

/** A point k of the way along a limb's second segment (elbow→hand or knee→foot). */
function along(pts: readonly number[], k: number): [number, number] {
  const x0 = pts[2]!, y0 = pts[3]!, x1 = pts[4]!, y1 = pts[5]!;
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
}

/** A rounded feather or leaf from (x, y) out along angle a. */
function feather(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, color: string, line = 1.1): void {
  ctx.beginPath();
  ctx.ellipse(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.5, w, a, 0, Math.PI * 2);
  fill(ctx, color, line);
}

export function drawDressedSeasonal(ctx: CanvasRenderingContext2D, id: FighterId, pose: FigurePose, sk: Skeleton): void {
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
    // ── River (secret): a big, round, happy guy. A striped tee in the slot color stretched over the belly (it
    // rides up a little), cargo shorts, sneakers, and his propeller beanie, which spins faster the faster he runs.
    case 'river': {
      const L = LOOK.river;
      const stride = pose.stride ?? 0;
      const wob = Math.sin(t * 0.35) * (stride ? 1.5 : 0.6);
      const bx = H * 0.06, by = (sy + hipY) / 2 + H * 0.04;
      const brx = H * 0.36 + wob, bry = H * 0.3 - wob * 0.5;
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW * 1.15, shade(LOOK.skin, k), 2);
        shoe(ctx, l, legW * 1.15, L.shoe);
        ctx.fillStyle = A;
        ctx.fillRect(l[4]! - 0.5, l[5]! - 1.2, legW * 0.9, 1.6);
        limb(ctx, upper(l), legW * 2.1, shade(L.shorts, k));
      };
      const arm = (a: readonly number[] | undefined, k: number) => {
        if (!a) return;
        limb(ctx, a, armW * 1.2, shade(LOOK.skin, k));
        disc(ctx, a[4]!, a[5]!, armW * 0.8, shade(LOOK.skin, k));
        limb(ctx, upper(a, 0, 0.55), armW * 2, shade(A, k * 0.9));
      };
      arm(back.arm, 0.85);
      leg(back.leg, 0.85);
      leg(front.leg, 1);
      // The belly: skin underneath, the tee over all but the bottom.
      const belly = () => { ctx.beginPath(); ctx.ellipse(bx, by, brx, bry, 0, 0, P * 2); };
      belly();
      fill(ctx, LOOK.skin, 2);
      const hem = by + bry * 0.6;
      ctx.save();
      belly();
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(bx - brx - 1, by - bry - 1);
      ctx.lineTo(bx + brx + 1, by - bry - 1);
      ctx.lineTo(bx + brx + 1, hem);
      ctx.quadraticCurveTo(bx, hem + 3, bx - brx - 1, hem);
      ctx.closePath();
      ctx.fillStyle = A;
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = L.stripe;
      ctx.globalAlpha = 0.85;
      for (const k of [-0.42, -0.02]) ctx.fillRect(bx - brx, by + bry * k, brx * 2, bry * 0.14);
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.ellipse(bx + brx * 0.35, by - bry * 0.5, brx * 0.25, bry * 0.15, -0.5, 0, P * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      belly();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      disc(ctx, bx + H * 0.12, by + bry * 0.8, 1.1, PALETTE.ink, 0);
      arm(front.arm, 1);
      // Head: a round face with a double chin, rosy cheeks and a big grin.
      ctx.beginPath();
      ctx.ellipse(r * 0.15, hy + r * 0.75, r * 0.75, r * 0.4, 0, 0, P * 2);
      fill(ctx, LOOK.skin, 1.4);
      disc(ctx, 0, hy, r, LOOK.skin, 1.8);
      ctx.fillStyle = LOOK.cheek;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(r * 0.25, hy + r * 0.3, r * 0.22, 0, P * 2); ctx.fill();
      ctx.globalAlpha = 1;
      eye(ctx, r * 0.5, hy - r * 0.1, Math.max(1, r * 0.15), pose);
      ctx.beginPath();
      ctx.moveTo(r * 0.2, hy + r * 0.35);
      ctx.quadraticCurveTo(r * 0.6, hy + r * 0.85, r * 0.95, hy + r * 0.3);
      ctx.closePath();
      fill(ctx, '#fafafa', 1.1);
      // Propeller beanie: panels in the slot color and white, a little bill, a two-tone propeller.
      const capY = hy - r * 0.15;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, capY, r * 1.04, P, 0);
      ctx.closePath();
      fill(ctx, A, 1.4);
      ctx.clip();
      ctx.fillStyle = '#fafafa';
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, capY); ctx.lineTo(0, capY - r * 1.1); ctx.lineTo(r * 0.3, capY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(r * 1.1, capY - r * 0.02, r * 0.5, r * 0.16, 0.1, 0, P * 2);
      fill(ctx, shade(A, 0.75), 1.1);
      const top = capY - r * 1.04;
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(-0.9, top - r * 0.45, 1.8, r * 0.5);
      const spin = Math.cos(t * (0.6 + stride * 1.4));
      const bw = r * 0.85 * Math.abs(spin) + 1;
      ctx.beginPath();
      ctx.ellipse(-bw * 0.5 * Math.sign(spin || 1), top - r * 0.45, bw * 0.5, r * 0.16, 0, 0, P * 2);
      fill(ctx, L.prop, 1);
      ctx.beginPath();
      ctx.ellipse(bw * 0.5 * Math.sign(spin || 1), top - r * 0.45, bw * 0.5, r * 0.16, 0, 0, P * 2);
      fill(ctx, L.prop2, 1);
      disc(ctx, 0, top - r * 0.45, 1.2, PALETTE.ink, 0);
      break;
    }

    // ── Turkey: a proud tom. A big striped tail fan tipped in the slot color that puffs out as the Gobble meter
    // fills and crackles at full (Thunder Gobble), bronze feathers, wing primaries in the slot color, a bare blue
    // head with a red snood and wattle that swell with the meter, and orange legs and toes.
    case 'turkey': {
      const L = LOOK.turkey;
      const cy = (sy + hipY) / 2;
      const fanR = H * 0.5 * (1 + 0.14 * meter);
      const fanX = -H * 0.16, fanY = cy;
      if (full) glow(ctx, fanX, fanY - fanR * 0.3, fanR * 1.25, L.thunder, 0.7 + 0.3 * Math.sin(t * 0.8));
      const N = 9, a0 = P * 0.78, a1 = P * 1.84;
      const bands: [number, string, number][] = [[1, A, 1.3], [0.84, L.band, 0], [0.78, L.bronze, 0], [0.46, L.rust, 0]];
      for (const [k, col, line] of bands) {
        for (let i = 0; i < N; i++) {
          const a = a0 + ((a1 - a0) * i) / (N - 1);
          feather(ctx, fanX, fanY, a, fanR * k, fanR * 0.15 * (0.75 + 0.25 * k), col, line);
        }
      }
      if (full) {
        // Thunder: little bolts crackling off the fan's edge.
        ctx.strokeStyle = L.thunder;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) {
          const a = a0 + (a1 - a0) * ((Math.floor(t * 0.15) * 0.37 + i * 0.33) % 1);
          const x = fanX + Math.cos(a) * fanR, y = fanY + Math.sin(a) * fanR;
          const nx = Math.cos(a), ny = Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + nx * 4 - ny * 2.5, y + ny * 4 + nx * 2.5);
          ctx.lineTo(x + nx * 6 + ny * 2, y + ny * 6 - nx * 2);
          ctx.lineTo(x + nx * 10, y + ny * 10);
          ctx.stroke();
        }
      }
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        const c = shade(L.leg, k);
        limb(ctx, l, lw * 0.7, c, 2);
        const fx = l[4]!, fy = l[5]!;
        for (const [dx, dy] of [[5, 0.5], [3.5, 2], [-3, 0.5]]) limb(ctx, [fx, fy, fx + dx!, fy + dy!], 1.1, c);
        ctx.beginPath();
        ctx.ellipse((l[0]! + l[2]!) / 2, (l[1]! + l[3]!) / 2, legW * 1.1, legW * 1.4, 0, 0, P * 2);
        fill(ctx, shade(L.dark, k), 1.2);
      };
      const wing = (a: readonly number[] | undefined, k: number) => {
        if (!a) return;
        const x0 = a[0]!, y0 = a[1]!, x1 = a[4]!, y1 = a[5]!;
        const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
        for (const d of [-0.4, 0, 0.4]) feather(ctx, x1 - Math.cos(ang) * 2, y1 - Math.sin(ang) * 2, ang + d, 8, 1.9, shade(A, k), 1);
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 3, 4.2, ang, 0, P * 2);
        fill(ctx, shade(L.bronze, k), 1.3);
        ctx.strokeStyle = shade(L.band, k);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35);
        ctx.lineTo(x0 + (x1 - x0) * 0.85, y0 + (y1 - y0) * 0.85);
        ctx.stroke();
      };
      wing(back.arm, 0.8);
      leg(back.leg, 0.85);
      leg(front.leg, 1);
      // Round body with rows of scalloped feathers and a little breast tuft.
      const brx = H * 0.24, bry = H * 0.22;
      ctx.beginPath();
      ctx.ellipse(0, cy, brx, bry, 0, 0, P * 2);
      fill(ctx, L.body, 1.8);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, cy, brx, bry, 0, 0, P * 2);
      ctx.clip();
      ctx.strokeStyle = L.dark;
      ctx.lineWidth = 1;
      for (let row = 0; row < 4; row++) {
        const y = cy - bry * 0.55 + row * bry * 0.42;
        for (let i = -3; i <= 3; i++) {
          const x = i * brx * 0.32 + (row % 2) * brx * 0.16;
          ctx.beginPath();
          ctx.arc(x, y, brx * 0.17, 0.15 * P, 0.85 * P);
          ctx.stroke();
        }
      }
      ctx.fillStyle = L.bronze;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.ellipse(brx * 0.35, cy - bry * 0.45, brx * 0.35, bry * 0.2, -0.4, 0, P * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const dx of [-1, 0, 1]) { ctx.moveTo(brx * 0.7 + dx, cy - bry * 0.1); ctx.lineTo(brx * 0.72 + dx * 1.4, cy + bry * 0.5); }
      ctx.stroke();
      wing(front.arm, 1);
      // A bare blue head on a long neck; the snood and wattle swell red with the meter.
      limb(ctx, [brx * 0.45, cy - bry * 0.6, r * 0.2, hy + r * 0.5], lw * 1.3, L.face);
      disc(ctx, 0, hy, r * 0.92, L.face, 1.8);
      const swell = 1 + 0.5 * meter;
      const red = full ? '#ff2a1f' : L.red;
      ctx.beginPath();
      ctx.moveTo(r * 0.8, hy - r * 0.2);
      ctx.lineTo(r * 1.75, hy + r * 0.05);
      ctx.lineTo(r * 0.8, hy + r * 0.3);
      ctx.closePath();
      fill(ctx, L.beak, 1.2);
      const wob = Math.sin(t * 0.5) * 1.2;
      ctx.beginPath();
      ctx.ellipse(r * 0.7 + wob * 0.3, hy + r * 0.85, r * 0.24 * swell, r * 0.5 * swell, 0.2, 0, P * 2);
      fill(ctx, red, 1.1);
      ctx.beginPath();
      ctx.moveTo(r * 0.85, hy - r * 0.35);
      ctx.quadraticCurveTo(r * (1.5 + 0.3 * meter), hy - r * 0.1, r * (1.3 + 0.2 * meter) + wob * 0.4, hy + r * (0.65 + 0.4 * meter));
      ctx.quadraticCurveTo(r * 1.05, hy + r * 0.2, r * 0.75, hy - r * 0.15);
      ctx.closePath();
      fill(ctx, red, 1);
      disc(ctx, r * 0.35, hy - r * 0.15, Math.max(1.6, r * 0.27), '#fafafa', 1);
      eye(ctx, r * 0.4, hy - r * 0.15, Math.max(1, r * 0.15), pose);
      break;
    }

    // ── Pilgrim: a doublet in the slot color with a wide white collar and cuffs, a tall black hat with a buckled
    // band, breeches, white stockings and buckled shoes, and the brass blunderbuss. Harvest sheaves pile up in a
    // bundle on his back (one per sheaf); with all three the blunderbuss muzzle glows, loaded with a cannonball.
    case 'pilgrim': {
      const L = LOOK.pilgrim;
      const sheaves = full ? 3 : Math.round(meter * 3);
      if (sheaves > 0) {
        // The wheat bundle on his back.
        if (full) glow(ctx, -r * 0.9, sy - r * 0.6, r * 2.2, L.wheat, 0.8);
        for (let i = 0; i < sheaves * 2; i++) {
          const k = i / Math.max(1, sheaves * 2 - 1) - 0.5;
          const x0 = -r * 0.8, y0 = hipY;
          const x1 = -r * (1.0 + k * 0.9), y1 = sy - r * (1.4 - Math.abs(k) * 0.5);
          limb(ctx, [x0, y0, x1, y1], 0.8, '#c99a3a');
          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
          ctx.beginPath();
          ctx.ellipse(1.5, 0, 3.2, 1.5, 0, 0, P * 2);
          fill(ctx, L.wheat, 0.8);
          ctx.restore();
        }
        ctx.fillStyle = full ? A : '#a0702a';
        ctx.fillRect(-r * 1.2, sy + (hipY - sy) * 0.3, r * 0.8, 2);
      }
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW * 0.95, shade(L.stocking, k), 2);
        shoe(ctx, l, legW, PALETTE.ink);
        ctx.fillStyle = LOOK.gold;
        ctx.fillRect(l[4]! + legW * 0.15, l[5]! - legW * 0.45, legW * 0.6, legW * 0.4);
        limb(ctx, upper(l), legW * 1.35, shade(L.breeches, k));
      };
      const arm = (a: readonly number[] | undefined, k: number) => {
        if (!a) return;
        limb(ctx, a, armW, shade(A, k * 0.85));
        const [cx, cy] = along(a, 0.82);
        disc(ctx, cx, cy, armW * 0.85, L.collar, 1);
        disc(ctx, a[4]!, a[5]!, armW * 0.6, shade(LOOK.skin, k));
      };
      arm(back.arm, 0.85);
      leg(back.leg, 0.85);
      leg(front.leg, 1);
      // Doublet, a short skirt below the belt, the belt and its big square buckle.
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, hipY);
      ctx.lineTo(r * 0.85, hipY);
      ctx.lineTo(r * 1.05, hipY + 5);
      ctx.lineTo(-r * 1.05, hipY + 5);
      ctx.closePath();
      fill(ctx, shade(A, 0.8), 1.4);
      torso(ctx, sy - 1, hipY + 1, r * 0.95, r * 0.82, A);
      for (const k of [0.2, 0.45, 0.7]) disc(ctx, r * 0.4, sy + (hipY - sy) * k, 0.8, shade(A, 0.5), 0);
      ctx.fillStyle = L.belt;
      ctx.fillRect(-r * 0.86, hipY - 2.6, r * 1.72, 3.2);
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(r * 0.12, hipY - 3, r * 0.5, 4);
      // The blunderbuss: wooden stock behind the hand, brass barrel, flared bell.
      if (front.hand) {
        const h = front.hand;
        // Held up at the ready between attacks, so it doesn't drag on the floor.
        const ang = pose.attack || pose.punch ? h.angle : P * 0.72;
        const fx = Math.sin(ang), fy = Math.cos(ang);
        const ex = h.x + fx * 18, ey = h.y + fy * 18;
        limb(ctx, [h.x - fx * 7, h.y - fy * 7, h.x + fx * 4, h.y + fy * 4], 3.4, L.wood);
        limb(ctx, [h.x + fx * 4, h.y + fy * 4, ex, ey], 2.2, L.brass);
        ctx.beginPath();
        ctx.moveTo(ex - fy * 1.6, ey + fx * 1.6);
        ctx.lineTo(ex + fx * 4 - fy * 4, ey + fy * 4 + fx * 4);
        ctx.lineTo(ex + fx * 4 + fy * 4, ey + fy * 4 - fx * 4);
        ctx.lineTo(ex + fy * 1.6, ey - fx * 1.6);
        ctx.closePath();
        fill(ctx, L.brass, 1);
        if (full) {
          glow(ctx, ex + fx * 4, ey + fy * 4, 10, L.hot, 0.9 + 0.2 * Math.sin(t * 0.7));
          disc(ctx, ex + fx * 4, ey + fy * 4, 2.6, PALETTE.ink, 0);
        }
      }
      arm(front.arm, 1);
      // Wide white collar over the shoulders.
      ctx.beginPath();
      ctx.ellipse(r * 0.05, sk.neckY + r * 0.3, r * 1.15, r * 0.45, 0, 0, P * 2);
      fill(ctx, L.collar, 1.1);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(r * 0.3, sk.neckY + 0.5); ctx.lineTo(r * 0.3, sk.neckY + r * 0.7); ctx.stroke();
      // Head: brown bob of hair, a sturdy face, the tall buckled hat.
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, hy + r * 0.15, r * 0.95, r * 0.95, 0, 0, P * 2);
      fill(ctx, L.hair, 1.4);
      disc(ctx, r * 0.05, hy, r * 0.95, LOOK.skin, 1.8);
      ctx.fillStyle = LOOK.cheek;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(r * 0.3, hy + r * 0.35, r * 0.2, 0, P * 2); ctx.fill();
      ctx.globalAlpha = 1;
      eye(ctx, r * 0.5, hy - r * 0.05, Math.max(1, r * 0.15), pose);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(r * 0.3, hy - r * 0.35); ctx.lineTo(r * 0.75, hy - r * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.4, hy + r * 0.5); ctx.lineTo(r * 0.8, hy + r * 0.45); ctx.stroke();
      const capY = hy - r * 0.55;
      ctx.beginPath();
      ctx.ellipse(0, capY, r * 1.65, r * 0.28, 0, 0, P * 2);
      fill(ctx, L.hat, 1.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, capY);
      ctx.lineTo(-r * 0.7, capY - r * 1.55);
      ctx.lineTo(r * 0.7, capY - r * 1.55);
      ctx.lineTo(r * 0.85, capY);
      ctx.closePath();
      fill(ctx, L.hat, 1.2);
      ctx.fillStyle = L.belt;
      ctx.fillRect(-r * 0.82, capY - r * 0.5, r * 1.64, r * 0.38);
      ctx.strokeStyle = LOOK.gold;
      ctx.lineWidth = 1.3;
      ctx.strokeRect(-r * 0.15, capY - r * 0.56, r * 0.5, r * 0.5);
      break;
    }

    // ── Chief: an original Wampanoag-inspired fighter, drawn plainly and respectfully. Long dark hair, a beaded
    // headband in the slot color with two simple feathers, a fringed deerskin tunic with a beaded yoke and a
    // breechcloth in the slot color, a wampum sash, leggings and moccasins, and the canoe paddle. The Three
    // Sisters hang from the belt (corn, bean, squash) and light up as they grow; with all three the paddle runs
    // with water for the Tidal Sweep.
    case 'firstlight': {
      const L = LOOK.chief;
      const sway = Math.sin(t * 0.35) * 1.5;
      // Long hair down the back.
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, hy - r * 0.2);
      ctx.quadraticCurveTo(-r * 1.5 + sway, hy + r * 1.6, -r * 1.1 + sway, hy + r * 2.9);
      ctx.lineTo(-r * 0.35 + sway, hy + r * 2.7);
      ctx.quadraticCurveTo(-r * 0.5, hy + r * 1.4, r * 0.1, hy + r * 0.4);
      ctx.closePath();
      fill(ctx, L.hair, 1.2);
      ctx.fillStyle = A;
      ctx.fillRect(-r * 1.3 + sway * 0.6, hy + r * 1.6, r * 0.85, r * 0.3);
      const leg = (l: readonly number[] | undefined, k: number) => {
        if (!l) return;
        limb(ctx, l, legW, shade(L.hide, k));
        shoe(ctx, l, legW, shade(L.moccasin, k));
        // Fringe down the outside of the legging.
        ctx.strokeStyle = shade(L.fringe, k);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (const kk of [0.35, 0.7]) {
          const [x, y] = along(l, kk);
          ctx.moveTo(x - legW * 0.6, y); ctx.lineTo(x - legW * 1.2, y + 1.5);
        }
        ctx.stroke();
      };
      const arm = (a: readonly number[] | undefined, k: number) => {
        if (!a) return;
        limb(ctx, a, armW, shade(L.skin, k));
        limb(ctx, upper(a, 0, 0.45), armW * 1.5, shade(L.hide, k));
        const [bx, by] = along(a, 0.05);
        disc(ctx, bx, by, armW * 0.75, shade(A, k), 1);
        disc(ctx, a[4]!, a[5]!, armW * 0.6, shade(L.skin, k));
      };
      arm(back.arm, 0.85);
      leg(back.leg, 0.85);
      // Fringed deerskin tunic with a beaded yoke in the slot color.
      torso(ctx, sy - 1, hipY + 2, r * 0.9, r * 0.85, L.hide);
      ctx.strokeStyle = L.fringe;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let x = -r * 0.75; x <= r * 0.8; x += r * 0.25) { ctx.moveTo(x, hipY + 2); ctx.lineTo(x - 0.3, hipY + 4.5); }
      ctx.stroke();
      ctx.fillStyle = A;
      ctx.fillRect(-r * 0.9, sy, r * 1.8, 3);
      ctx.fillStyle = L.shell;
      for (let x = -r * 0.7; x < r * 0.9; x += r * 0.4) {
        ctx.beginPath(); ctx.moveTo(x, sy + 0.3); ctx.lineTo(x + 1.1, sy + 1.5); ctx.lineTo(x, sy + 2.7); ctx.lineTo(x - 1.1, sy + 1.5); ctx.closePath(); ctx.fill();
      }
      // Wampum sash: purple and white shell beads across the chest.
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        disc(ctx, -r * 0.7 + k * r * 1.4, sy + 4 + k * (hipY - sy - 6), 1.25, i % 2 ? L.shell : L.wampum, 0.5);
      }
      ctx.fillStyle = L.fringe;
      ctx.fillRect(-r * 0.86, hipY - 1.5, r * 1.72, 2.4);
      leg(front.leg, 1);
      // Breechcloth in the slot color, a white zigzag along its hem.
      const flapY = hipY + sk.legLen * 0.42;
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, hipY);
      ctx.lineTo(r * 0.75, hipY);
      ctx.lineTo(r * 0.85, flapY);
      ctx.lineTo(-r * 0.2, flapY);
      ctx.closePath();
      fill(ctx, A, 1.3);
      ctx.strokeStyle = L.shell;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const x = -r * 0.12 + (i / 5) * r * 0.9;
        ctx.lineTo(x, flapY - 2 - (i % 2) * 1.6);
      }
      ctx.stroke();
      // The Three Sisters hang from the belt as they grow.
      const grown = full ? SISTERS.all : pose.sisters ?? 0;
      const charm = (bit: number, x: number, draw: (x: number, y: number) => void) => {
        if ((grown & bit) === 0) return;
        if (full) glow(ctx, x, hipY + 3, 4.5, LOOK.gold, 0.8);
        draw(x, hipY + 3);
      };
      charm(SISTERS.corn, -r * 0.7, (x, y) => {
        ctx.beginPath(); ctx.ellipse(x, y, 1.3, 2.6, 0, 0, P * 2); fill(ctx, L.corn, 0.7);
        feather(ctx, x, y + 2, -P / 2 - 0.5, 4, 0.9, L.husk, 0.5);
      });
      charm(SISTERS.beans, -r * 0.4, (x, y) => {
        ctx.beginPath(); ctx.ellipse(x, y, 1.1, 2.6, 0.35, 0, P * 2); fill(ctx, L.bean, 0.7);
      });
      charm(SISTERS.squash, -r * 1.0, (x, y) => {
        ctx.beginPath(); ctx.ellipse(x, y + 0.4, 2.2, 1.9, 0, 0, P * 2); fill(ctx, L.squash, 0.7);
      });
      // The canoe paddle: a long shaft through the hand and a leaf-shaped blade.
      if (front.hand) {
        const h = front.hand;
        // Planted upright like a staff between attacks, blade up.
        const ang = pose.attack || pose.punch ? h.angle : P * 0.95;
        const fx = Math.sin(ang), fy = Math.cos(ang);
        const bx = h.x + fx * 26, by = h.y + fy * 26;
        limb(ctx, [h.x - fx * 12, h.y - fy * 12, bx, by], 2.4, L.paddle);
        if (full) glow(ctx, bx + fx * 8, by + fy * 8, 14, L.water, 0.9);
        ctx.save();
        ctx.translate(bx + fx * 8, by + fy * 8);
        ctx.rotate(Math.atan2(fy, fx));
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 4.5, 0, 0, P * 2);
        fill(ctx, full ? L.water : L.paddle, 1.4);
        ctx.fillStyle = A;
        ctx.fillRect(-7, -1, 4, 2);
        if (full) {
          ctx.strokeStyle = '#e8fbff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(1, 0, 2.6, P * 0.2, P * 1.5 + Math.sin(t * 0.5));
          ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const k = (t * 0.04 + i / 3) % 1;
            ctx.globalAlpha = 1 - k;
            disc(ctx, 9 + k * 8, Math.sin(i * 2.1) * 4, 1.3, L.water, 0);
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      arm(front.arm, 1);
      // Head: hair over the top, calm face, beaded headband with two simple feathers at the back.
      ctx.beginPath();
      ctx.ellipse(-r * 0.2, hy - r * 0.08, r * 1.05, r * 1.05, 0, 0, P * 2);
      fill(ctx, L.hair, 1.6);
      ctx.beginPath();
      ctx.ellipse(r * 0.2, hy + r * 0.1, r * 0.82, r * 0.88, 0, 0, P * 2);
      fill(ctx, L.skin, 0);
      eye(ctx, r * 0.55, hy - r * 0.05, Math.max(1, r * 0.15), pose);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(r * 0.45, hy + r * 0.48); ctx.lineTo(r * 0.8, hy + r * 0.46); ctx.stroke();
      const tilt = Math.sin(t * 0.3) * 0.05;
      for (const [fx, lean, col] of [[-0.7, -0.4, L.shell], [-0.95, -0.7, L.fringe]] as const) {
        ctx.save();
        ctx.translate(r * fx, hy - r * 0.55);
        ctx.rotate(lean + tilt);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.75, r * 0.2, r * 0.75, 0, 0, P * 2);
        fill(ctx, col, 1);
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.3, r * 0.15, r * 0.2, 0, 0, P * 2);
        ctx.fill();
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 1.4); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.rect(-r * 1.04, hy - r * 0.62, r * 2.08, r * 0.34);
      fill(ctx, A, 1);
      ctx.fillStyle = L.shell;
      for (let x = -r * 0.75; x < r; x += r * 0.38) ctx.fillRect(x - 0.6, hy - r * 0.51, 1.2, 1.2);
      break;
    }

    default:
      break;
  }
}

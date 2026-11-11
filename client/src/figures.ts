// The fighters, drawn as stick figures with the Canvas 2D API (ADR-0072; placeholder art, owner's request
// 2026-11-10). Each one has its own silhouette: the Brawler's gloves and headband, the Blade's sword, the
// Spark's pointed hat, the Titan's size and boxy head. Local units around the body centre, y down, facing +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { FIGHTERS } from '../../shared/fighter/fighters';
import { PALETTE } from './config';
import type { AttackPose } from './moveLooks';

export interface FigurePose {
  color: string;
  /** Animation phase (radians). */
  phase: number;
  /** 0..1, eyelid closed amount. */
  blink: number;
  /** Damage flash 0..1. */
  flash: number;
  /** 0..1: rising in the air (arms up, legs tucked). */
  thrust: number;
  /** 0..1, how fast the legs are running. */
  stride?: number;
  /** An attack is landing: punch forward. */
  punch?: boolean;
  /** The attack being done, and how far into its swing: 0 = wound up, 1 = fully out. */
  attack?: AttackPose;
  strike?: number;
  /** 0..1: the Brawler's rage (glowing gloves when full). */
  rage?: number;
}

/**
 * Placeholder stick figures, sized to each fighter's collision box.
 */
/** Sword length past the hand, in local units (matches the Blade's tip hitboxes). */
const SWORD_LENGTH = 40;

function stickFigure(ctx: CanvasRenderingContext2D, id: FighterId, pose: FigurePose): void {
  const def = FIGHTERS[id];
  const titan = id === 'titan';
  const H = def.height + (titan ? 8 : 6);
  const lw = Math.max(2, H * (titan ? 0.12 : id === 'spark' ? 0.08 : 0.09));
  const headR = H * (titan ? 0.14 : 0.17);
  const headY = -0.5 * H + headR;
  const neckY = headY + headR;
  const shoulderY = neckY + H * 0.08;
  const hipY = H * 0.12;
  const footY = 0.5 * H;
  const legLen = footY - hipY;
  const armLen = H * (titan ? 0.34 : 0.3);
  const stride = pose.stride ?? 0;
  const swing = Math.sin(pose.phase * 0.35) * 0.7 * stride;
  const airborne = stride === 0 && pose.thrust > 0.4;
  const hipW = titan ? H * 0.1 : 0;
  const shoulderW = titan ? H * 0.12 : 0;

  const limbs = new Path2D();
  // Spine (the Titan has broad shoulders).
  limbs.moveTo(0, neckY);
  limbs.lineTo(0, hipY);
  if (titan) { limbs.moveTo(-shoulderW, shoulderY); limbs.lineTo(shoulderW, shoulderY); }
  // Legs: running swing on the ground, tucked in the air.
  const leg = (angle: number, side: number) => {
    const kneeX = side * hipW + Math.sin(angle) * legLen * 0.5;
    const kneeY = hipY + Math.cos(angle) * legLen * 0.5;
    const bend = airborne ? 0.9 : 0.25;
    limbs.moveTo(side * hipW, hipY);
    limbs.lineTo(kneeX, kneeY);
    limbs.lineTo(kneeX + Math.sin(angle - bend) * legLen * 0.5, kneeY + Math.cos(angle - bend) * legLen * 0.5);
  };
  // Arms: angle 0 hangs down, PI/2 points forward, PI points up. The first arm drawn is the front one.
  const hands: { x: number; y: number; angle: number }[] = [];
  const arm = (angle: number, reach = 1) => {
    const sx = hands.length === 0 ? shoulderW : -shoulderW;
    limbs.moveTo(sx, shoulderY);
    const elbowX = sx + Math.sin(angle) * armLen * 0.5 * reach;
    const elbowY = shoulderY + Math.cos(angle) * armLen * 0.5 * reach;
    limbs.lineTo(elbowX, elbowY);
    const hx = sx + Math.sin(angle) * armLen * reach;
    const hy = shoulderY + Math.cos(angle) * armLen * reach;
    limbs.lineTo(hx, hy);
    hands.push({ x: hx, y: hy, angle });
  };
  const straightLeg = (angle: number, side: number, reach = 1) => {
    limbs.moveTo(side * hipW, hipY);
    limbs.lineTo(side * hipW + Math.sin(angle) * legLen * reach, hipY + Math.cos(angle) * legLen * reach);
  };
  const k = Math.max(0, Math.min(1, pose.strike ?? 1));
  const wind = (from: number, to: number) => from + (to - from) * k;
  const P = Math.PI;
  switch (pose.attack) {
    case 'punch':
      leg(0.35, 1); leg(-0.35, -1);
      arm(wind(-0.4, P / 2), wind(0.8, 1.45)); arm(wind(0.8, -0.5));
      break;
    case 'kick':
      straightLeg(wind(0.3, 1.55), 1, wind(0.8, 1.2)); leg(-0.1, -1);
      arm(P * 0.75); arm(-0.6);
      break;
    case 'backkick':
      straightLeg(wind(-0.3, -1.6), 1, wind(0.8, 1.25)); leg(0.2, -1);
      arm(P * 0.6); arm(P * 0.4);
      break;
    case 'uppercut':
      leg(0.3, 1); leg(-0.3, -1);
      arm(wind(0.6, P * 0.97), wind(0.8, 1.5)); arm(-0.4);
      break;
    case 'low':
      leg(1.2, 1); leg(-0.9, -1);
      straightLeg(wind(0.6, 1.45), 1, 1.15);
      arm(wind(0.2, 1.1), 1.2); arm(-0.8);
      break;
    case 'spin':
      straightLeg(1.3, 1); straightLeg(-1.3, -1);
      arm(P / 2, 1.3); arm(-P / 2, 1.3);
      break;
    case 'stomp':
      straightLeg(0.12, 1, 1.1); straightLeg(-0.12, -1, 1.1);
      arm(P * 0.85, 1.2); arm(-P * 0.85, 1.2);
      break;
    case 'spike':
      leg(0.8, 1); leg(-0.6, -1);
      arm(wind(P * 0.9, 0.15), 1.45); arm(wind(-P * 0.8, -0.1), 1.3);
      break;
    case 'grab':
      leg(0.35, 1); leg(-0.35, -1);
      arm(P / 2 - 0.15, wind(0.7, 1.35)); arm(P / 2 + 0.15, wind(0.7, 1.35));
      break;
    case 'throw':
      leg(0.4, 1); leg(-0.4, -1);
      arm(wind(P / 2, P * 0.95), 1.3); arm(wind(P / 2, P * 0.9), 1.3);
      break;
    case 'cast':
      leg(0.3, 1); leg(-0.4, -1);
      arm(P / 2 + 0.1, wind(0.6, 1.4)); arm(P / 2 - 0.1, wind(0.6, 1.4));
      break;
    case 'counter':
      leg(0.3, 1); leg(-0.3, -1);
      arm(P * 0.62, 1.1); arm(P * 0.42, 1.1);
      break;
    case 'dash':
      straightLeg(-1.0, 1); straightLeg(-1.3, -1);
      arm(P / 2, 1.45); arm(P * 0.6, 1.2);
      break;
    case 'rise':
      straightLeg(0.1, 1); straightLeg(-0.1, -1);
      arm(P, 1.4); arm(P * 0.9, 1.3);
      break;
    // Sword swings: the front arm sweeps and the blade follows it.
    case 'slash':
      leg(0.45, 1); leg(-0.35, -1);
      arm(wind(P * 0.9, P * 0.38), 1.3); arm(-0.5);
      break;
    case 'overhead':
      leg(0.55, 1); leg(-0.45, -1);
      arm(wind(P * 1.15, P * 0.42), 1.35); arm(wind(P * 1.05, P * 0.5), 1.1);
      break;
    case 'thrust':
      leg(0.6, 1); leg(-0.6, -1);
      arm(P / 2, wind(0.5, 1.5)); arm(-0.9);
      break;
    case 'upslash':
      leg(0.3, 1); leg(-0.3, -1);
      arm(wind(P * 0.3, P * 1.02), 1.3); arm(-0.4);
      break;
    case 'lowslash':
      leg(1.2, 1); leg(-0.9, -1);
      arm(wind(P * 0.12, P * 0.55), 1.3); arm(-0.8);
      break;
    case 'backslash':
      leg(0.2, 1); leg(-0.4, -1);
      arm(wind(P * 0.7, -P * 0.55), 1.3); arm(P * 0.4);
      break;
    case 'downstab':
      leg(0.8, 1); leg(-0.6, -1);
      arm(wind(P * 0.7, 0.04), 1.3); arm(wind(P * 0.6, 0.1), 1.1);
      break;
    default:
      if (airborne) { leg(0.6, 1); leg(-0.2, -1); } else { leg(swing + 0.15, 1); leg(-swing - 0.15, -1); }
      // Arms: punch forward when attacking, up when flying, swinging when running.
      if (pose.punch) { arm(P / 2); arm(0.4); }
      else if (airborne) { arm(P * 0.8); arm(-P * 0.8); }
      else if (id === 'blade') { arm(P * 0.42 - swing * 0.2, 1.05); arm(swing - 0.3); }
      else if (id === 'brawler') { arm(P * 0.62 + swing * 0.15, 0.85); arm(P * 0.5 - swing * 0.15, 0.75); }
      else { arm(-swing + 0.3); arm(swing - 0.3); }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The Blade's sword, behind the arm: from the front hand along the forearm.
  if (id === 'blade' && hands[0]) {
    const h = hands[0];
    const ex = h.x + Math.sin(h.angle) * SWORD_LENGTH;
    const ey = h.y + Math.cos(h.angle) * SWORD_LENGTH;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#e6edf2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Cross guard.
    const gx = Math.cos(h.angle) * 5;
    const gy = -Math.sin(h.angle) * 5;
    ctx.strokeStyle = pose.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(h.x + Math.sin(h.angle) * 3 - gx, h.y + Math.cos(h.angle) * 3 - gy);
    ctx.lineTo(h.x + Math.sin(h.angle) * 3 + gx, h.y + Math.cos(h.angle) * 3 + gy);
    ctx.stroke();
  }

  // Dark outline under the color so figures read against any background.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw + 2.5;
  ctx.stroke(limbs);
  ctx.strokeStyle = pose.color;
  ctx.lineWidth = lw;
  ctx.stroke(limbs);

  // The Brawler's gloves (glowing red at full rage); the Spark's glowing hands.
  if (id === 'brawler' || id === 'spark') {
    const raging = (pose.rage ?? 0) >= 1;
    for (const h of hands) {
      const r = id === 'brawler' ? lw * 1.15 : lw * 0.8;
      if (raging || id === 'spark') {
        const glow = raging ? '#ff3b3b' : pose.color;
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r * 3.2);
        g.addColorStop(0, glow + 'cc');
        g.addColorStop(1, glow + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = id === 'brawler' ? (raging ? '#ff3b3b' : PALETTE.white) : '#ffffff';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Head.
  ctx.fillStyle = PALETTE.white;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (titan) ctx.roundRect(-headR, headY - headR, headR * 2, headR * 2, headR * 0.3);
  else ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eye, facing forward; shut while blinking or stunned.
  ctx.fillStyle = PALETTE.ink;
  if (pose.blink > 0.5) ctx.fillRect(headR * 0.25, headY - 0.5, headR * 0.5, 1.5);
  else {
    ctx.beginPath();
    ctx.arc(headR * 0.45, headY - headR * 0.1, Math.max(1.2, headR * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  // Headgear.
  const capY = headY - headR;
  ctx.fillStyle = pose.color;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  if (id === 'brawler') {
    // Headband with tails flying behind.
    ctx.fillRect(-headR, headY - headR * 0.55, headR * 2, headR * 0.4);
    const flap = Math.sin(pose.phase * 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, headY - headR * 0.5);
    ctx.lineTo(-headR * 2.1, headY - headR * 0.2 + flap);
    ctx.lineTo(-headR * 1.9, headY + headR * 0.15 + flap);
    ctx.closePath();
    ctx.fill();
  } else if (id === 'blade') {
    // A topknot.
    ctx.beginPath();
    ctx.arc(-headR * 0.35, capY - headR * 0.15, headR * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'spark') {
    // Pointed hat with a wide brim, tip bending back.
    ctx.beginPath();
    ctx.moveTo(-headR * 1.5, capY + headR * 0.45);
    ctx.lineTo(headR * 1.5, capY + headR * 0.45);
    ctx.lineTo(headR * 0.5, capY + headR * 0.1);
    ctx.lineTo(-headR * 1.1, capY - headR * 1.9);
    ctx.lineTo(-headR * 0.6, capY + headR * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.arc(-headR * 1.1, capY - headR * 1.9, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (titan) {
    // A brow plate and a belt.
    ctx.fillRect(-headR, capY - 2, headR * 2, 5);
    ctx.fillRect(-hipW - 3, hipY - 3, hipW * 2 + 6, 6);
  }
  ctx.restore();
}

export function drawFighterFigure(ctx: CanvasRenderingContext2D, id: FighterId, pose: FigurePose): void {
  stickFigure(ctx, id, pose);
  if (pose.flash > 0) {
    // Damage flash: a white burst over the body.
    const big = id === 'titan';
    ctx.save();
    ctx.globalAlpha = pose.flash * 0.75;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 0, big ? 30 : 18, big ? 34 : 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

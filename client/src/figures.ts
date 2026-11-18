// The fighters, drawn as stick figures with the Canvas 2D API (ADR-0072, ADR-0073; placeholder art, owner's
// request 2026-11-10). Each one has its own silhouette: the Brawler's gloves and headband, the Blade's sword,
// the Spark's pointed hat, the Titan's size and boxy head, the Ninja's hood, the Gunslinger's hat and revolver,
// the Chef's toque and pan, the Ghost's sheet, the Yo-yo Kid's cap and yo-yo, the Bard's guitar, and the secret
// River's round belly and propeller beanie (ADR-0077). Seasonal (ADR-0082): the Turkey's tail fan, beak and wattle,
// the Pilgrim's tall buckled hat, white collar and blunderbuss, and Sachem's long hair, deerskin mantle,
// wampum sash and canoe paddle (drawn plainly: no headdress, no caricature).
// Local units around the body centre, y down, facing +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { FIGHTERS } from '../../shared/fighter/fighters';
import { cheatOn } from './cheats';
import { CHEAT_LOOKS, PALETTE } from './config';
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
  const river = id === 'river';
  const headR0 = H * (titan ? 0.14 : 0.17);
  // BIGHEAD cheat: the head grows upward from the neck, the body stays put.
  const headR = headR0 * (cheatOn('bigHead') ? CHEAT_LOOKS.bigHead : 1);
  const neckY = -0.5 * H + 2 * headR0;
  const headY = neckY - headR;
  const shoulderY = neckY + H * 0.08;
  const hipY = H * 0.12;
  const footY = 0.5 * H;
  const legLen = footY - hipY;
  const armLen = H * (titan ? 0.34 : 0.3);
  const stride = pose.stride ?? 0;
  const swing = Math.sin(pose.phase * 0.35) * 0.7 * stride;
  const airborne = stride === 0 && pose.thrust > 0.4;
  const hipW = titan ? H * 0.1 : river ? H * 0.16 : 0;
  const shoulderW = titan ? H * 0.12 : river ? H * 0.2 : 0;

  const limbs = new Path2D();
  // Spine (the Titan has broad shoulders).
  limbs.moveTo(0, neckY);
  limbs.lineTo(0, hipY);
  if (titan || river) { limbs.moveTo(-shoulderW, shoulderY); limbs.lineTo(shoulderW, shoulderY); }
  // Legs: running swing on the ground, tucked in the air.
  const ghost = id === 'ghost';
  const leg = (angle: number, side: number) => {
    if (ghost) return; // The Ghost floats: a sheet, no legs.
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
    if (ghost) return;
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
    case 'shoot':
      leg(0.35, 1); leg(-0.35, -1);
      arm(P / 2 + 0.05, wind(0.8, 1.45)); arm(-0.3);
      break;
    case 'strum':
      leg(0.35, 1); leg(-0.35, -1);
      arm(wind(P * 0.35, P * 0.15), 0.9); arm(P * 0.55, 1.1);
      break;
    default:
      if (airborne) { leg(0.6, 1); leg(-0.2, -1); } else { leg(swing + 0.15, 1); leg(-swing - 0.15, -1); }
      // Arms: punch forward when attacking, up when flying, swinging when running.
      if (pose.punch) { arm(P / 2); arm(0.4); }
      else if (airborne) { arm(P * 0.8); arm(-P * 0.8); }
      else if (id === 'blade') { arm(P * 0.42 - swing * 0.2, 1.05); arm(swing - 0.3); }
      else if (id === 'bard') { arm(P * 0.3, 0.9); arm(P * 0.55, 1.1); }
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

  // The Ghost's sheet: from the head down to a wavy hem.
  if (ghost) {
    const w = H * 0.36;
    const hem = footY - 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, headY);
    ctx.lineTo(-w, hem);
    for (let i = 0; i < 4; i++) {
      const x0 = -w + (i * 2 * w) / 4;
      const wave = Math.sin(pose.phase * 0.4 + i) * 2.5;
      ctx.quadraticCurveTo(x0 + w / 4, hem - 6 + wave, x0 + w / 2, hem + wave);
    }
    ctx.lineTo(w * 0.8, headY);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = PALETTE.white;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pose.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // The Bard's guitar, across the body.
  if (id === 'bard') {
    ctx.save();
    ctx.translate(H * 0.05, hipY - H * 0.05);
    ctx.rotate(-0.6);
    ctx.fillStyle = '#b5652b';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 7, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(-3, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3415';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.restore();
  }

  // River's big round belly, behind the limbs, wobbling as he moves.
  if (river) {
    const wob = Math.sin(pose.phase * 0.35) * (stride ? 1.5 : 0.6);
    const by = (shoulderY + hipY) / 2 + H * 0.04;
    ctx.fillStyle = pose.color;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(H * 0.06, by, H * 0.36 + wob, H * 0.3 - wob * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // A shine and a belly button.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(H * 0.16, by - H * 0.12, H * 0.09, H * 0.05, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(H * 0.2, by + H * 0.04, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // The Turkey's tail fan and round body, behind the limbs.
  if (id === 'turkey') {
    const cy = (shoulderY + hipY) / 2;
    const fanR = H * 0.5;
    const fanX = -H * 0.16;
    const colors = ['#7a4a22', '#c8642b', '#e8a03a', pose.color];
    for (let ring = 0; ring < colors.length; ring++) {
      const r = fanR * (1 - ring * 0.2);
      ctx.fillStyle = colors[ring]!;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fanX, cy);
      ctx.arc(fanX, cy, r, Math.PI * 0.75, Math.PI * 1.85);
      ctx.closePath();
      ctx.fill();
      if (ring === 0) ctx.stroke();
    }
    ctx.fillStyle = '#6b4226';
    ctx.strokeStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(0, cy, H * 0.22, H * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Sachem's deerskin mantle over the shoulders, and the wampum sash across it.
  if (id === 'firstlight') {
    ctx.fillStyle = '#b98a57';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-H * 0.14, shoulderY - 2);
    ctx.lineTo(H * 0.14, shoulderY - 2);
    ctx.lineTo(H * 0.11, hipY - H * 0.04);
    ctx.lineTo(-H * 0.11, hipY - H * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Fringe at the hem.
    ctx.strokeStyle = '#7d5a34';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let fx = -H * 0.1; fx <= H * 0.1; fx += H * 0.04) {
      ctx.moveTo(fx, hipY - H * 0.04);
      ctx.lineTo(fx, hipY + H * 0.02);
    }
    ctx.stroke();
    // Wampum: purple and white shell beads.
    const beads = 5;
    for (let i = 0; i < beads; i++) {
      const t = i / (beads - 1);
      ctx.fillStyle = i % 2 ? '#f4efe6' : '#5b3a86';
      ctx.beginPath();
      ctx.arc(-H * 0.1 + t * H * 0.2, shoulderY + H * 0.02 + t * H * 0.16, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
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

  // Held props in the front hand.
  const hand = hands[0];
  if (hand) {
    const fx = Math.sin(hand.angle);
    const fy = Math.cos(hand.angle);
    if (id === 'gunslinger') {
      // A revolver pointing along the arm.
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(hand.x + fx * 11, hand.y + fy * 11);
      ctx.stroke();
      ctx.strokeStyle = '#8d939a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(hand.x + fx * 11, hand.y + fy * 11);
      ctx.stroke();
    } else if (id === 'chef') {
      // A frying pan: handle along the arm, pan at the end.
      const px = hand.x + fx * 13;
      const py = hand.y + fy * 13;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.fillStyle = '#2b2d30';
      ctx.beginPath();
      ctx.ellipse(px + fx * 6, py + fy * 6, 8, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b7075';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (id === 'pilgrim') {
      // A blunderbuss along the arm, its muzzle flared.
      const ex = hand.x + fx * 18;
      const ey = hand.y + fy * 18;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(hand.x - fx * 6, hand.y - fy * 6);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = '#7a4a22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hand.x - fx * 6, hand.y - fy * 6);
      ctx.lineTo(hand.x + fx * 4, hand.y + fy * 4);
      ctx.stroke();
      ctx.strokeStyle = '#8d939a';
      ctx.beginPath();
      ctx.moveTo(hand.x + fx * 4, hand.y + fy * 4);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = '#8d939a';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex - fy * 2, ey + fx * 2);
      ctx.lineTo(ex + fx * 4 - fy * 4, ey + fy * 4 + fx * 4);
      ctx.lineTo(ex + fx * 4 + fy * 4, ey + fy * 4 - fx * 4);
      ctx.lineTo(ex + fy * 2, ey - fx * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (id === 'firstlight') {
      // A canoe paddle: a long shaft through the hand and a leaf-shaped blade at the far end.
      const bx = hand.x + fx * 26;
      const by = hand.y + fy * 26;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hand.x - fx * 12, hand.y - fy * 12);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = '#c99a5b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hand.x - fx * 12, hand.y - fy * 12);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.save();
      ctx.translate(bx + fx * 8, by + fy * 8);
      ctx.rotate(Math.atan2(fy, fx));
      ctx.fillStyle = '#c99a5b';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pose.color;
      ctx.fillRect(-7, -1, 4, 2);
      ctx.restore();
    } else if (id === 'yoyo') {
      // The yo-yo on its string: it shoots out along the arm when attacking.
      const out = pose.attack ? 6 + (pose.strike ?? 0) * 34 : 12;
      const yx = pose.attack ? hand.x + fx * out : hand.x;
      const yy = pose.attack ? hand.y + fy * out : hand.y + out;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(yx, yy);
      ctx.stroke();
      ctx.fillStyle = pose.color;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(yx, yy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Sachem's long dark hair, down the back, tied with a band in the slot color.
  if (id === 'firstlight') {
    ctx.fillStyle = '#1f1a17';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.25, headY - headR * 0.05, headR * 1.08, headR * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const sway = Math.sin(pose.phase * 0.35) * 1.5;
    ctx.beginPath();
    ctx.moveTo(-headR * 1.1, headY);
    ctx.quadraticCurveTo(-headR * 1.6 + sway, headY + headR * 1.6, -headR * 1.2 + sway, headY + headR * 2.8);
    ctx.lineTo(-headR * 0.5 + sway, headY + headR * 2.6);
    ctx.quadraticCurveTo(-headR * 0.7, headY + headR * 1.4, -headR * 0.2, headY + headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR * 1.35 + sway * 0.5, headY + headR * 1.3, headR * 0.8, headR * 0.28);
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
  } else if (id === 'ninja') {
    // A dark hood with an eye slit, and a sash tail behind.
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(0, headY, headR + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(-headR * 0.1, headY - headR * 0.35, headR * 1.05, headR * 0.45);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(headR * 0.5, headY - headR * 0.12, Math.max(1.2, headR * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pose.color;
    const flap = Math.sin(pose.phase * 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.8, headY - headR * 0.3);
    ctx.lineTo(-headR * 2.2, headY + flap);
    ctx.lineTo(-headR * 2.0, headY + headR * 0.4 + flap);
    ctx.closePath();
    ctx.fill();
  } else if (id === 'gunslinger') {
    // A wide-brimmed hat.
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath();
    ctx.ellipse(0, capY + headR * 0.35, headR * 1.9, headR * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-headR * 0.85, capY - headR * 0.7, headR * 1.7, headR * 1.05, headR * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR * 0.85, capY + headR * 0.05, headR * 1.7, headR * 0.25);
  } else if (id === 'chef') {
    // A tall white toque.
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(-headR * 0.8, capY - headR * 1.0, headR * 1.6, headR * 1.3);
    ctx.strokeRect(-headR * 0.8, capY - headR * 1.0, headR * 1.6, headR * 1.3);
    for (const dx of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.arc(headR * dx, capY - headR * 1.1, headR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR * 0.8, capY + headR * 0.05, headR * 1.6, headR * 0.25);
  } else if (ghost) {
    // A curl on top.
    ctx.strokeStyle = pose.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-headR * 0.2, capY - headR * 0.2, headR * 0.35, 0, Math.PI * 1.5);
    ctx.stroke();
  } else if (id === 'yoyo') {
    // A cap worn backwards.
    ctx.beginPath();
    ctx.arc(0, capY + headR * 0.55, headR * 0.98, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-headR * 1.7, capY + headR * 0.4, headR * 0.9, headR * 0.25);
  } else if (id === 'bard') {
    // A floppy beret with a feather.
    ctx.beginPath();
    ctx.ellipse(-headR * 0.2, capY + headR * 0.25, headR * 1.2, headR * 0.45, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff6c9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.6, capY + headR * 0.1);
    ctx.quadraticCurveTo(-headR * 1.6, capY - headR * 0.8, -headR * 2.0, capY - headR * 0.3);
    ctx.stroke();
  } else if (river) {
    // A propeller beanie; the propeller spins.
    ctx.beginPath();
    ctx.arc(0, capY + headR * 0.5, headR * 0.95, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-1, capY - headR * 0.45, 2, headR * 0.5);
    const spin = Math.cos(pose.phase * 0.6);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(0, capY - headR * 0.45, headR * 0.9 * Math.abs(spin) + 1, headR * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'turkey') {
    // A beak, a red wattle and a little crest in the slot color.
    ctx.fillStyle = '#f2b632';
    ctx.beginPath();
    ctx.moveTo(headR * 0.8, headY - headR * 0.2);
    ctx.lineTo(headR * 1.75, headY + headR * 0.05);
    ctx.lineTo(headR * 0.8, headY + headR * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const wob = Math.sin(pose.phase * 0.5) * 1.2;
    ctx.fillStyle = '#d8312b';
    ctx.beginPath();
    ctx.ellipse(headR * 0.95 + wob * 0.3, headY + headR * 0.75, headR * 0.22, headR * 0.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pose.color;
    ctx.beginPath();
    ctx.arc(0, capY + headR * 0.05, headR * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'pilgrim') {
    // A tall black hat with a buckled band, and a wide white collar.
    ctx.fillStyle = '#1f1f22';
    ctx.beginPath();
    ctx.ellipse(0, capY + headR * 0.4, headR * 1.6, headR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-headR * 0.85, capY + headR * 0.4);
    ctx.lineTo(-headR * 0.7, capY - headR * 1.3);
    ctx.lineTo(headR * 0.7, capY - headR * 1.3);
    ctx.lineTo(headR * 0.85, capY + headR * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR * 0.8, capY - headR * 0.05, headR * 1.6, headR * 0.35);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-headR * 0.25, capY - headR * 0.08, headR * 0.5, headR * 0.4);
    ctx.fillStyle = PALETTE.white;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, neckY);
    ctx.lineTo(headR * 0.9, neckY);
    ctx.lineTo(headR * 0.5, neckY + headR * 0.6);
    ctx.lineTo(-headR * 0.5, neckY + headR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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

// Side-view drone characters drawn with the Canvas 2D API (ADR-0070). The look carries over from
// Dronefight v1: carbon frames, white batteries, orange camera "eyes", props in the pilot's color.
// Drawn in local units around the body centre, y pointing down, nose toward +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { FIGHTERS } from '../../shared/fighter/fighters';
import { CHARACTER_ART, PALETTE } from './config';
import type { AttackPose } from './moveLooks';

export interface DronePose {
  color: string;
  /** Prop animation phase (radians). */
  phase: number;
  /** 0..1, eyelid closed amount. */
  blink: number;
  /** Damage flash 0..1. */
  flash: number;
  /** Props spinning hard (thrusting). */
  thrust: number;
  /** 0..1, how fast the legs are running (stick figures). */
  stride?: number;
  /** An attack is landing: punch forward (stick figures). */
  punch?: boolean;
  /** The attack being done, and how far into its swing: 0 = wound up, 1 = fully out (stick figures). */
  attack?: AttackPose;
  strike?: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** A spinning prop seen edge-on: a blurred disc and one flickering blade. */
function prop(ctx: CanvasRenderingContext2D, cx: number, cy: number, span: number, pose: DronePose, flip = false): void {
  ctx.save();
  ctx.globalAlpha = 0.28 + pose.thrust * 0.25;
  ctx.fillStyle = pose.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, span / 2, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = pose.color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const s = Math.sin(pose.phase * (flip ? -1 : 1)) * (span / 2);
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.lineTo(cx + s, cy);
  ctx.stroke();
  ctx.restore();
}

function motor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = PALETTE.metal;
  roundRect(ctx, x - w / 2, y, w, h, 1.5);
  ctx.fill();
}

/** The camera, which doubles as the drone's eye. */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: DronePose, accent: string): void {
  ctx.fillStyle = accent;
  roundRect(ctx, x - r * 1.3, y - r * 1.5, r * 2.6, r * 3, r * 0.6);
  ctx.fill();
  ctx.fillStyle = '#0b0c0d';
  ctx.beginPath();
  ctx.arc(x + r * 0.35, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + r * 0.65, y - r * 0.35, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  if (pose.blink > 0) {
    ctx.fillStyle = accent;
    ctx.fillRect(x - r * 0.7, y - r * 1.05, r * 2.2, r * 2.1 * pose.blink);
  }
}

function glowUnder(ctx: CanvasRenderingContext2D, w: number, y: number, color: string): void {
  const g = ctx.createRadialGradient(0, y, 0, 0, y, w);
  g.addColorStop(0, color + '66');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(-w, y - w, w * 2, w * 2);
}

function freestyle(ctx: CanvasRenderingContext2D, pose: DronePose, scale = 1, racer = false): void {
  ctx.save();
  ctx.scale(scale, scale);
  glowUnder(ctx, 30, 6, pose.color);
  // Antenna.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-11, -6);
  ctx.lineTo(-19, -15);
  ctx.stroke();
  ctx.fillStyle = pose.color;
  ctx.beginPath();
  ctx.arc(-19, -15, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Arms.
  ctx.fillStyle = PALETTE.carbon;
  roundRect(ctx, -27, 2, 54, 4, 2);
  ctx.fill();
  motor(ctx, -22, -5, 7, 8);
  motor(ctx, 22, -5, 7, 8);
  prop(ctx, -22, -7, 28, pose);
  prop(ctx, 22, -7, 28, { ...pose, phase: pose.phase + 1.3 });
  // Stack.
  roundRect(ctx, -12, -6, 24, 14, 3);
  ctx.fill();
  // Battery with a stripe of pilot color.
  ctx.fillStyle = PALETTE.white;
  roundRect(ctx, -12, racer ? -13 : -16, 20, racer ? 7 : 10, 2);
  ctx.fill();
  ctx.fillStyle = pose.color;
  ctx.fillRect(-12, racer ? -10.5 : -12, 20, 2.4);
  // Racer stripe on the frame.
  if (racer) {
    ctx.fillStyle = pose.color;
    ctx.fillRect(-26, 3, 10, 2);
    ctx.fillRect(16, 3, 10, 2);
  }
  eye(ctx, 14, 1, racer ? 4.2 : 3.6, pose, PALETTE.orange);
  ctx.restore();
}

function heavy(ctx: CanvasRenderingContext2D, pose: DronePose): void {
  glowUnder(ctx, 46, 10, pose.color);
  ctx.strokeStyle = PALETTE.carbon;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // Landing legs.
  ctx.beginPath();
  ctx.moveTo(-12, 10);
  ctx.lineTo(-24, 24);
  ctx.lineTo(-30, 24);
  ctx.moveTo(12, 10);
  ctx.lineTo(24, 24);
  ctx.lineTo(30, 24);
  ctx.stroke();
  // Long arms with coaxial motor pairs.
  ctx.fillStyle = PALETTE.carbon;
  roundRect(ctx, -44, -2, 88, 5, 2.5);
  ctx.fill();
  for (const x of [-38, 38]) {
    motor(ctx, x, -10, 9, 8);
    motor(ctx, x, 3, 9, 8);
    prop(ctx, x, -12, 38, pose);
    prop(ctx, x, 13, 38, { ...pose, phase: pose.phase + 2 }, true);
  }
  // Big plate and body.
  ctx.fillStyle = PALETTE.carbon;
  roundRect(ctx, -20, -12, 40, 22, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.steel;
  roundRect(ctx, -18, 6, 36, 6, 2);
  ctx.fill();
  // Twin batteries.
  ctx.fillStyle = PALETTE.white;
  roundRect(ctx, -18, -24, 16, 12, 2);
  ctx.fill();
  roundRect(ctx, 0, -24, 16, 12, 2);
  ctx.fill();
  ctx.fillStyle = pose.color;
  ctx.fillRect(-18, -19, 34, 3);
  eye(ctx, 21, -1, 5, pose, PALETTE.orange);
}

function flipper(ctx: CanvasRenderingContext2D, pose: DronePose): void {
  glowUnder(ctx, 30, 0, pose.color);
  // Symmetric frame: props above and below (reversible motors).
  ctx.fillStyle = PALETTE.carbon;
  roundRect(ctx, -27, -2, 54, 4, 2);
  ctx.fill();
  for (const x of [-22, 22]) {
    motor(ctx, x, -6, 7, 12);
    prop(ctx, x, -8, 28, pose);
    prop(ctx, x, 8, 28, { ...pose, phase: pose.phase + 1.6 }, true);
  }
  // Rounded body with the battery slung in the middle.
  ctx.fillStyle = PALETTE.carbon;
  roundRect(ctx, -13, -9, 26, 18, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  roundRect(ctx, -9, -5, 14, 10, 3);
  ctx.fill();
  ctx.fillStyle = pose.color;
  ctx.fillRect(-9, -1.2, 14, 2.4);
  eye(ctx, 14, 0, 3.8, pose, PALETTE.orange);
  // A little fin on each side so it reads upside down too.
  ctx.fillStyle = pose.color;
  ctx.beginPath();
  ctx.moveTo(-13, -6);
  ctx.lineTo(-20, -12);
  ctx.lineTo(-13, -1);
  ctx.moveTo(-13, 6);
  ctx.lineTo(-20, 12);
  ctx.lineTo(-13, 1);
  ctx.fill();
}

/** Draw a drone character at the current transform. */
/**
 * Placeholder stick figures (owner's request, 2026-11-10), sized to each drone's collision box.
 * Each keeps a small drone nod: Freestyle wears a propeller cap, Racer a headband, Heavy is big and boxy,
 * Flipper has a propeller on its cap and its feet.
 */
function stickFigure(ctx: CanvasRenderingContext2D, id: FighterId, pose: DronePose): void {
  const def = FIGHTERS[id];
  const H = def.height + (id === 'heavy' ? 8 : 6);
  const heavy = id === 'heavy';
  const lw = Math.max(2, H * (heavy ? 0.12 : 0.09));
  const headR = H * (heavy ? 0.15 : 0.17);
  const headY = -0.5 * H + headR;
  const neckY = headY + headR;
  const shoulderY = neckY + H * 0.08;
  const hipY = H * 0.12;
  const footY = 0.5 * H;
  const legLen = footY - hipY;
  const armLen = H * 0.3;
  const stride = pose.stride ?? 0;
  const swing = Math.sin(pose.phase * 0.35) * 0.7 * stride;
  const airborne = stride === 0 && pose.thrust > 0.4;
  const hipW = heavy ? H * 0.1 : 0;

  const limbs = new Path2D();
  // Spine.
  limbs.moveTo(0, neckY);
  limbs.lineTo(0, hipY);
  // Legs: running swing on the ground, tucked in the air.
  const leg = (angle: number, side: number) => {
    const kneeX = side * hipW + Math.sin(angle) * legLen * 0.5;
    const kneeY = hipY + Math.cos(angle) * legLen * 0.5;
    const bend = airborne ? 0.9 : 0.25;
    limbs.moveTo(side * hipW, hipY);
    limbs.lineTo(kneeX, kneeY);
    limbs.lineTo(kneeX + Math.sin(angle - bend) * legLen * 0.5, kneeY + Math.cos(angle - bend) * legLen * 0.5);
  };
  // Arms: angle 0 hangs down, PI/2 points forward, PI points up.
  const arm = (angle: number, reach = 1) => {
    limbs.moveTo(0, shoulderY);
    const elbowX = Math.sin(angle) * armLen * 0.5 * reach;
    const elbowY = shoulderY + Math.cos(angle) * armLen * 0.5 * reach;
    limbs.lineTo(elbowX, elbowY);
    limbs.lineTo(Math.sin(angle) * armLen * reach, shoulderY + Math.cos(angle) * armLen * reach);
  };
  const straightLeg = (angle: number, side: number, reach = 1) => {
    limbs.moveTo(side * hipW, hipY);
    limbs.lineTo(side * hipW + Math.sin(angle) * legLen * reach, hipY + Math.cos(angle) * legLen * reach);
  };
  const k = Math.max(0, Math.min(1, pose.strike ?? 1));
  const wind = (from: number, to: number) => from + (to - from) * k;
  switch (pose.attack) {
    case 'punch':
      leg(0.35, 1); leg(-0.35, -1);
      arm(wind(-0.4, Math.PI / 2), wind(0.8, 1.45)); arm(wind(0.8, -0.5));
      break;
    case 'kick':
      straightLeg(wind(0.3, 1.55), 1, wind(0.8, 1.2)); leg(-0.1, -1);
      arm(Math.PI * 0.75); arm(-0.6);
      break;
    case 'backkick':
      straightLeg(wind(-0.3, -1.6), 1, wind(0.8, 1.25)); leg(0.2, -1);
      arm(Math.PI * 0.6); arm(Math.PI * 0.4);
      break;
    case 'uppercut':
      leg(0.3, 1); leg(-0.3, -1);
      arm(wind(0.6, Math.PI * 0.97), wind(0.8, 1.5)); arm(-0.4);
      break;
    case 'low':
      leg(1.2, 1); leg(-0.9, -1);
      straightLeg(wind(0.6, 1.45), 1, 1.15);
      arm(wind(0.2, 1.1), 1.2); arm(-0.8);
      break;
    case 'spin':
      straightLeg(1.3, 1); straightLeg(-1.3, -1);
      arm(Math.PI / 2, 1.3); arm(-Math.PI / 2, 1.3);
      break;
    case 'stomp':
      straightLeg(0.12, 1, 1.1); straightLeg(-0.12, -1, 1.1);
      arm(Math.PI * 0.85, 1.2); arm(-Math.PI * 0.85, 1.2);
      break;
    case 'spike':
      leg(0.8, 1); leg(-0.6, -1);
      arm(wind(Math.PI * 0.9, 0.15), 1.45); arm(wind(-Math.PI * 0.8, -0.1), 1.3);
      break;
    case 'grab':
      leg(0.35, 1); leg(-0.35, -1);
      arm(Math.PI / 2 - 0.15, wind(0.7, 1.35)); arm(Math.PI / 2 + 0.15, wind(0.7, 1.35));
      break;
    case 'throw':
      leg(0.4, 1); leg(-0.4, -1);
      arm(wind(Math.PI / 2, Math.PI * 0.95), 1.3); arm(wind(Math.PI / 2, Math.PI * 0.9), 1.3);
      break;
    case 'cast':
      leg(0.3, 1); leg(-0.4, -1);
      arm(Math.PI / 2 + 0.1, wind(0.6, 1.4)); arm(Math.PI / 2 - 0.1, wind(0.6, 1.4));
      break;
    case 'counter':
      leg(0.3, 1); leg(-0.3, -1);
      arm(Math.PI * 0.62, 1.1); arm(Math.PI * 0.42, 1.1);
      break;
    case 'dash':
      straightLeg(-1.0, 1); straightLeg(-1.3, -1);
      arm(Math.PI / 2, 1.45); arm(Math.PI * 0.6, 1.2);
      break;
    case 'rise':
      straightLeg(0.1, 1); straightLeg(-0.1, -1);
      arm(Math.PI, 1.4); arm(Math.PI * 0.9, 1.3);
      break;
    default:
      if (airborne) { leg(0.6, 1); leg(-0.2, -1); } else { leg(swing + 0.15, 1); leg(-swing - 0.15, -1); }
      // Arms: punch forward when attacking, up when flying, swinging when running.
      if (pose.punch) { arm(Math.PI / 2); arm(0.4); }
      else if (airborne) { arm(Math.PI * 0.8); arm(-Math.PI * 0.8); }
      else { arm(-swing + 0.3); arm(swing - 0.3); }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Dark outline under the color so figures read against any background.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = lw + 2.5;
  ctx.stroke(limbs);
  ctx.strokeStyle = pose.color;
  ctx.lineWidth = lw;
  ctx.stroke(limbs);

  // Head.
  ctx.fillStyle = PALETTE.white;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (heavy) ctx.roundRect(-headR, headY - headR, headR * 2, headR * 2, headR * 0.3);
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

  // Hat and accents.
  const capY = headY - headR;
  const propeller = (x: number, y: number, span: number) => {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 4);
    ctx.stroke();
    const w = Math.sin(pose.phase) * span;
    ctx.strokeStyle = pose.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - w, y - 4);
    ctx.lineTo(x + w, y - 4);
    ctx.stroke();
  };
  if (id === 'freestyle' || id === 'flipper') {
    ctx.fillStyle = pose.color;
    ctx.beginPath();
    ctx.arc(0, capY + headR * 0.45, headR * 0.95, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(0, capY + headR * 0.3, headR * 1.4, headR * 0.25);
    propeller(0, capY + headR * 0.1, headR * 1.3);
  }
  if (id === 'flipper') {
    // Reversible motors: little props on the feet too.
    ctx.fillStyle = pose.color;
    ctx.beginPath();
    ctx.arc(0, footY + 1, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (id === 'racer') {
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR, headY - headR * 0.55, headR * 2, headR * 0.4);
    ctx.fillRect(-headR * 1.8, headY - headR * 0.6, headR * 0.9, headR * 0.25);
  }
  if (heavy) {
    ctx.fillStyle = pose.color;
    ctx.fillRect(-headR, capY - 2, headR * 2, 4);
  }
  ctx.restore();
}

export function drawDrone(ctx: CanvasRenderingContext2D, id: FighterId, pose: DronePose): void {
  if (CHARACTER_ART === 'stick') {
    stickFigure(ctx, id, pose);
    drawFlash(ctx, id, pose);
    return;
  }
  switch (id) {
    case 'freestyle':
      freestyle(ctx, pose);
      break;
    case 'racer':
      freestyle(ctx, pose, 0.75, true);
      break;
    case 'heavy':
      heavy(ctx, pose);
      break;
    case 'flipper':
      flipper(ctx, pose);
      break;
  }
  drawFlash(ctx, id, pose);
}

function drawFlash(ctx: CanvasRenderingContext2D, id: FighterId, pose: DronePose): void {
  if (pose.flash > 0) {
    // Damage flash: a white burst over the body.
    ctx.save();
    ctx.globalAlpha = pose.flash * 0.75;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (CHARACTER_ART === 'stick') ctx.ellipse(0, 0, id === 'heavy' ? 28 : 18, id === 'heavy' ? 30 : 22, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, id === 'heavy' ? 44 : 28, id === 'heavy' ? 26 : 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

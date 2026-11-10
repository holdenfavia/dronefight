// Side-view drone characters drawn with the Canvas 2D API (ADR-0070). The look carries over from
// Dronefight v1: carbon frames, white batteries, orange camera "eyes", props in the pilot's color.
// Drawn in local units around the body centre, y pointing down, nose toward +x.

import type { FighterId } from '../../shared/fighter/fighters';
import { PALETTE } from './config';

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
export function drawDrone(ctx: CanvasRenderingContext2D, id: FighterId, pose: DronePose): void {
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
  if (pose.flash > 0) {
    // Damage flash: a white burst over the body.
    ctx.save();
    ctx.globalAlpha = pose.flash * 0.75;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 0, id === 'heavy' ? 44 : 28, id === 'heavy' ? 26 : 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Extra scenery for the stages: only looks, nothing here touches the fight. Everything that sits on a stage is
// faded or kept below the standing surface, so nobody mistakes it for something to stand on.


/** What the stage art needs from the renderer: world-to-screen mapping, the clock and the purple sky. */
export interface View {
  ctx: CanvasRenderingContext2D;
  sx(x: number): number;
  sy(y: number): number;
  /** Pixels per world unit. */
  s: number;
  /** Frames since start (looks only). */
  time: number;
  purple: boolean;
  w: number;
  h: number;
  /** Camera x, for parallax. */
  camX: number;
}

/** A parallax layer's mapping (see Renderer.drawBackdrop). */
export interface Layer {
  x(x: number): number;
  y(y: number): number;
  s: number;
}

/** A rectangle standing on y (world units, y up). */
function box(v: View, x: number, y: number, w: number, h: number, color: string): void {
  v.ctx.fillStyle = color;
  v.ctx.fillRect(v.sx(x), v.sy(y + h), w * v.s, h * v.s);
}

function line(v: View, x1: number, y1: number, x2: number, y2: number): void {
  v.ctx.moveTo(v.sx(x1), v.sy(y1));
  v.ctx.lineTo(v.sx(x2), v.sy(y2));
}

function blink(v: View, period: number, phase = 0): boolean {
  return ((v.time + phase) / period | 0) % 2 === 0;
}

function light(v: View, x: number, y: number, r: number, color: string): void {
  const ctx = v.ctx;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(v.sx(x), v.sy(y), Math.max(1.5, r * v.s), 0, Math.PI * 2);
  ctx.fill();
}

/** A soft glow in screen space. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A few birds flapping across the sky in screen space, in a band at a fraction `band` of the screen height. */
export function drawBirds(v: View, count: number, color: string, speed: number, band: number, seed: number): void {
  const ctx = v.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const span = v.w + 300;
    const x = (((i * 173 + seed * 97 + v.time * speed * (0.8 + (i % 3) * 0.15) - v.camX * 0.1) % span) + span) % span - 150;
    const y = v.h * band + Math.sin(v.time * 0.01 + i * 1.7 + seed) * v.h * 0.04 + (i % 4) * v.h * 0.025;
    const flap = Math.sin(v.time * 0.25 + i * 2.1) * 4;
    const wing = 7 + (i % 3) * 2;
    ctx.moveTo(x - wing, y - flap);
    ctx.quadraticCurveTo(x - wing / 2, y - 3 - flap / 2, x, y);
    ctx.quadraticCurveTo(x + wing / 2, y - 3 - flap / 2, x + wing, y - flap);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- Rooftop

/** Scenery on the Rooftop building's wall: a neon sign, a fire escape and a drainpipe. */
export function drawRooftopDetail(v: View, wallX1: number, wallX2: number, wallTop: number): void {
  const ctx = v.ctx;
  const s = v.s;
  const purple = v.purple;
  // A neon sign on the wall under the roof's edge, flickering now and then.
  const signOn = !(v.time % 240 > 228 && v.time % 6 < 3);
  const neon = purple ? '#ff9cff' : '#ff5a8a';
  const sy = wallTop - 70;
  box(v, -90, sy, 180, 46, '#1d1f22');
  ctx.strokeStyle = signOn ? neon : 'rgba(255,90,138,0.25)';
  ctx.lineWidth = Math.max(1, 3 * s);
  ctx.strokeRect(v.sx(-84), v.sy(sy + 40), 168 * s, 34 * s);
  ctx.font = `800 ${Math.max(8, 26 * s)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = signOn ? neon : 'rgba(255,90,138,0.3)';
  ctx.fillText('OPEN LATE', v.sx(0), v.sy(sy + 23));
  if (signOn) glow(ctx, v.sx(0), v.sy(sy + 23), 120 * s, purple ? 'rgba(255,156,255,0.25)' : 'rgba(255,90,138,0.22)');
  // A fire escape zigzagging down the left of the wall.
  ctx.strokeStyle = '#17181a';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  const fx1 = wallX1 + 20;
  const fx2 = wallX1 + 110;
  for (let i = 0; i < 12; i++) {
    const y = wallTop - 40 - i * 68;
    if (v.sy(y) > v.h + 40) break;
    // Landing with a railing.
    line(v, fx1, y, fx2, y);
    line(v, fx1, y + 20, fx2, y + 20);
    for (let rx = fx1; rx <= fx2; rx += 15) line(v, rx, y, rx, y + 20);
    // Stairs down to the next landing.
    const down = y - 68;
    if (i % 2 === 0) line(v, fx2 - 10, y, fx1 + 10, down);
    else line(v, fx1 + 10, y, fx2 - 10, down);
  }
  ctx.stroke();
  // A drainpipe down the right.
  box(v, wallX2 - 30, -2000, 8, 2000 + wallTop, '#1f2124');
}

/** Pigeons perched on the Rooftop girders, bobbing; each one hops away for a while now and then. */
export function drawPigeons(v: View, spots: readonly { x: number; y: number }[]): void {
  const ctx = v.ctx;
  const s = v.s;
  spots.forEach((p, i) => {
    const cycle = (v.time + i * 977) % 1800;
    if (cycle > 1500) return;
    const bob = Math.abs(Math.sin(v.time * 0.05 + i)) * 1.5;
    const face = i % 2 ? 1 : -1;
    ctx.fillStyle = v.purple ? '#8a63c9' : '#7d8590';
    ctx.beginPath();
    ctx.ellipse(v.sx(p.x), v.sy(p.y + 7 + bob), 8 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.arc(v.sx(p.x + face * 7), v.sy(p.y + 13 + bob), 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8a21a';
    ctx.fillRect(v.sx(p.x + face * 10) - (face < 0 ? 3 * s : 0), v.sy(p.y + 14 + bob), 3 * s, 1.5 * s);
  });
}

// ---------------------------------------------------------------- Helipad

/** Safety nets out from both ends of the pad, below the surface, and floodlights shining up at sunset. */
export function drawHelipadDetail(v: View, x1: number, x2: number, y: number): void {
  const ctx = v.ctx;
  const s = v.s;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x1 : x2;
    const out = edge + side * 46;
    // Net frame.
    ctx.strokeStyle = '#4b5058';
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath();
    line(v, edge, y - 18, out, y - 10);
    line(v, edge, y - 46, out, y - 10);
    ctx.stroke();
    // Mesh.
    ctx.strokeStyle = 'rgba(200,200,210,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      line(v, edge + side * 46 * t, y - 18 + 8 * t, edge + side * 46 * t, y - 46 + 36 * t);
    }
    line(v, edge, y - 32, out, y - 10);
    ctx.stroke();
    // A floodlight under the edge, its beam fanning up into the dusk.
    const lx = v.sx(edge + side * 10);
    const ly = v.sy(y - 24);
    const g = ctx.createLinearGradient(lx, ly, lx, ly - 260 * s);
    g.addColorStop(0, v.purple ? 'rgba(255,214,255,0.22)' : 'rgba(255,236,190,0.2)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + side * 90 * s, ly - 260 * s);
    ctx.lineTo(lx + side * 10 * s, ly - 260 * s);
    ctx.closePath();
    ctx.fill();
    light(v, edge + side * 10, y - 24, 4, '#fff4c2');
  }
  // The pad's number plate on its front face.
  ctx.font = `900 ${Math.max(8, 30 * s)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = `800 ${Math.max(6, 12 * v.s)}px "Barlow Condensed", sans-serif`;
  ctx.fillText('PAD 03  ·  MAX 4 T', v.sx(250), v.sy(y - 40));
}

/** An antenna on the skyscraper roof under the pad and a window-washer's gondola on its side. */
export function drawSkyscraperDetail(v: View, roof: number, x1: number, x2: number): void {
  const ctx = v.ctx;
  const s = v.s;
  const dark = v.purple ? '#3e2a66' : '#33354a';
  // Antenna mast on the corner with a blinking light.
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, 2.5 * s);
  ctx.beginPath();
  line(v, x1 + 14, roof, x1 + 14, roof + 160);
  line(v, x1 + 4, roof + 120, x1 + 24, roof + 120);
  line(v, x1 + 7, roof + 90, x1 + 21, roof + 90);
  ctx.stroke();
  if (blink(v, 40)) {
    light(v, x1 + 14, roof + 162, 4, '#ff3b30');
    glow(ctx, v.sx(x1 + 14), v.sy(roof + 162), 18 * s, 'rgba(255,59,48,0.5)');
  }
  // The gondola on two cables down the right side, swaying a little.
  const sway = Math.sin(v.time * 0.02) * 3;
  const gy = roof - 220 + Math.sin(v.time * 0.004) * 40;
  ctx.strokeStyle = 'rgba(20,20,30,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  line(v, x2 - 70, roof - 14, x2 - 70 + sway, gy + 30);
  line(v, x2 - 10, roof - 14, x2 - 10 + sway, gy + 30);
  ctx.stroke();
  box(v, x2 - 76 + sway, gy, 72, 14, v.purple ? '#8a63c9' : '#d9d4c8');
  ctx.strokeStyle = v.purple ? '#8a63c9' : '#d9d4c8';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  line(v, x2 - 76 + sway, gy + 30, x2 - 4 + sway, gy + 30);
  line(v, x2 - 76 + sway, gy + 14, x2 - 76 + sway, gy + 30);
  line(v, x2 - 4 + sway, gy + 14, x2 - 4 + sway, gy + 30);
  ctx.stroke();
}

/** Red aviation lights blinking on the tallest buildings of a parallax row. */
export function drawBeacons(v: View, L: Layer, tops: readonly { x: number; w: number; h: number }[], minHeight: number): void {
  const ctx = v.ctx;
  tops.forEach((b, i) => {
    if (b.h < minHeight) return;
    const x = L.x(b.x + b.w / 2);
    if (x < -10 || x > v.w + 10) return;
    if (!blink(v, 50, i * 17)) return;
    const y = L.y(b.h) - 3;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 3 * L.s), 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, x, y, 12 * L.s, 'rgba(255,59,48,0.45)');
  });
}

// ---------------------------------------------------------------- Crane Yard

/** The far side of the bay: a lighthouse with a sweeping beam, bobbing buoys and a tugboat. */
export function drawHarborExtras(v: View, sea: Layer, shore: number): void {
  const ctx = v.ctx;
  const k = sea.s;
  // Lighthouse on a point, left of the stage.
  const lx = sea.x(-1500);
  if (lx > -200 && lx < v.w + 200) {
    const base = shore;
    ctx.fillStyle = v.purple ? '#3e2a66' : '#3a4058';
    ctx.beginPath();
    ctx.moveTo(lx - 70 * k, base + 2);
    ctx.quadraticCurveTo(lx, base - 30 * k, lx + 80 * k, base + 2);
    ctx.fill();
    ctx.fillStyle = v.purple ? '#c9a0ff' : '#e9e6df';
    ctx.beginPath();
    ctx.moveTo(lx - 12 * k, base - 18 * k);
    ctx.lineTo(lx - 7 * k, base - 120 * k);
    ctx.lineTo(lx + 7 * k, base - 120 * k);
    ctx.lineTo(lx + 12 * k, base - 18 * k);
    ctx.fill();
    ctx.fillStyle = '#c9452b';
    for (const band of [40, 80]) ctx.fillRect(lx - 11 * k, base - band * k - 12 * k, 22 * k, 12 * k);
    ctx.fillStyle = '#2a2f3e';
    ctx.fillRect(lx - 10 * k, base - 136 * k, 20 * k, 16 * k);
    ctx.fillStyle = '#fff1b8';
    ctx.fillRect(lx - 6 * k, base - 133 * k, 12 * k, 10 * k);
    // The beam sweeps round: wide when it points at us, a thin line side-on.
    const a = v.time * 0.02;
    const reach = 420 * k * Math.abs(Math.cos(a));
    const spread = 6 + 22 * Math.max(0, Math.sin(a));
    const beam = ctx.createLinearGradient(lx, 0, lx + Math.sign(Math.cos(a)) * reach, 0);
    beam.addColorStop(0, 'rgba(255,241,184,0.45)');
    beam.addColorStop(1, 'rgba(255,241,184,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(lx, base - 128 * k);
    ctx.lineTo(lx + Math.sign(Math.cos(a)) * reach, base - 128 * k - spread * k);
    ctx.lineTo(lx + Math.sign(Math.cos(a)) * reach, base - 128 * k + spread * k);
    ctx.closePath();
    ctx.fill();
  }
  // Buoys bobbing, a light on each.
  for (const [bx, color] of [[-700, '#c9452b'], [300, '#3f8a55'], [1100, '#c9452b']] as const) {
    const x = sea.x(bx);
    if (x < -20 || x > v.w + 20) continue;
    const y = shore + 24 * k + Math.sin(v.time * 0.04 + bx) * 2 * k;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 7 * k, y);
    ctx.lineTo(x - 3 * k, y - 20 * k);
    ctx.lineTo(x + 3 * k, y - 20 * k);
    ctx.lineTo(x + 7 * k, y);
    ctx.fill();
    if (blink(v, 45, bx)) {
      ctx.fillStyle = color === '#c9452b' ? '#ff6b5a' : '#7aff9a';
      ctx.beginPath();
      ctx.arc(x, y - 23 * k, Math.max(1.5, 2.5 * k), 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, x, y - 23 * k, 10 * k, 'rgba(255,240,200,0.4)');
    }
  }
  // A tugboat chugging back and forth, puffing smoke.
  const span = 2600;
  const t = (v.time * 0.25) % (span * 2);
  const dir = t < span ? 1 : -1;
  const tx = sea.x(-1300 + (t < span ? t : span * 2 - t));
  const ty = shore + 40 * k;
  if (tx > -100 && tx < v.w + 100) {
    ctx.fillStyle = v.purple ? '#2e2050' : '#2a2f3e';
    ctx.beginPath();
    ctx.moveTo(tx - 40 * k * dir, ty - 12 * k);
    ctx.lineTo(tx + 44 * k * dir, ty - 12 * k);
    ctx.lineTo(tx + 34 * k * dir, ty);
    ctx.lineTo(tx - 36 * k * dir, ty);
    ctx.fill();
    ctx.fillStyle = v.purple ? '#5a4a8a' : '#c9452b';
    ctx.fillRect(tx - 18 * k, ty - 28 * k, 30 * k, 16 * k);
    ctx.fillStyle = '#fff1b8';
    ctx.fillRect(tx - 12 * k, ty - 24 * k, 6 * k, 5 * k);
    ctx.fillRect(tx + 2 * k, ty - 24 * k, 6 * k, 5 * k);
    ctx.fillStyle = '#2a2f3e';
    ctx.fillRect(tx - 4 * k * dir, ty - 40 * k, 6 * k, 12 * k);
    ctx.fillStyle = 'rgba(220,220,230,0.35)';
    for (let p = 0; p < 4; p++) {
      const age = (v.time * 0.5 + p * 15) % 60;
      ctx.beginPath();
      ctx.arc(tx - 1 * k * dir - dir * age * 0.8 * k, ty - 44 * k - age * 0.6 * k, (3 + age * 0.12) * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Floodlight masts along the quay, their lamps glowing. */
export function drawQuayLights(v: View, quay: Layer, qy: number): void {
  const ctx = v.ctx;
  const k = quay.s;
  for (let i = -8; i <= 8; i++) {
    const x = quay.x(i * 520 + 130);
    if (x < -60 || x > v.w + 60) continue;
    ctx.fillStyle = v.purple ? '#3e2a66' : '#2a2f3e';
    ctx.fillRect(x - 2 * k, qy - 170 * k, 4 * k, 170 * k);
    ctx.fillRect(x - 16 * k, qy - 172 * k, 32 * k, 5 * k);
    ctx.fillStyle = '#fff1b8';
    for (const dx of [-12, -4, 4, 12]) ctx.fillRect(x + dx * k - 2 * k, qy - 168 * k, 4 * k, 3 * k);
    glow(ctx, x, qy - 166 * k, 40 * k, 'rgba(255,241,184,0.3)');
  }
}

/** The Crane Yard deck's front face: a stencilled berth number and life rings. */
export function drawDeckDetail(v: View, x1: number, x2: number, y: number, depth: number): void {
  const ctx = v.ctx;
  const s = v.s;
  ctx.font = `900 ${Math.max(8, 28 * s)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillText('BERTH 7', v.sx(0), v.sy(y - depth * 0.55));
  // Life rings either side.
  for (const lx of [x1 + 90, x2 - 90]) {
    ctx.lineWidth = Math.max(2, 6 * s);
    ctx.strokeStyle = '#ff6a13';
    ctx.beginPath();
    ctx.arc(v.sx(lx), v.sy(y - 50), 14 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f4efe6';
    for (let q = 0; q < 4; q++) {
      ctx.beginPath();
      ctx.arc(v.sx(lx), v.sy(y - 50), 14 * s, q * Math.PI / 2, q * Math.PI / 2 + 0.4);
      ctx.stroke();
    }
  }
}

/** Container details: corner castings and a stencilled code, on a container face (world units). */
export function drawContainerDoors(v: View, x: number, y: number, w: number, h: number, n: number): void {
  const ctx = v.ctx;
  const s = v.s;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [cx, cy] of [[x, y], [x + w - 6, y], [x, y + h - 6], [x + w - 6, y + h - 6]] as const) {
    ctx.fillRect(v.sx(cx), v.sy(cy + 6), 6 * s, 6 * s);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `700 ${Math.max(5, 9 * s)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`DFX ${(n * 7919 % 900000 + 100000).toString()}`, v.sx(x + 10), v.sy(y + h - 12));
}

// ---------------------------------------------------------------- Harvest Farm

/** The back of the farm's field: a split-rail fence and sunflowers (draw with a View set back in depth). */
export function drawFarmBack(v: View, ground: number): void {
  const ctx = v.ctx;
  const s = v.s;
  const wood = v.purple ? '#5a4a8a' : '#8a6a44';
  // Split-rail fence along the back of the field.
  ctx.strokeStyle = wood;
  ctx.lineWidth = Math.max(1, 4 * s);
  ctx.beginPath();
  for (let x = -1400; x <= 1400; x += 120) {
    if (x > -480 && x < 480) continue;
    line(v, x, ground, x, ground + 52);
    line(v, x, ground + 40, x + 120, ground + 44);
    line(v, x, ground + 20, x + 120, ground + 24);
  }
  ctx.stroke();
  // Sunflowers along the fence.
  for (const [fx, fh] of [[-560, 90], [-530, 110], [-500, 80], [500, 100], [530, 120], [-760, 95], [760, 105]] as const) {
    const sway = Math.sin(v.time * 0.03 + fx) * 3;
    ctx.strokeStyle = v.purple ? '#6c4aa8' : '#4f7a2a';
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath();
    ctx.moveTo(v.sx(fx), v.sy(ground));
    ctx.quadraticCurveTo(v.sx(fx + sway), v.sy(ground + fh / 2), v.sx(fx + sway), v.sy(ground + fh));
    ctx.stroke();
    ctx.fillStyle = v.purple ? '#6c4aa8' : '#4f7a2a';
    ctx.beginPath();
    ctx.ellipse(v.sx(fx + 7), v.sy(ground + fh * 0.45), 8 * s, 3.5 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
    const cx = v.sx(fx + sway);
    const cy = v.sy(ground + fh);
    ctx.fillStyle = v.purple ? '#c9a0ff' : '#f2c232';
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 10 * s, cy + Math.sin(a) * 10 * s, 6 * s, 3 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4a3020';
    ctx.beginPath();
    ctx.arc(cx, cy, 7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The front of the farm: a pitchfork stuck in the hay bales. */
export function drawFarmFront(v: View, ground: number): void {
  const ctx = v.ctx;
  const s = v.s;
  // A pitchfork stuck in the hay bales.
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = Math.max(1, 3 * s);
  ctx.beginPath();
  line(v, -170, ground + 70, -130, ground + 150);
  ctx.stroke();
  ctx.strokeStyle = '#9aa0a6';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.beginPath();
  for (const dx of [-8, 0, 8]) line(v, -130 + dx * 0.9, ground + 150 + dx * 0.4, -122 + dx * 0.9, ground + 170 + dx * 0.4);
  line(v, -138, ground + 146, -122, ground + 154);
  ctx.stroke();
}

/** A lantern hanging from the hay wagon's front stake, glowing. */
export function drawLantern(v: View, x: number, y: number): void {
  const ctx = v.ctx;
  const s = v.s;
  const swing = Math.sin(v.time * 0.04) * 2;
  ctx.strokeStyle = '#3a2614';
  ctx.lineWidth = 1;
  ctx.beginPath();
  line(v, x, y, x + swing, y - 14);
  ctx.stroke();
  box(v, x - 5 + swing, y - 30, 10, 16, '#3a2614');
  ctx.fillStyle = '#ffd27a';
  ctx.fillRect(v.sx(x - 3 + swing), v.sy(y - 16), 6 * s, 12 * s);
  glow(ctx, v.sx(x + swing), v.sy(y - 22), 36 * s, 'rgba(255,210,122,0.35)');
}

/** A farm windpump turning on the middle hills, left of the barn. `hill` gives the hill's screen y at a layer x. */
export function drawWindpump(v: View, mid: Layer, hill: (x: number) => number): void {
  const ctx = v.ctx;
  const wx = mid.x(-420);
  const k = mid.s;
  if (wx > -100 && wx < v.w + 100) {
    const base = hill(-420);
    ctx.strokeStyle = v.purple ? '#4a2f7a' : '#6b4a2a';
    ctx.lineWidth = Math.max(1, 2.5 * k);
    ctx.beginPath();
    ctx.moveTo(wx - 18 * k, base);
    ctx.lineTo(wx - 3 * k, base - 150 * k);
    ctx.moveTo(wx + 18 * k, base);
    ctx.lineTo(wx + 3 * k, base - 150 * k);
    for (let y = 30; y < 150; y += 40) {
      ctx.moveTo(wx - 18 * k + y * 0.1 * k, base - y * k);
      ctx.lineTo(wx + 18 * k - (y + 40) * 0.1 * k, base - (y + 40) * k);
    }
    ctx.stroke();
    const hx = wx;
    const hy = base - 155 * k;
    ctx.strokeStyle = v.purple ? '#c9a0ff' : '#e9e6df';
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.beginPath();
    for (let b = 0; b < 12; b++) {
      const a = v.time * 0.05 + (b / 12) * Math.PI * 2;
      ctx.moveTo(hx + Math.cos(a) * 6 * k, hy + Math.sin(a) * 6 * k);
      ctx.lineTo(hx + Math.cos(a) * 28 * k, hy + Math.sin(a) * 28 * k);
    }
    ctx.stroke();
    ctx.fillStyle = v.purple ? '#4a2f7a' : '#6b4a2a';
    ctx.beginPath();
    ctx.moveTo(hx + 4 * k, hy);
    ctx.lineTo(hx + 40 * k, hy - 6 * k);
    ctx.lineTo(hx + 40 * k, hy + 6 * k);
    ctx.fill();
  }
}

/** Corn shocks in rows on the near hills. */
export function drawCornShocks(v: View, near: Layer, hill: (x: number) => number): void {
  const ctx = v.ctx;
  ctx.fillStyle = v.purple ? '#7a4ab0' : '#c9a24a';
  for (let i = -30; i <= 30; i++) {
    const cx = i * 60 + 30;
    const x = near.x(cx);
    if (x < -20 || x > v.w + 20) continue;
    if (((i * 7) & 7) < 2) continue;
    const y = hill(cx) + 4;
    const h = (34 + ((i * 13) & 7) * 2) * near.s;
    ctx.beginPath();
    ctx.moveTo(x - 9 * near.s, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + 9 * near.s, y);
    ctx.fill();
  }
}

/** Crows on the scarecrow's arms (draw with the scarecrow's View), flying off now and then. */
export function drawCrows(v: View, ground: number): void {
  const ctx = v.ctx;
  const s = v.s;
  for (const [cx, phase] of [[-450, 0], [-392, 600]] as const) {
    if ((v.time + phase) % 1400 > 1100) continue;
    const hop = (v.time + phase) % 200 < 8 ? 3 : 0;
    const y = ground + 84 + hop;
    ctx.fillStyle = '#1d1f22';
    ctx.beginPath();
    ctx.ellipse(v.sx(cx), v.sy(y + 6), 9 * s, 5.5 * s, 0.2, 0, Math.PI * 2);
    ctx.arc(v.sx(cx + 7), v.sy(y + 12), 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8a21a';
    ctx.fillRect(v.sx(cx + 10), v.sy(y + 13), 4 * s, 1.5 * s);
  }
}

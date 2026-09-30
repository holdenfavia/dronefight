import * as THREE from 'three/webgpu';

// Procedural textures drawn on canvases: original art, nothing downloaded (Hard rule 4).

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, rand: () => number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    const s = 1 + rand() * 2.5;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function finish(c: HTMLCanvasElement, anisotropy: number, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Poured-concrete slab with expansion joints at the tile edges. One tile = GROUND_TILE_M metres. */
export const GROUND_TILE_M = 8;

export function concreteGroundTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rand = seeded(11);
  ctx.fillStyle = '#a39e95';
  ctx.fillRect(0, 0, size, size);

  // Large soft blotches for tonal variation.
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rand() < 0.5 ? '90,85,78' : '220,215,205';
    g.addColorStop(0, `rgba(${shade},0.10)`);
    g.addColorStop(1, `rgba(${shade},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, size, 9000, rand, 0.18);

  // Expansion joints: dark line with a light edge, on two sides so tiles join seamlessly.
  ctx.fillStyle = 'rgba(60,56,50,0.75)';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
  ctx.fillStyle = 'rgba(235,230,220,0.35)';
  ctx.fillRect(0, 3, size, 2);
  ctx.fillRect(3, 0, 2, size);
  // Saw-cut midline joints.
  ctx.fillStyle = 'rgba(70,66,60,0.35)';
  ctx.fillRect(0, size / 2, size, 1.5);
  ctx.fillRect(size / 2, 0, 1.5, size);
  return finish(c, anisotropy);
}

/** Cast concrete for walls, pillars and blocks. Applied at CONCRETE_TILE_M metres per repeat. */
export const CONCRETE_TILE_M = 4;

export function concreteWallTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rand = seeded(23);
  ctx.fillStyle = '#c4c0b8';
  ctx.fillRect(0, 0, size, size);
  // Soft tonal blotches, then aggregate speckle.
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rand() < 0.55 ? '95,90,82' : '225,220,210';
    g.addColorStop(0, `rgba(${shade},0.09)`);
    g.addColorStop(1, `rgba(${shade},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, size, 14000, rand, 0.2);
  // Faint rain streaks running the full tile height, so they continue across repeats.
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const w = 2 + rand() * 6;
    ctx.fillStyle = `rgba(90,86,78,${0.04 + rand() * 0.05})`;
    ctx.fillRect(x, 0, w, size);
  }
  // Formwork: panel seams on the tile edges (the tile is 4 m: two 2 m panels each way) and tie holes.
  for (const p of [0, size / 2]) {
    ctx.fillStyle = 'rgba(70,66,60,0.35)';
    ctx.fillRect(p, 0, 2, size);
    ctx.fillRect(0, p, size, 2);
    ctx.fillStyle = 'rgba(235,230,220,0.25)';
    ctx.fillRect(p + 2, 0, 1, size);
    ctx.fillRect(0, p + 2, size, 1);
  }
  for (const fx of [0.125, 0.375, 0.625, 0.875]) {
    for (const fy of [0.125, 0.375, 0.625, 0.875]) {
      ctx.fillStyle = 'rgba(60,56,50,0.5)';
      ctx.beginPath();
      ctx.arc(fx * size, fy * size, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,235,225,0.3)';
      ctx.beginPath();
      ctx.arc(fx * size + 1, fy * size + 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c, anisotropy);
}
export const PAINT_TILE_M = 2;

/**
 * Painted steel: base color with fine brushed streaks, a few chips showing darker metal, and light
 * scratches. Everything spans or wraps the tile, so repeats don't show seams.
 */
export function paintedMetalTexture(anisotropy: number, base: string, seed: number): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Brushed streaks along the beam (horizontal on the texture), very subtle.
  for (let i = 0; i < 90; i++) {
    const y = rand() * size;
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.02 + rand() * 0.035})` : `rgba(255,255,255,${0.02 + rand() * 0.03})`;
    ctx.fillRect(0, y, size, 1 + rand() * 1.5);
  }
  speckle(ctx, size, 1800, rand, 0.1);
  // Paint chips: small irregular darker spots with a lighter rim.
  for (let i = 0; i < 16; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.5 + rand() * 3.5;
    ctx.fillStyle = 'rgba(45,42,40,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + rand()), r, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Light scratches.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 10; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 30;
    const a = rand() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return finish(c, anisotropy);
}

/** Launch pad: orange with a white border and a centre cross. Mapped once across the pad top. */
export function padTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#ff6a13';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(size / 2 - 6, 60, 12, size - 120);
  ctx.fillRect(60, size / 2 - 6, size - 120, 12);
  const tex = finish(c, anisotropy);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---- Downtown (ADR-0012). Building textures repeat every BUILDING_TILE_M, i.e. one floor and one window bay.

export const BUILDING_TILE_M = 4;

/** Rendered wall with one window per floor bay. */
export function facadeTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const rand = seeded(31);
  ctx.fillStyle = '#d6d0c4';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 900, rand, 0.12);
  // Floor band.
  ctx.fillStyle = '#bdb6a8';
  ctx.fillRect(0, size - 14, size, 14);
  // Window with a sky reflection gradient and a light frame.
  const g = ctx.createLinearGradient(0, 26, 0, 104);
  g.addColorStop(0, '#6f8ba3');
  g.addColorStop(1, '#2f3f50');
  ctx.fillStyle = '#eeeae2';
  ctx.fillRect(18, 22, 92, 86);
  ctx.fillStyle = g;
  ctx.fillRect(22, 26, 84, 78);
  ctx.fillStyle = '#eeeae2';
  ctx.fillRect(62, 26, 4, 78);
  return finish(c, anisotropy);
}

/** Glass curtain wall: blue glass, pale mullions, dark floor spandrels. */
export function glassTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#9cc7e6');
  g.addColorStop(0.55, '#3f77a3');
  g.addColorStop(1, '#2a557c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1d3346';
  ctx.fillRect(0, size - 16, size, 16);
  ctx.fillStyle = '#d7e2ea';
  for (const x of [0, 32, 64, 96]) ctx.fillRect(x, 0, 3, size);
  ctx.fillRect(0, size - 17, size, 2);
  return finish(c, anisotropy);
}

/** Brick with white-framed windows. */
export function brickTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const rand = seeded(47);
  ctx.fillStyle = '#9b5540';
  ctx.fillRect(0, 0, size, size);
  // Brick courses.
  ctx.fillStyle = 'rgba(60,30,22,0.35)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 1);
    for (let x = (y / 8) % 2 ? 0 : 8; x < size; x += 16) ctx.fillRect(x, y, 1, 8);
  }
  speckle(ctx, size, 600, rand, 0.15);
  ctx.fillStyle = '#f1ede6';
  ctx.fillRect(32, 24, 64, 76);
  const g = ctx.createLinearGradient(0, 28, 0, 96);
  g.addColorStop(0, '#72889a');
  g.addColorStop(1, '#2d3a47');
  ctx.fillStyle = g;
  ctx.fillRect(36, 28, 56, 68);
  ctx.fillStyle = '#f1ede6';
  ctx.fillRect(36, 60, 56, 3);
  return finish(c, anisotropy);
}

/** Gravel roof. */
export function roofTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#5a5c5f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 2500, seeded(53), 0.25);
  return finish(c, anisotropy);
}

/** Sidewalk slabs, 1.5 m squares. Tiles every SIDEWALK_TILE_M. */
export const SIDEWALK_TILE_M = 3;

export function sidewalkTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#c9c4ba';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 1200, seeded(61), 0.14);
  ctx.fillStyle = 'rgba(90,86,80,0.45)';
  for (const p of [0, size / 2]) {
    ctx.fillRect(p, 0, 1.5, size);
    ctx.fillRect(0, p, size, 1.5);
  }
  return finish(c, anisotropy);
}

export function foliageTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 64;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#5c8f3c';
  ctx.fillRect(0, 0, size, size);
  const rand = seeded(71);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(40,80,30,0.5)' : 'rgba(140,190,90,0.45)';
    ctx.fillRect(rand() * size, rand() * size, 3, 3);
  }
  return finish(c, anisotropy);
}

/** Asphalt with aggregate and patches. One tile = GROUND_TILE_M metres. */
export function asphaltTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rand = seeded(83);
  ctx.fillStyle = '#56585b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 40 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rand() < 0.5 ? '30,31,33' : '120,120,118';
    g.addColorStop(0, `rgba(${shade},0.12)`);
    g.addColorStop(1, `rgba(${shade},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  speckle(ctx, size, 14000, rand, 0.22);
  return finish(c, anisotropy);
}

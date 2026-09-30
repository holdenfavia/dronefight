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
  const size = 256;
  const [c, ctx] = canvas(size);
  const rand = seeded(23);
  ctx.fillStyle = '#c4c0b8';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 4000, rand, 0.2);
  // Formwork tie holes and panel lines.
  ctx.fillStyle = 'rgba(80,76,70,0.25)';
  ctx.fillRect(0, 0, size, 1.5);
  ctx.fillRect(0, 0, 1.5, size);
  ctx.fillStyle = 'rgba(70,66,60,0.45)';
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, anisotropy);
}

/** Painted metal: flat colour with subtle wear. Applied at PAINT_TILE_M metres per repeat. */
export const PAINT_TILE_M = 2;

export function paintedMetalTexture(anisotropy: number, base: string, seed: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 700, rand, 0.12);
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

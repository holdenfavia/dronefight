import * as THREE from 'three/webgpu';

/**
 * Backdrop for every map (ADR-0012): two rings of low-poly mountains with baked-in haze, soft clouds
 * and a sun glow. All procedural, built once. Nothing here collides or casts shadows.
 */

const HAZE = new THREE.Color('#cfe4f5');

interface RangeSpec {
  inner: number;
  outer: number;
  peak: number;
  seed: number;
  /** 0 = crisp, 1 = fully faded into the sky. */
  haze: number;
}

const RANGES: RangeSpec[] = [
  // Far, tall range with snow.
  { inner: 900, outer: 1060, peak: 330, seed: 3, haze: 0.36 },
  // Nearer foothills, darker and greener.
  { inner: 640, outer: 820, peak: 140, seed: 11, haze: 0.2 },
];

const ROCK = new THREE.Color('#6d7c8c');
const FOREST = new THREE.Color('#4f6b58');
const SNOW = new THREE.Color('#f4f7fa');

function ridgeNoise(theta: number, r: number, seed: number): number {
  // Layered sines around the ring give irregular peaks that tile seamlessly.
  const s = seed * 1.37;
  const n =
    0.45 * Math.sin(theta * 3 + s) +
    0.3 * Math.sin(theta * 7 + s * 2.1 + r * 0.004) +
    0.18 * Math.sin(theta * 17 + s * 3.7 + r * 0.011) +
    0.07 * Math.sin(theta * 41 + s * 5.3);
  // Sharpen into ridges.
  return Math.pow(0.5 + 0.5 * n, 1.6);
}

function mountainRange(spec: RangeSpec): THREE.Mesh {
  const segments = 240;
  const rows = 7;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const r = spec.inner + (spec.outer - spec.inner) * t;
    // Rises from the ground at the inner edge to full height by two-thirds of the way out.
    const rise = Math.min(1, t / 0.66);
    const profile = rise * rise * (3 - 2 * rise);
    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const h = spec.peak * profile * ridgeNoise(theta, r, spec.seed) - (row === 0 ? 20 : 0);
      positions.push(Math.cos(theta) * r, h, Math.sin(theta) * r);

      const hn = h / spec.peak;
      if (hn > 0.72 && spec.peak > 200) c.copy(ROCK).lerp(SNOW, Math.min(1, (hn - 0.72) / 0.12));
      else c.copy(FOREST).lerp(ROCK, Math.min(1, hn * 1.4));
      c.lerp(HAZE, spec.haze + (1 - t) * 0.15);
      colors.push(c.r, c.g, c.b);
    }
  }
  const stride = segments + 1;
  for (let row = 0; row < rows; row++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = row * stride + seg;
      const b = a + stride;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, side: THREE.DoubleSide }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

function softTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.6})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function clouds(): THREE.Group {
  const group = new THREE.Group();
  let s = 17;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const textures = [0, 1, 2].map(() =>
    softTexture((ctx, size) => {
      // A puffy cloud: overlapping soft blobs, flatter at the bottom.
      for (let i = 0; i < 14; i++) {
        const x = size * (0.2 + rand() * 0.6);
        const y = size * (0.35 + rand() * 0.3);
        blob(ctx, x, y, size * (0.12 + rand() * 0.16), 0.55);
      }
      // Slightly grey underside.
      const g = ctx.createLinearGradient(0, size * 0.4, 0, size * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(120,140,160,0.25)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }),
  );
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 300 + rand() * 650;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures[i % textures.length],
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.85 + rand() * 0.15,
      }),
    );
    const w = 160 + rand() * 220;
    sprite.scale.set(w, w * 0.45, 1);
    sprite.position.set(Math.cos(a) * r, 240 + rand() * 220, Math.sin(a) * r);
    group.add(sprite);
  }
  return group;
}

function sunGlow(direction: THREE.Vector3): THREE.Sprite {
  const tex = softTexture((ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,250,235,0.9)');
    g.addColorStop(0.15, 'rgba(255,240,210,0.45)');
    g.addColorStop(1, 'rgba(255,230,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  sprite.position.copy(direction).multiplyScalar(1000);
  sprite.scale.setScalar(420);
  return sprite;
}

export function buildScenery(sunDirection: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  for (const spec of RANGES) group.add(mountainRange(spec));
  group.add(clouds());
  group.add(sunGlow(sunDirection));
  return group;
}

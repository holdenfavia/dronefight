import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Backdrop for every map (ADR-0012): two rings of low-poly mountains with baked-in haze, soft clouds
 * and a sun glow. Or a coast (ADR-0054): forested hills, beaches and the sea with the sun setting over it.
 * All procedural, built per map. Nothing here collides or casts shadows.
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
  { inner: 1000, outer: 1140, peak: 330, seed: 3, haze: 0.36 },
  // Nearer foothills, darker and greener.
  { inner: 760, outer: 920, peak: 140, seed: 11, haze: 0.2 },
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

// --- The coast (ADR-0054): Rio-like green hills around a bay, the sea toward +X.

/** The map's edge: the land around it starts here. */
const EDGE = 460;
/** How far out the backdrop's land goes. */
const LAND_R = 1500;
const SEA_COLOR = '#3a86b8';
const GREENS = [new THREE.Color('#3d7a3a'), new THREE.Color('#2f6532'), new THREE.Color('#4c8a40'), new THREE.Color('#2a5a34')];
const SAND = new THREE.Color('#e8d6a6');
const CLIFF = new THREE.Color('#8b8680');

/** The shoreline: straight past the map's east edge, then curving out to sea into headlands (a bay). */
function shoreX(z: number): number {
  const a = Math.max(0, Math.abs(z) - 470);
  return EDGE + 0.0012 * a * a;
}

/** Smooth value noise from layered sines: cheap, deterministic, no texture. */
function wobble(x: number, z: number, seed: number): number {
  return (
    0.5 * Math.sin(x * 0.011 + seed) * Math.cos(z * 0.013 - seed * 0.7) +
    0.3 * Math.sin(x * 0.031 - z * 0.027 + seed * 2.3) +
    0.2 * Math.sin(x * 0.07 + z * 0.063 + seed * 4.1)
  );
}

/** Rolling, forested land around the map down to sandy beaches; dips under the sea past the shore. */
function coastLand(): THREE.Mesh {
  const step = 20;
  const n = Math.round((LAND_R * 2) / step);
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  const height = (x: number, z: number) => {
    const fromEdge = Math.max(Math.abs(x), Math.abs(z)) - EDGE;
    const shore = shoreX(z) - x;
    const inland = Math.min(1, Math.max(0, fromEdge / 120));
    const hills = 3 + 22 * inland * (0.5 + 0.5 * wobble(x, z, 1));
    // Toward the shore: down to a beach at about sea level, then under the water.
    const beach = Math.min(1, Math.max(0, (shore - 25) / 90));
    return shore < 0 ? -2 + Math.max(-4, shore * 0.1) : 0.3 + Math.min(shore, 25) * 0.04 + (hills - 1.3) * beach;
  };
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = -LAND_R + i * step;
      const z = -LAND_R + j * step;
      // At the map's edge the land meets its ground; past the shore it dips under the sea.
      const y = Math.max(Math.abs(x), Math.abs(z)) <= EDGE ? 0.15 : height(x, z);
      positions.push(x, y, z);
      const shore = shoreX(z) - x;
      if (shore < 30) c.copy(SAND);
      else c.copy(GREENS[Math.floor((wobble(x, z, 7) * 0.5 + 0.5) * 3.99)]!).multiplyScalar(0.92 + 0.12 * wobble(x * 3, z * 3, 3));
      colors.push(c.r, c.g, c.b);
    }
  }
  const v = (i: number, j: number) => i * (n + 1) + j;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -LAND_R + i * step;
      const z0 = -LAND_R + j * step;
      // Leave the map itself (its own ground), the open sea, and the far corners (outside the sky).
      const inMap = Math.max(Math.abs(x0 + step / 2), Math.abs(z0 + step / 2)) < EDGE;
      const atSea = x0 > shoreX(z0) + 40 && x0 > shoreX(z0 + step) + 40;
      if (inMap || atSea || Math.hypot(x0, z0) > LAND_R - step) continue;
      index.push(v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  return mesh;
}

interface HillSpec {
  x: number;
  z: number;
  /** Footprint radius and height (m). */
  r: number;
  h: number;
  /** Profile: higher is steeper-sided (a granite dome like Sugarloaf). */
  steep: number;
  seed: number;
}

/** One hill: rings of vertices around a peak, forested, bare rock where it's steep, sand at the waterline. */
function hill(spec: HillSpec): THREE.BufferGeometry {
  const rings = 14;
  const segs = 40;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  const profile = (rho: number) => Math.pow(Math.max(0, 1 - Math.pow(rho, spec.steep)), 0.9);
  for (let ri = 0; ri <= rings; ri++) {
    const rho = ri / rings;
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const s = spec.seed;
      const wob = 1 + 0.16 * Math.sin(3 * a + s) + 0.08 * Math.sin(7 * a + s * 2.3) + 0.04 * Math.sin(13 * a + s * 5);
      const r = spec.r * rho * wob;
      const x = spec.x + Math.cos(a) * r;
      const z = spec.z + Math.sin(a) * r;
      const y = spec.h * profile(rho) * (1 + 0.05 * Math.sin(5 * a + s * 3) * rho) - (ri === rings ? 6 : 0);
      positions.push(x, y, z);
      // Steepness from the profile's slope between neighbouring rings.
      const slope = (spec.h * (profile(Math.max(0, rho - 0.04)) - profile(Math.min(1, rho + 0.04)))) / (spec.r * 0.08);
      if (y < 2.5 && x > shoreX(z) - 20) c.copy(SAND);
      else c.copy(GREENS[Math.floor((wobble(x * 2.5, z * 2.5, s) * 0.5 + 0.5) * 3.99)]!).lerp(CLIFF, Math.min(1, Math.max(0, (slope - 1.4) / 0.8)));
      colors.push(c.r, c.g, c.b);
    }
  }
  const stride = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * stride + si;
      const b = a + stride;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  return geo;
}

/** The hills: landmark rocks in and around the bay, then a ring of green morros rising inland. */
function coastHills(): THREE.Mesh {
  const specs: HillSpec[] = [
    // A sheer granite dome at the mouth of the bay, and its low neighbour.
    { x: 840, z: -250, r: 150, h: 300, steep: 5, seed: 1 },
    { x: 700, z: -330, r: 120, h: 130, steep: 2.5, seed: 2 },
    // Islands out in the sea, near the sunset.
    { x: 1080, z: 260, r: 90, h: 80, steep: 2.2, seed: 3 },
    { x: 1260, z: -60, r: 70, h: 55, steep: 2, seed: 4 },
    { x: 940, z: 600, r: 110, h: 120, steep: 2.4, seed: 5 },
    // The tallest peak, inland to the west, facing the sea.
    { x: -980, z: -120, r: 360, h: 430, steep: 1.6, seed: 6 },
  ];
  let s = 54;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let k = 0; k < 64; k++) {
    const a = rand() * Math.PI * 2;
    const r = 580 + rand() * 640;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Land only: well back from the shore.
    if (x > shoreX(z) - 120) continue;
    const t = (r - 580) / 640;
    let h = 50 + t * 230 + rand() * 90;
    let fr = h * (1.2 + rand() * 0.6);
    // The whole footprint (with its wobble) stays outside the map, so no hill pokes into the play area.
    const room = (Math.max(Math.abs(x), Math.abs(z)) - EDGE - 25) / 1.3;
    if (room < 60) continue;
    if (fr > room) {
      h *= room / fr;
      fr = room;
    }
    specs.push({ x, z, r: fr, h, steep: 1.4 + rand() * 1.4, seed: k * 1.7 });
  }
  const geo = mergeGeometries(specs.map(hill))!;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.frustumCulled = false;
  return mesh;
}

/** The sea beyond the map's east edge, and a few sailboats on it. */
function sea(): THREE.Group {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(LAND_R * 2, LAND_R * 2), new THREE.MeshStandardMaterial({ color: SEA_COLOR, roughness: 0.12, metalness: 0.22 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(EDGE - 5 + LAND_R, 0.1, 0);
  g.add(water);
  const hull = new THREE.MeshLambertMaterial({ color: '#f4f4f0' });
  const sail = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  for (const [x, z, yaw] of [[560, 120, 0.4], [620, -60, 2.1], [700, 240, 1.2], [760, 40, -0.6], [900, -120, 0.9], [980, 380, 2.6]] as const) {
    const boat = new THREE.Group();
    boat.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 9), hull));
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 10), sail);
    s1.position.set(0, 5.6, 0.5);
    s1.rotation.y = Math.PI / 2;
    boat.add(s1);
    boat.position.set(x, 0.6, z);
    boat.rotation.y = yaw;
    g.add(boat);
  }
  return g;
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
  // A low (evening) sun gets a bigger, warmer glow.
  const low = Math.max(0, 1 - direction.y / 0.6);
  sprite.scale.setScalar(420 + 260 * low);
  sprite.material.color.set('#ffffff').lerp(new THREE.Color('#ffb46a'), low * 0.7);
  return sprite;
}

export function buildScenery(sunDirection: THREE.Vector3, backdrop: 'mountains' | 'coast' = 'mountains'): THREE.Group {
  const group = new THREE.Group();
  if (backdrop === 'coast') group.add(coastLand(), coastHills(), sea());
  else for (const spec of RANGES) group.add(mountainRange(spec));
  group.add(clouds());
  group.add(sunGlow(sunDirection));
  return group;
}

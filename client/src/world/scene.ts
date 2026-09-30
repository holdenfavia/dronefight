import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA, ARENA_BOXES, type ArenaBox, type ArenaMaterial } from './arenaLayout';
import {
  CONCRETE_TILE_M,
  concreteGroundTexture,
  concreteWallTexture,
  GROUND_TILE_M,
  PAINT_TILE_M,
  padTexture,
  paintedMetalTexture,
} from './textures';

// Art direction per ADR-0007: bright sky, clean light, orange / black / white on concrete.
export const PALETTE = {
  skyZenith: new THREE.Color('#2f86e0'),
  skyHorizon: new THREE.Color('#d9ecfb'),
  fog: new THREE.Color('#cfe4f5'),
  sun: new THREE.Color('#fff4e2'),
  hemiSky: new THREE.Color('#bcdcff'),
  hemiGround: new THREE.Color('#a39580'),
  orange: '#ff6a13',
  steel: '#26282b',
  white: '#eeeeea',
} as const;

const SUN_DIRECTION = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
const GROUND_SIZE = 2400;
const DEG = Math.PI / 180;

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  setShadows(enabled: boolean): void;
}

export function buildWorld(renderer: THREE.WebGPURenderer): World {
  const scene = new THREE.Scene();
  const aniso = renderer.getMaxAnisotropy();

  scene.fog = new THREE.Fog(PALETTE.fog, 250, 1100);
  scene.add(buildSky());

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(300);
  sun.target.position.set(0, 0, 0);
  const shadowCam = sun.shadow.camera;
  const extent = ARENA.halfSize + 10;
  shadowCam.left = -extent;
  shadowCam.right = extent;
  shadowCam.top = extent;
  shadowCam.bottom = -extent;
  shadowCam.near = 100;
  shadowCam.far = 600;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  // The arena never moves, so the shadow map is rendered once and reused: baked, effectively free per frame.
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);

  // Ground.
  const groundTex = concreteGroundTexture(aniso);
  groundTex.repeat.set(GROUND_SIZE / GROUND_TILE_M, GROUND_SIZE / GROUND_TILE_M);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Arena structures: one merged mesh (one draw call) per material.
  const materials = arenaMaterials(aniso);
  const byMaterial = new Map<VisibleMaterial, ArenaBox[]>();
  for (const box of ARENA_BOXES) {
    const mat = box.mat;
    if (mat === 'invisible') continue;
    const list = byMaterial.get(mat) ?? [];
    list.push(box);
    byMaterial.set(mat, list);
  }
  for (const [mat, boxes] of byMaterial) {
    const def = materials[mat];
    const mesh = new THREE.Mesh(mergeBoxes(boxes, def.tileM), def.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    scene,
    sun,
    setShadows(enabled: boolean) {
      if (renderer.shadowMap.enabled === enabled && sun.castShadow === enabled) return;
      renderer.shadowMap.enabled = enabled;
      sun.castShadow = enabled;
      sun.shadow.needsUpdate = true;
      // WebGPU materials bake shadow sampling in at compile time, so they must be rebuilt.
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).needsUpdate = true;
      });
    },
  };
}

function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1100, 32, 16);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 1100);
    c.copy(PALETTE.skyHorizon).lerp(PALETTE.skyZenith, Math.pow(h, 0.55));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(28, 32),
    new THREE.MeshBasicMaterial({ color: '#fffbe8', fog: false, depthWrite: false }),
  );
  sunDisc.position.copy(SUN_DIRECTION).multiplyScalar(1000);
  sunDisc.lookAt(0, 0, 0);
  sky.add(sunDisc);
  return sky;
}

interface MaterialDef {
  material: THREE.Material;
  /** Metres per texture repeat; 0 = stretch once over each face. */
  tileM: number;
}

type VisibleMaterial = Exclude<ArenaMaterial, 'invisible'>;

function arenaMaterials(aniso: number): Record<VisibleMaterial, MaterialDef> {
  const wall = concreteWallTexture(aniso);
  return {
    concrete: {
      material: new THREE.MeshStandardMaterial({ map: wall, roughness: 0.9, metalness: 0 }),
      tileM: CONCRETE_TILE_M,
    },
    orange: {
      material: new THREE.MeshStandardMaterial({
        map: paintedMetalTexture(aniso, PALETTE.orange, 3),
        roughness: 0.45,
        metalness: 0.25,
      }),
      tileM: PAINT_TILE_M,
    },
    steel: {
      material: new THREE.MeshStandardMaterial({
        map: paintedMetalTexture(aniso, PALETTE.steel, 5),
        roughness: 0.55,
        metalness: 0.4,
      }),
      tileM: PAINT_TILE_M,
    },
    white: {
      material: new THREE.MeshStandardMaterial({
        map: paintedMetalTexture(aniso, PALETTE.white, 7),
        roughness: 0.5,
        metalness: 0.15,
      }),
      tileM: PAINT_TILE_M,
    },
    pad: {
      material: new THREE.MeshStandardMaterial({ map: padTexture(aniso), roughness: 0.6 }),
      tileM: 0,
    },
  };
}

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpMatrix = new THREE.Matrix4();
const unitScale = new THREE.Vector3(1, 1, 1);
const tmpPos = new THREE.Vector3();

/** Build real-sized boxes with UVs scaled to world metres so textures don't stretch, then merge. */
function mergeBoxes(boxes: readonly ArenaBox[], tileM: number): THREE.BufferGeometry {
  const geos = boxes.map((box) => {
    const [w, h, d] = box.size;
    const geo = new THREE.BoxGeometry(w, h, d);
    if (tileM > 0) {
      // BoxGeometry faces are ordered +x, -x, +y, -y, +z, -z with 4 vertices each.
      const faceSize: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      const uv = geo.getAttribute('uv');
      for (let face = 0; face < 6; face++) {
        const [fu, fv] = faceSize[face] ?? [1, 1];
        for (let v = 0; v < 4; v++) {
          const i = face * 4 + v;
          uv.setXY(i, (uv.getX(i) * fu) / tileM, (uv.getY(i) * fv) / tileM);
        }
      }
    }
    const rot = box.rot ?? [0, 0, 0];
    tmpQuat.setFromEuler(tmpEuler.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
    tmpMatrix.compose(tmpPos.set(...box.pos), tmpQuat, unitScale);
    geo.applyMatrix4(tmpMatrix);
    return geo;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('Failed to merge arena geometry');
  return merged;
}

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArenaBox, ArenaMaterial, MapDef } from '../../../shared/maps';
import { buildScenery } from './scenery';
import {
  asphaltTexture,
  BUILDING_TILE_M,
  brickTexture,
  CONCRETE_TILE_M,
  concreteGroundTexture,
  facadeTexture,
  foliageTexture,
  glassTexture,
  GRID_TILE_M,
  gridGroundTexture,
  gridTexture,
  roofTexture,
  SIDEWALK_TILE_M,
  sidewalkTexture,
  concreteWallTexture,
  GROUND_TILE_M,
  PAINT_TILE_M,
  padTexture,
  paintedMetalTexture,
  rockTexture,
  ROCK_TILE_M,
} from './textures';

// Art direction per ADR-0007: bright sky, clean light, orange / black / white on concrete.
export const PALETTE = {
  skyZenith: new THREE.Color('#2a78d6'),
  skyHorizon: new THREE.Color('#e4f0f8'),
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
  /** Swap in a map's ground, structures and decor (ADR-0012). Environment and lights stay. */
  setMap(map: MapDef): void;
  /** Settings option: flat colors with grids on every map instead of realistic textures (ADR-0020). */
  setGridStyle(on: boolean): void;
}

export function buildWorld(renderer: THREE.WebGPURenderer): World {
  const scene = new THREE.Scene();
  const aniso = renderer.getMaxAnisotropy();

  scene.fog = new THREE.Fog(PALETTE.fog, 250, 1100);
  scene.add(buildSky());
  scene.add(buildScenery(SUN_DIRECTION));

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  // The arena never moves, so the shadow map is rendered once per map and reused: baked, effectively free per frame.
  sun.shadow.autoUpdate = false;
  scene.add(sun, sun.target);

  const materials = arenaMaterials(aniso);
  const grounds = {
    concrete: groundMaterial(concreteGroundTexture(aniso)),
    asphalt: groundMaterial(asphaltTexture(aniso)),
    grid: groundMaterial(gridGroundTexture(aniso)),
    rock: groundMaterial(rockTexture(aniso, true)),
  };
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  let arena: THREE.Group | null = null;
  let currentGround: MapDef['ground'] = 'concrete';
  let groundMesh: THREE.Mesh | null = null;
  let gridStyle = false;
  const gridAlternates = gridVersions(materials, aniso);
  const materialFor = (key: VisibleMaterial) => (gridStyle ? gridAlternates[key] : materials[key].material);

  /** A map's light and air (ADR-0048): a cave gets dark, near fog and dimmer fill; open maps the defaults. */
  function applyAtmosphere(map: MapDef): void {
    const a = map.atmosphere;
    const fog = scene.fog as THREE.Fog;
    fog.color.set(a ? a.fog : PALETTE.fog);
    fog.near = a ? a.fogNear : 250;
    fog.far = a ? a.fogFar : 1100;
    hemi.color.set(a ? a.hemiSky : PALETTE.hemiSky);
    hemi.groundColor.set(a ? a.hemiGround : PALETTE.hemiGround);
    hemi.intensity = a ? a.hemiIntensity : 1.15;
    sun.intensity = a ? a.sunIntensity : 3.2;
  }

  function setMap(map: MapDef): void {
    applyAtmosphere(map);
    if (arena) {
      scene.remove(arena);
      arena.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== groundGeo) o.geometry.dispose();
      });
    }
    arena = new THREE.Group();

    currentGround = map.ground;
    const ground = new THREE.Mesh(groundGeo, gridStyle ? grounds.grid : grounds[map.ground]);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    arena.add(ground);
    groundMesh = ground;

    // Structures and decor: one merged mesh (one draw call) per material each.
    for (const [boxes, solid] of [
      [map.boxes, true],
      [map.decor, false],
    ] as const) {
      const byMaterial = new Map<VisibleMaterial, ArenaBox[]>();
      for (const box of boxes) {
        const mat = box.mat;
        if (mat === 'invisible') continue;
        const list = byMaterial.get(mat) ?? [];
        list.push(box);
        byMaterial.set(mat, list);
      }
      for (const [mat, list] of byMaterial) {
        const def = materials[mat];
        const mesh = new THREE.Mesh(mergeBoxes(list, def.tileM), materialFor(mat));
        mesh.userData.matKey = mat;
        mesh.castShadow = solid;
        mesh.receiveShadow = true;
        arena.add(mesh);
      }
    }
    // Outlines on boxes that ask for them (detailed buildings): every edge, merged into one line mesh.
    const edged = [...map.boxes, ...map.decor].filter((b) => b.edge && b.mat !== 'invisible');
    if (edged.length) arena.add(new THREE.LineSegments(mergeEdges(edged), edgeMaterial));
    scene.add(arena);

    // Fit the shadow camera to this map and re-bake it.
    const extent = map.halfSize + 20;
    sun.position.copy(SUN_DIRECTION).multiplyScalar(500);
    sun.target.position.set(0, 0, 0);
    const cam = sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 200;
    cam.far = 900;
    cam.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }

  function setGridStyle(on: boolean): void {
    if (on === gridStyle) return;
    gridStyle = on;
    arena?.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.matKey) o.material = materialFor(o.userData.matKey as VisibleMaterial);
    });
    if (groundMesh) groundMesh.material = on ? grounds.grid : grounds[currentGround];
  }

  return {
    scene,
    sun,
    setMap,
    setGridStyle,
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

function groundMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  tex.repeat.set(GROUND_SIZE / GROUND_TILE_M, GROUND_SIZE / GROUND_TILE_M);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
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
    facade: {
      material: new THREE.MeshStandardMaterial({ map: facadeTexture(aniso), roughness: 0.7, metalness: 0.05 }),
      tileM: BUILDING_TILE_M,
    },
    glass: {
      material: new THREE.MeshStandardMaterial({ map: glassTexture(aniso), roughness: 0.2, metalness: 0.5 }),
      tileM: BUILDING_TILE_M,
    },
    brick: {
      material: new THREE.MeshStandardMaterial({ map: brickTexture(aniso), roughness: 0.85 }),
      tileM: BUILDING_TILE_M,
    },
    roof: {
      material: new THREE.MeshStandardMaterial({ map: roofTexture(aniso), roughness: 0.95 }),
      tileM: BUILDING_TILE_M,
    },
    sidewalk: {
      material: new THREE.MeshStandardMaterial({ map: sidewalkTexture(aniso), roughness: 0.9 }),
      tileM: SIDEWALK_TILE_M,
    },
    foliage: {
      material: new THREE.MeshStandardMaterial({ map: foliageTexture(aniso), roughness: 0.9 }),
      tileM: 2,
    },
    paint: {
      material: new THREE.MeshStandardMaterial({ color: '#f2f1ec', roughness: 0.7 }),
      tileM: 0,
    },
    // Playground grid colors (ADR-0019).
    gridRed: grid('#e5483e'),
    gridBlue: grid('#2f7fe0'),
    gridYellow: grid('#f5c63a'),
    gridGreen: grid('#45b865'),
    gridPurple: grid('#8a5cd6'),
    gridOrange: grid('#ff8a2a'),
    gridWhite: grid('#eeeeec'),
    gridSand: grid('#e6d49c'),
    // Cavern (ADR-0048): rock, and crystals that glow (emissive, so they read in the dark).
    rock: {
      material: new THREE.MeshStandardMaterial({ map: rockTexture(aniso), roughness: 0.95, metalness: 0 }),
      tileM: ROCK_TILE_M,
    },
    crystal: {
      material: new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: '#3ad0ff', emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1 }),
      tileM: 0,
    },
    // Rivers, ponds, the harbor (ADR-0049): deep blue and glossy, catching the sky.
    water: {
      material: new THREE.MeshStandardMaterial({ color: '#2d6f9e', roughness: 0.12, metalness: 0.35 }),
      tileM: 0,
    },
  };

  function grid(color: string): MaterialDef {
    return { material: new THREE.MeshStandardMaterial({ map: gridTexture(aniso, color), roughness: 0.75, metalness: 0 }), tileM: GRID_TILE_M };
  }
}

/** Flat colors standing in for each realistic material when grid textures are on (ADR-0020). */
const GRID_EQUIVALENT: Record<Exclude<VisibleMaterial, `grid${string}` | 'pad'>, string> = {
  concrete: '#b9bdc3',
  orange: '#ff7a26',
  steel: '#44484e',
  white: '#eeeeec',
  facade: '#d8d0c2',
  glass: '#4a86c4',
  brick: '#b85c46',
  roof: '#62666c',
  sidewalk: '#cbc7bf',
  foliage: '#45b865',
  rock: '#8a7f74',
  crystal: '#7fe8ff',
  water: '#3a86c8',
  paint: '#f2f1ec',
};

/**
 * Grid-style versions of every material. Each keeps grid lines 1 m apart in the world: the mesh UVs
 * were built for the original texture's tile size, so the grid texture's repeat is scaled to match.
 */
function gridVersions(materials: Record<VisibleMaterial, MaterialDef>, aniso: number): Record<VisibleMaterial, THREE.Material> {
  const out = {} as Record<VisibleMaterial, THREE.Material>;
  for (const key of Object.keys(materials) as VisibleMaterial[]) {
    const def = materials[key];
    if (key.startsWith('grid') || key === 'pad') {
      out[key] = def.material;
      continue;
    }
    const tex = gridTexture(aniso, GRID_EQUIVALENT[key as keyof typeof GRID_EQUIVALENT]);
    const scale = def.tileM > 0 ? def.tileM / GRID_TILE_M : 1;
    tex.repeat.set(scale, scale);
    out[key] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 });
  }
  return out;
}

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpMatrix = new THREE.Matrix4();
const unitScale = new THREE.Vector3(1, 1, 1);
const tmpPos = new THREE.Vector3();

/** Build real-sized boxes with UVs scaled to world metres so textures don't stretch, then merge. */
/** Dark outlines for detailed buildings: thin, unlit, one draw call per map. */
const edgeMaterial = new THREE.LineBasicMaterial({ color: '#1a1b1e', transparent: true, opacity: 0.85 });

/** The 12 edges of every box, placed and turned like the box, in one geometry. */
function mergeEdges(boxes: readonly ArenaBox[]): THREE.BufferGeometry {
  const unit = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const src = unit.getAttribute('position');
  const out = new Float32Array(boxes.length * src.count * 3);
  const v = new THREE.Vector3();
  let k = 0;
  for (const box of boxes) {
    const rot = box.rot ?? [0, 0, 0];
    tmpQuat.setFromEuler(tmpEuler.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
    tmpMatrix.compose(tmpPos.set(...box.pos), tmpQuat, new THREE.Vector3(box.size[0], box.size[1], box.size[2]));
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i).applyMatrix4(tmpMatrix);
      out[k++] = v.x;
      out[k++] = v.y;
      out[k++] = v.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return geo;
}

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

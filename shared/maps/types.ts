import type { MoverDef } from './movers.js';

// Map data shared by client and server (ADR-0012). Rendering, flight collisions and server-side
// bullet checks are all generated from the same boxes, so what you see is exactly what you hit.

export type ArenaMaterial =
  | 'orange'
  | 'concrete'
  | 'steel'
  | 'white'
  | 'pad'
  | 'facade'
  | 'glass'
  | 'brick'
  | 'roof'
  | 'sidewalk'
  | 'foliage'
  | 'paint'
  | 'gridRed'
  | 'gridBlue'
  | 'gridYellow'
  | 'gridGreen'
  | 'gridPurple'
  | 'gridOrange'
  | 'gridWhite'
  | 'gridSand'
  /** Cavern (ADR-0048): cave rock, and glowing crystal. */
  | 'rock'
  | 'crystal'
  /** Rivers, ponds, harbors (ADR-0049). */
  | 'water'
  | 'invisible';

export interface ArenaBox {
  /** Center position (m). */
  pos: [number, number, number];
  /** Full size (m). */
  size: [number, number, number];
  /** Euler rotation in degrees, XYZ order. */
  rot?: [number, number, number];
  mat: ArenaMaterial;
  /** Draw a dark outline along its edges (detailed buildings, the Detail test map). */
  edge?: boolean;
}

export interface SpawnPoint {
  pos: [number, number, number];
  yawDeg: number;
}

/** Static things that blow up when shot (ADR-0023). Not part of `boxes`: they can disappear. */
export type ExplosiveKind = 'car' | 'fuel' | 'propane' | 'water';

export interface ExplosiveDef {
  kind: ExplosiveKind;
  /** Center of the collision box (m). */
  pos: [number, number, number];
  /** Width, height, length (m); length runs along local Z, turned by yawDeg. */
  size: [number, number, number];
  yawDeg?: number;
  /** Body color for cars and tanks; kinds have defaults. */
  color?: string;
}

export type MapId = 'downtown' | 'yard' | 'playground' | 'cavern' | 'training' | 'lab';

export interface MapDef {
  id: MapId;
  name: string;
  /** Flyable area is x, z in [-halfSize, halfSize]. */
  halfSize: number;
  /** Everything you can hit. */
  boxes: readonly ArenaBox[];
  /** Scenery outside the play area: drawn, never collided with. */
  decor: readonly ArenaBox[];
  /** 8 per map; the server picks one at random away from opponents (ADR-0012). */
  spawns: readonly SpawnPoint[];
  ground: 'concrete' | 'asphalt' | 'grid' | 'rock';
  /** Moving props: traffic, coaster trains, tractors (ADR-0020). Posed from the shared clock. */
  movers?: readonly MoverDef[];
  /** Static explosives: parked cars, barrels, propane and water tanks (ADR-0023). */
  explosives?: readonly ExplosiveDef[];
  /** Lighting and fog for enclosed maps (ADR-0048); omitted = open sky. */
  atmosphere?: Atmosphere;
}

/** A map's own light and air (ADR-0048), e.g. a cave: fog color and range, ambient light, sun strength. */
export interface Atmosphere {
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunIntensity: number;
}

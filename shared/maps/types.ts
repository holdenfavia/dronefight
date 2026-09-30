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
  | 'invisible';

export interface ArenaBox {
  /** Center position (m). */
  pos: [number, number, number];
  /** Full size (m). */
  size: [number, number, number];
  /** Euler rotation in degrees, XYZ order. */
  rot?: [number, number, number];
  mat: ArenaMaterial;
}

export interface SpawnPoint {
  pos: [number, number, number];
  yawDeg: number;
}

export type MapId = 'downtown' | 'yard' | 'playground' | 'training';

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
  ground: 'concrete' | 'asphalt' | 'grid';
}

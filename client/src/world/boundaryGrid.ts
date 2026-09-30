import * as THREE from 'three/webgpu';

/**
 * Edge-of-world warning: an orange grid on the invisible boundary wall that fades in only as you get close,
 * centered on where you are, so you see the wall before you hit it. Four patches (one per wall),
 * hidden when you're far from every wall.
 */

/** Start showing the grid this far from a wall (m). */
const FADE_START = 35;
/** Patch size on the wall (m) and grid cell size (m). */
const PATCH = 60;
const CELL = 3;
const MAX_OPACITY = 0.95;
/** The boundary colliders are 2 m thick and centered on ±halfSize; their inner face is 1 m in. */
const WALL_INSET = 1.05;

function gridTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // Orange reads against both bright sky and concrete (ADR-0007 palette).
    ctx.fillStyle = 'rgba(255,106,19,1)';
    ctx.fillRect(0, 0, size, 5);
    ctx.fillRect(0, 0, 5, size);
    // Small cross in each cell center for depth cues when close.
    ctx.fillStyle = 'rgba(255,106,19,0.55)';
    ctx.fillRect(size / 2 - 6, size / 2 - 1, 12, 2);
    ctx.fillRect(size / 2 - 1, size / 2 - 6, 2, 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(PATCH / CELL, PATCH / CELL);
  return tex;
}

function fadeTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    // alphaMap reads the green channel: bright center, fading to nothing at the edge of the patch.
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#888888');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

interface Wall {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  map: THREE.Texture;
  /** Which world axis the wall faces across, and which side. */
  axis: 'x' | 'z';
  sign: 1 | -1;
  /** World axis that the patch's local +X runs along, and its direction. */
  along: 'x' | 'z';
  alongSign: 1 | -1;
}

export class BoundaryGrid {
  private readonly walls: Wall[] = [];
  private halfSize = 150;

  constructor(scene: THREE.Scene) {
    const alpha = fadeTexture();
    const specs: [Wall['axis'], Wall['sign'], number, Wall['along'], Wall['alongSign']][] = [
      ['x', 1, -Math.PI / 2, 'z', 1],
      ['x', -1, Math.PI / 2, 'z', -1],
      ['z', 1, Math.PI, 'x', -1],
      ['z', -1, 0, 'x', 1],
    ];
    for (const [axis, sign, rotY, along, alongSign] of specs) {
      const map = gridTexture();
      const material = new THREE.MeshBasicMaterial({
        map,
        alphaMap: alpha,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PATCH, PATCH), material);
      mesh.rotation.y = rotY;
      mesh.visible = false;
      mesh.renderOrder = 10;
      scene.add(mesh);
      this.walls.push({ mesh, material, map, axis, sign, along, alongSign });
    }
  }

  setHalfSize(half: number): void {
    this.halfSize = half;
  }

  update(pos: THREE.Vector3): void {
    const wallAt = this.halfSize - WALL_INSET;
    for (const w of this.walls) {
      const coord = w.axis === 'x' ? pos.x : pos.z;
      const dist = wallAt - coord * w.sign;
      if (dist > FADE_START) {
        w.mesh.visible = false;
        continue;
      }
      const t = 1 - Math.max(0, dist) / FADE_START;
      w.material.opacity = MAX_OPACITY * Math.pow(t, 1.2);
      w.mesh.visible = true;

      const alongCoord = w.along === 'x' ? pos.x : pos.z;
      if (w.axis === 'x') w.mesh.position.set(w.sign * wallAt, pos.y, alongCoord);
      else w.mesh.position.set(alongCoord, pos.y, w.sign * wallAt);

      // Scroll the grid so its lines stay fixed in the world while the patch follows you.
      const reps = PATCH / CELL;
      w.map.offset.set(
        (((w.alongSign * alongCoord) / CELL - reps / 2) % 1 + 1) % 1,
        ((pos.y / CELL - reps / 2) % 1 + 1) % 1,
      );
    }
  }
}

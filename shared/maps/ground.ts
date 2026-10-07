// The ground plane (y = 0) with optional rectangular holes (ADR-0054): a pit you can fly down into. Shared so
// the renderer, the physics floor and the server's bullet checks all leave the same gaps.

/** A hole in the ground: center and full size on the ground plane (m). */
export interface GroundHole {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Inside a hole (so no ground there). */
export function inHole(holes: readonly GroundHole[] | undefined, x: number, z: number): boolean {
  return !!holes?.some((h) => Math.abs(x - h.x) < h.w / 2 && Math.abs(z - h.z) < h.d / 2);
}

/**
 * The ground as rectangles [x0, z0, x1, z1] covering [-half, half]² minus the holes: the plane is cut into a
 * grid at every hole edge and every cell that isn't a hole is kept.
 */
export function groundRects(half: number, holes: readonly GroundHole[] = []): [number, number, number, number][] {
  if (!holes.length) return [[-half, -half, half, half]];
  const xs = [...new Set([-half, half, ...holes.flatMap((h) => [h.x - h.w / 2, h.x + h.w / 2])])].sort((a, b) => a - b);
  const zs = [...new Set([-half, half, ...holes.flatMap((h) => [h.z - h.d / 2, h.z + h.d / 2])])].sort((a, b) => a - b);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cz = (zs[j]! + zs[j + 1]!) / 2;
      if (!inHole(holes, cx, cz)) out.push([xs[i]!, zs[j]!, xs[i + 1]!, zs[j + 1]!]);
    }
  }
  return out;
}

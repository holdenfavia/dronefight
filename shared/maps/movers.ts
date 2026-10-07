// Moving props (ADR-0020): closed routes and poses as pure functions of time, so every client that
// shares a clock sees every prop in the same place without any networking.

export type V3 = [number, number, number];

export interface Route {
  /** Closed loop: the last point connects back to the first. */
  points: V3[];
  /** Cumulative distance at each point; cum[i] is the distance from points[0] to points[i]. */
  cum: number[];
  length: number;
}

/** Coaster timing: distance along the route at uniform time steps over one lap (energy-conserving speed). */
export interface Timing {
  lapSeconds: number;
  dt: number;
  distances: number[];
}

export type MoverKind = 'car' | 'tractor' | 'trailer' | 'coasterCar' | 'plane';

export interface MoverDef {
  kind: MoverKind;
  route: Route;
  /** Distance along the route at time 0 (m). */
  offset: number;
  /** Constant speed (m/s), unless `timing` is given. */
  speed?: number;
  /** Always face this way (degrees, like a spawn's yaw) instead of along the route: a drop-tower seat (ADR-0049). */
  heading?: number;
  timing?: Timing;
  /** Body color. */
  color: string;
  /** Collision box (width, height, length); length runs along the direction of travel. */
  size: V3;
  /** Height of the collision box center above the route point (m). */
  lift: number;
}

export function routeFromPoints(points: V3[]): Route {
  const cum = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i % points.length]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { points, cum, length: cum[points.length]! };
}

/**
 * A rounded rectangle on the ground at height y, from (x0, z0) to (x1, z1), corner radius r.
 * `clockwise` as seen from above (+Y looking down).
 */
export function roundedRect(x0: number, z0: number, x1: number, z1: number, r: number, y: number, clockwise: boolean, arcSteps = 8): V3[] {
  const pts: V3[] = [];
  // Corners in counterclockwise order (seen from above, X right, Z down the screen), with arc start angles.
  const corners: [number, number, number][] = [
    [x1 - r, z0 + r, -Math.PI / 2],
    [x1 - r, z1 - r, 0],
    [x0 + r, z1 - r, Math.PI / 2],
    [x0 + r, z0 + r, Math.PI],
  ];
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= arcSteps; i++) {
      const a = start + (i / arcSteps) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
    }
  }
  return clockwise ? pts.reverse() : pts;
}

/** Position and unit direction at `dist` metres along the route (wraps). */
export function sampleRoute(route: Route, dist: number, pos: V3, dir: V3): void {
  const L = route.length;
  let d = dist % L;
  if (d < 0) d += L;
  // Binary search for the segment.
  let lo = 0;
  let hi = route.points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (route.cum[mid]! <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = route.points[lo]!;
  const b = route.points[(lo + 1) % route.points.length]!;
  const seg = route.cum[lo + 1]! - route.cum[lo]!;
  const t = seg > 0 ? (d - route.cum[lo]!) / seg : 0;
  pos[0] = a[0] + (b[0] - a[0]) * t;
  pos[1] = a[1] + (b[1] - a[1]) * t;
  pos[2] = a[2] + (b[2] - a[2]) * t;
  const len = seg || 1;
  dir[0] = (b[0] - a[0]) / len;
  dir[1] = (b[1] - a[1]) / len;
  dir[2] = (b[2] - a[2]) / len;
}

/**
 * Coaster timing: speed from energy conservation, v = sqrt(vTop² + 2g(yMax − y)), integrated over one
 * lap and tabulated at uniform time steps so position(t) is a cheap lookup.
 */
export function coasterTiming(route: Route, vTop: number, g = 9.81, dt = 1 / 30): Timing {
  const yMax = Math.max(...route.points.map((p) => p[1]));
  const speedAt = (y: number) => Math.sqrt(vTop * vTop + 2 * g * (yMax - y));
  // Time at each route point.
  const times = [0];
  for (let i = 1; i <= route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i % route.points.length]!;
    const v = (speedAt(a[1]) + speedAt(b[1])) / 2;
    times.push(times[i - 1]! + (route.cum[i]! - route.cum[i - 1]!) / v);
  }
  const lapSeconds = times[route.points.length]!;
  const distances: number[] = [];
  let j = 0;
  for (let t = 0; t <= lapSeconds + dt; t += dt) {
    while (j < route.points.length - 1 && times[j + 1]! < t) j++;
    const span = times[j + 1]! - times[j]!;
    const f = span > 0 ? Math.min(1, (t - times[j]!) / span) : 0;
    distances.push(route.cum[j]! + (route.cum[j + 1]! - route.cum[j]!) * f);
  }
  return { lapSeconds, dt, distances };
}

/** How far along its route a mover is at time t (seconds). */
export function moverDistance(m: MoverDef, t: number): number {
  if (m.timing) {
    const T = m.timing;
    let lt = t % T.lapSeconds;
    if (lt < 0) lt += T.lapSeconds;
    const i = Math.min(T.distances.length - 2, Math.floor(lt / T.dt));
    const f = (lt - i * T.dt) / T.dt;
    return T.distances[i]! + (T.distances[i + 1]! - T.distances[i]!) * f + m.offset;
  }
  return (m.speed ?? 0) * t + m.offset;
}

/** A mover's pose at time t: route position (plus lift) and direction of travel. */
export function moverPose(m: MoverDef, t: number, pos: V3, dir: V3): void {
  sampleRoute(m.route, moverDistance(m, t), pos, dir);
  pos[1] += m.lift;
  if (m.heading !== undefined) {
    const h = (m.heading * Math.PI) / 180;
    dir[0] = -Math.sin(h);
    dir[1] = 0;
    dir[2] = -Math.cos(h);
  }
}

/**
 * A drop tower ride (ADR-0049) on a two-point route (bottom, top): a slow lift, a pause at the top, a
 * free-fall drop, a hard brake, and a pause at the bottom, tabulated like coasterTiming.
 */
export function dropTowerTiming(height: number, dt = 1 / 30): Timing {
  const lift = 12;
  const top = 3;
  const g = 9.81;
  // Free fall for most of the height, then braking over the last 25%.
  const fallH = height * 0.75;
  const fall = Math.sqrt((2 * fallH) / g);
  const v = g * fall;
  const brake = (2 * (height - fallH)) / v;
  const bottom = 5;
  const lapSeconds = lift + top + fall + brake + bottom;
  const distances: number[] = [];
  for (let t = 0; t <= lapSeconds + dt; t += dt) {
    let d: number;
    if (t < lift) d = (height * (1 - Math.cos((Math.PI * t) / lift))) / 2;
    else if (t < lift + top) d = height;
    else if (t < lift + top + fall) {
      const u = t - lift - top;
      d = height + 0.5 * g * u * u;
    } else if (t < lift + top + fall + brake) {
      const u = t - lift - top - fall;
      d = height + fallH + v * u - (0.5 * v * u * u) / brake;
    } else d = height * 2;
    distances.push(Math.min(height * 2, d));
  }
  return { lapSeconds, dt, distances };
}

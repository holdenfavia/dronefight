/**
 * Time for a round fired now to meet a target moving at constant velocity (ADR-0011 lead indicator).
 * Rounds don't inherit the shooter's velocity, so solve |D + V t| = s t for the first positive t.
 * D = target - shooter, V = target velocity, s = round speed. Returns null if it can't be reached.
 */
export function interceptTime(dx: number, dy: number, dz: number, vx: number, vy: number, vz: number, speed: number): number | null {
  const a = vx * vx + vy * vy + vz * vz - speed * speed;
  const b = 2 * (dx * vx + dy * vy + dz * vz);
  const c = dx * dx + dy * dy + dz * dz;
  if (Math.abs(a) < 1e-9) {
    // Target as fast as the round: linear case.
    return b < 0 ? -c / b : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  const t1 = (-b - r) / (2 * a);
  const t2 = (-b + r) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) ? t : null;
}

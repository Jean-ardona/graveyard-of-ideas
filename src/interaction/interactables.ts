import type { PointerMode } from './pointerLock';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Something the player can act on with E. `action` names the handler that runs. */
export interface Interactable {
  id: string;
  position: Vec3;
  /** Reach in world units, measured from the eye to `position`. */
  radius: number;
  label: string;
  action: string;
  enabled: boolean;
}

/** The view cone is this many degrees either side of the camera forward direction. */
export const VIEW_HALF_ANGLE_DEG = 35;
export const COS_VIEW_HALF_ANGLE = Math.cos((VIEW_HALF_ANGLE_DEG * Math.PI) / 180);

export function distanceSq(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Cosine of the angle between `forward` (unit length) and the direction from `origin`
 * to `target`. A target at the origin counts as dead ahead.
 */
export function cosAngleTo(origin: Vec3, forward: Vec3, target: Vec3): number {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length === 0) return 1;
  return (dx * forward.x + dy * forward.y + dz * forward.z) / length;
}

/** The player may act only while looking is active: pointer locked, or click-and-drag fallback. */
export function allowsInteraction(mode: PointerMode): boolean {
  return mode === 'locked' || mode === 'fallback';
}

/**
 * Nearest enabled interactable within its radius and inside the view cone.
 * Ties on distance go to the smaller angle, then to the lower id, so the result is stable.
 * Allocation free.
 */
export function selectFocus(
  items: readonly Interactable[],
  origin: Vec3,
  forward: Vec3,
  cosHalfAngle: number = COS_VIEW_HALF_ANGLE,
): Interactable | null {
  let best: Interactable | null = null;
  let bestDistance = Infinity;
  let bestCos = -Infinity;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.enabled) continue;
    const d2 = distanceSq(origin, item.position);
    if (d2 > item.radius * item.radius || d2 > bestDistance) continue;
    const cos = cosAngleTo(origin, forward, item.position);
    if (cos < cosHalfAngle) continue;
    const better =
      d2 < bestDistance ||
      cos > bestCos ||
      (cos === bestCos && best !== null && item.id < best.id);
    if (better) {
      best = item;
      bestDistance = d2;
      bestCos = cos;
    }
  }
  return best;
}

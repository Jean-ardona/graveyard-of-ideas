import type { BoxCollider } from '../world/config';

export interface Point {
  x: number;
  z: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const EPSILON = 1e-6;

/**
 * Pushes a circle out of one oriented box. Returns the corrected position,
 * or the same point when there is no overlap.
 */
export function pushOutOfBox(point: Point, radius: number, box: BoxCollider): Point {
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  const dx = point.x - box.x;
  const dz = point.z - box.z;
  // World to box-local coordinates (box rotated by `rotation` around Y).
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;

  const nearestX = Math.max(-box.halfWidth, Math.min(box.halfWidth, lx));
  const nearestZ = Math.max(-box.halfDepth, Math.min(box.halfDepth, lz));
  const offsetX = lx - nearestX;
  const offsetZ = lz - nearestZ;
  const distance = Math.hypot(offsetX, offsetZ);
  if (distance >= radius) return point;

  let pushX: number;
  let pushZ: number;
  if (distance > EPSILON) {
    const scale = (radius - distance) / distance;
    pushX = offsetX * scale;
    pushZ = offsetZ * scale;
  } else {
    // Center is inside the box: leave through the nearest face.
    const exitX = box.halfWidth - Math.abs(lx);
    const exitZ = box.halfDepth - Math.abs(lz);
    if (exitX < exitZ) {
      pushX = (lx >= 0 ? 1 : -1) * (exitX + radius);
      pushZ = 0;
    } else {
      pushX = 0;
      pushZ = (lz >= 0 ? 1 : -1) * (exitZ + radius);
    }
  }
  // Box-local push back to world.
  return {
    x: point.x + pushX * cos + pushZ * sin,
    z: point.z - pushX * sin + pushZ * cos,
  };
}

export function clampToBounds(point: Point, bounds: Bounds): Point {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, point.z)),
  };
}

/**
 * Keeps a circle inside the bounds and outside every box. Because the
 * correction only removes the overlapping part, a move along a wall slides.
 */
export function resolveCollisions(
  point: Point,
  radius: number,
  colliders: readonly BoxCollider[],
  bounds: Bounds,
): Point {
  let resolved = point;
  // Two passes settle corners where two colliders touch.
  for (let pass = 0; pass < 2; pass++) {
    for (const box of colliders) resolved = pushOutOfBox(resolved, radius, box);
    resolved = clampToBounds(resolved, bounds);
  }
  return resolved;
}

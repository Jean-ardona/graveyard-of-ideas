/** Pure ground-plane geometry: no React, no Three.js. */

export interface GroundPoint {
  x: number;
  z: number;
}

/**
 * Smallest cosine between a tomb's facing direction and the direction to the player for the
 * player to count as "in front" (the book's side). 0.35 is about a 70 degree half-angle.
 */
export const FRONT_MIN_DOT = 0.35;

/**
 * True when the player stands on the side of the tomb that faces `tombFacing` (a unit vector on
 * the ground plane): the dot product of the facing and the normalized tomb-to-player
 * direction is at least `minDot`. Height is ignored. A player at the tomb position, or a
 * facing of zero length, gives false. Allocation free.
 */
export function isInFrontOfTomb(
  tombPosition: GroundPoint,
  tombFacing: GroundPoint,
  playerPosition: GroundPoint,
  minDot: number = FRONT_MIN_DOT,
): boolean {
  const dx = playerPosition.x - tombPosition.x;
  const dz = playerPosition.z - tombPosition.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length === 0) return false;
  return (tombFacing.x * dx + tombFacing.z * dz) / length >= minDot;
}

import type { BoxCollider } from '../world/config';
import { resolveCollisions, type Bounds, type Point } from './collision';

/** Units per second. */
export const WALK_SPEED = 2.0;
export const SPRINT_SPEED = 3.2;
/** Longest frame step in seconds, so a tab switch does not teleport the player. */
export const MAX_DELTA = 0.1;

export interface MoveAxes {
  /** +1 forward, -1 backward. */
  forward: number;
  /** +1 right, -1 left. */
  strafe: number;
}

const FORWARD_KEYS = ['z', 'w', 'arrowup'];
const BACKWARD_KEYS = ['s', 'arrowdown'];
const LEFT_KEYS = ['q', 'a', 'arrowleft'];
const RIGHT_KEYS = ['d', 'arrowright'];

/** Every key the controller reacts to, lowercase. Shift is handled separately. */
export const MOVEMENT_KEYS: ReadonlySet<string> = new Set([
  ...FORWARD_KEYS,
  ...BACKWARD_KEYS,
  ...LEFT_KEYS,
  ...RIGHT_KEYS,
]);

function axis(keys: ReadonlySet<string>, positive: string[], negative: string[]): number {
  const up = positive.some((key) => keys.has(key)) ? 1 : 0;
  const down = negative.some((key) => keys.has(key)) ? 1 : 0;
  return up - down;
}

/** Converts the set of held (lowercase) keys into movement axes. */
export function keysToAxes(keys: ReadonlySet<string>): MoveAxes {
  return {
    forward: axis(keys, FORWARD_KEYS, BACKWARD_KEYS),
    strafe: axis(keys, RIGHT_KEYS, LEFT_KEYS),
  };
}

export function clampDelta(delta: number): number {
  return Math.max(0, Math.min(MAX_DELTA, delta));
}

/**
 * Moves the player on the ground plane. Yaw 0 faces -z; diagonal movement is
 * normalized so it is not faster than straight movement.
 */
export function stepPlayer(
  position: Point,
  axes: MoveAxes,
  yaw: number,
  fast: boolean,
  delta: number,
  radius: number,
  colliders: readonly BoxCollider[],
  bounds: Bounds,
): Point {
  const length = Math.hypot(axes.forward, axes.strafe);
  if (length === 0) return position;
  const speed = fast ? SPRINT_SPEED : WALK_SPEED;
  const distance = speed * clampDelta(delta);
  const forward = (axes.forward / length) * distance;
  const strafe = (axes.strafe / length) * distance;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const moved = {
    x: position.x - sin * forward + cos * strafe,
    z: position.z - cos * forward - sin * strafe,
  };
  return resolveCollisions(moved, radius, colliders, bounds);
}

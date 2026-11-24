/**
 * Where the camera must look to face a slot. Pure: no React, Three.js, DOM, store or timers.
 * Same convention as the player look: yaw 0 faces -z and positive yaw turns left; positive pitch looks up.
 */

export const MAX_LOOK_PITCH = (75 * Math.PI) / 180;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Look {
  yaw: number;
  pitch: number;
}

const TWO_PI = Math.PI * 2;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** `angle` wrapped into [-PI, PI]: the shortest turn that has the same effect. */
export function shortestAngle(angle: number): number {
  const wrapped = finiteOr(angle, 0) % TWO_PI;
  if (wrapped > Math.PI) return wrapped - TWO_PI;
  if (wrapped < -Math.PI) return wrapped + TWO_PI;
  return wrapped;
}

/**
 * Writes into `out` the look that faces `target` from `eye`, starting from `start`. The yaw is
 * `start.yaw` plus the shortest turn, so it is never more than 180 degrees away from the start and
 * the camera never spins the long way. The pitch is clamped to 75 degrees. Every output is finite for
 * any input: a target straight above or below the eye keeps the start yaw, and a bad number counts as 0.
 */
export function lookAtSlot(eye: Point3, target: Point3, start: Look, out: Look): Look {
  const startYaw = finiteOr(start.yaw, 0);
  const startPitch = finiteOr(start.pitch, 0);
  const dx = finiteOr(target.x, 0) - finiteOr(eye.x, 0);
  const dy = finiteOr(target.y, 0) - finiteOr(eye.y, 0);
  const dz = finiteOr(target.z, 0) - finiteOr(eye.z, 0);
  const flat = Math.hypot(dx, dz);
  const facing = flat > 1e-9 ? Math.atan2(-dx, -dz) : startYaw;
  const pitch = flat > 1e-9 || dy !== 0 ? Math.atan2(dy, flat) : startPitch;
  out.yaw = startYaw + shortestAngle(facing - startYaw);
  out.pitch = Math.max(-MAX_LOOK_PITCH, Math.min(MAX_LOOK_PITCH, finiteOr(pitch, 0)));
  return out;
}

/** Writes into `out` the look a fraction `t` (clamped to [0, 1]) of the way from `from` to `to`. */
export function turnLook(from: Look, to: Look, t: number, out: Look): Look {
  const k = t > 0 ? Math.min(t, 1) : 0;
  out.yaw = from.yaw + (to.yaw - from.yaw) * k;
  out.pitch = from.pitch + (to.pitch - from.pitch) * k;
  return out;
}

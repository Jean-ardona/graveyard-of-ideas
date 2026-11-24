/**
 * Camera pose record and the helpers both camera paths share. Pure: no React, Three.js, DOM,
 * store or timers, and no random source.
 * Same convention as the player look: yaw 0 faces -z and positive yaw turns left; positive pitch looks up.
 */

/** Radians: the camera never looks more than 75 degrees up or down. */
export const MAX_POSE_PITCH = (75 * Math.PI) / 180;

const TWO_PI = Math.PI * 2;

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export function createCameraPose(): CameraPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
}

/** Copies every field of `from` into `to` and returns `to`. */
export function copyPose(from: CameraPose, to: CameraPose): CameraPose {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.yaw = from.yaw;
  to.pitch = from.pitch;
  return to;
}

/** `value` when it is a finite number, otherwise `fallback`. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * `angle` wrapped into (-PI, PI]: the shortest turn with the same effect. A half turn is always +PI
 * (both 3 PI and -PI give +PI). A bad number counts as 0.
 */
export function wrapPi(angle: number): number {
  const wrapped = finiteOr(angle, 0) % TWO_PI;
  if (wrapped > Math.PI) return wrapped - TWO_PI;
  if (wrapped <= -Math.PI) return wrapped + TWO_PI;
  return wrapped;
}

/** `x * x * (3 - 2 * x)` on `x` clamped to [0, 1]. NaN counts as 0. The slope never exceeds 1.5. */
export function smoothstep(x: number): number {
  const t = x > 0 ? (x < 1 ? x : 1) : 0;
  return t * t * (3 - 2 * t);
}

/** Copies `source` into `out` exactly, replacing any non-finite field by 0. */
function writeFinite(source: CameraPose, out: CameraPose): CameraPose {
  const x = finiteOr(source.x, 0);
  const y = finiteOr(source.y, 0);
  const z = finiteOr(source.z, 0);
  const yaw = finiteOr(source.yaw, 0);
  const pitch = finiteOr(source.pitch, 0);
  out.x = x;
  out.y = y;
  out.z = z;
  out.yaw = yaw;
  out.pitch = pitch;
  return out;
}

/**
 * Writes into `out` the pose a fraction `w` of the way from `from` to `to`, and returns `out`.
 * Position is linear plus an arc of `arcHeight * 4 w (1 - w)` on y; yaw takes the shortest turn;
 * pitch is blended and clamped to 75 degrees. At `w <= 0` (or NaN) the result is `from` and at
 * `w >= 1` it is `to`, field by field, with no arc and no rounding drift. Every field is finite for
 * any input. `out` may be `from` or `to`.
 */
export function blendPose(from: CameraPose, to: CameraPose, w: number, arcHeight: number, out: CameraPose): CameraPose {
  if (!(w > 0)) return writeFinite(from, out);
  if (w >= 1) return writeFinite(to, out);
  const fx = finiteOr(from.x, 0);
  const fy = finiteOr(from.y, 0);
  const fz = finiteOr(from.z, 0);
  const fyaw = finiteOr(from.yaw, 0);
  const fpitch = finiteOr(from.pitch, 0);
  const tx = finiteOr(to.x, 0);
  const ty = finiteOr(to.y, 0);
  const tz = finiteOr(to.z, 0);
  const tyaw = finiteOr(to.yaw, 0);
  const tpitch = finiteOr(to.pitch, 0);
  const arc = finiteOr(arcHeight, 0) * 4 * w * (1 - w);
  const pitch = finiteOr(fpitch + (tpitch - fpitch) * w, fpitch);
  out.x = finiteOr(fx + (tx - fx) * w, fx);
  out.y = finiteOr(fy + (ty - fy) * w + arc, fy);
  out.z = finiteOr(fz + (tz - fz) * w, fz);
  out.yaw = finiteOr(fyaw + w * wrapPi(tyaw - fyaw), fyaw);
  out.pitch = Math.max(-MAX_POSE_PITCH, Math.min(MAX_POSE_PITCH, pitch));
  return out;
}

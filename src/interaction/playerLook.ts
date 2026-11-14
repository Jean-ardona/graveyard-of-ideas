export interface LookState {
  /** Rotation around Y in radians. 0 faces -z, positive turns left. */
  yaw: number;
  /** Rotation around X in radians. Positive looks up. */
  pitch: number;
}

export const MAX_PITCH = (75 * Math.PI) / 180;
/** A single mouse event moving further than this many pixels on an axis is a browser glitch. */
export const MAX_LOOK_DELTA = 200;

function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}

function filterSpike(delta: number): number {
  return Number.isFinite(delta) && Math.abs(delta) <= MAX_LOOK_DELTA ? delta : 0;
}

/**
 * Direct mouse look: one mouse event, in pixels, turns the view by delta times
 * `sensitivity` (radians per pixel). No smoothing, acceleration or dead zone.
 * Moving right turns right, moving down looks down. An axis whose delta exceeds
 * MAX_LOOK_DELTA is ignored; pitch is clamped to +/- MAX_PITCH.
 */
export function applyLook(
  look: LookState,
  movementX: number,
  movementY: number,
  sensitivity: number,
): LookState {
  return {
    yaw: look.yaw - filterSpike(movementX) * sensitivity,
    pitch: clampPitch(look.pitch - filterSpike(movementY) * sensitivity),
  };
}

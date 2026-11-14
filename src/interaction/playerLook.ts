export interface LookState {
  /** Rotation around Y in radians. 0 faces -z, positive turns left. */
  yaw: number;
  /** Rotation around X in radians. Positive looks up. */
  pitch: number;
}

export const MAX_PITCH = (30 * Math.PI) / 180;
/** Cursor offsets (0..1 from the screen center) smaller than this do not turn. */
export const DEAD_ZONE = 0.12;
/** Turn rate in radians per second with the cursor at the screen edge. */
export const MAX_YAW_RATE = 1.6;
/** How quickly pitch follows the cursor height. Higher is snappier. */
export const PITCH_FOLLOW = 6;
/** Radians per pixel of mouse movement in Pointer Lock mode. */
export const LOCKED_SENSITIVITY = 0.0022;

function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}

/** Eases the cursor offset past the dead zone: 0 inside it, 1 at the edge. */
export function deadZoneCurve(offset: number): number {
  const magnitude = Math.abs(offset);
  if (magnitude <= DEAD_ZONE) return 0;
  const t = Math.min(1, (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
  return Math.sign(offset) * t * t;
}

/**
 * Free-cursor look. `cursorX` and `cursorY` are in -1..1 from the screen center
 * (right and down are positive). Horizontal offset sets the turn rate; vertical
 * offset sets a target tilt that pitch eases toward.
 */
export function stepFreeLook(
  look: LookState,
  cursorX: number,
  cursorY: number,
  delta: number,
): LookState {
  const yaw = look.yaw - deadZoneCurve(cursorX) * MAX_YAW_RATE * delta;
  const targetPitch = clampPitch(-cursorY * MAX_PITCH);
  const follow = 1 - Math.exp(-PITCH_FOLLOW * delta);
  return { yaw, pitch: look.pitch + (targetPitch - look.pitch) * follow };
}

/** Pointer Lock look from raw mouse movement in pixels. */
export function applyLockedLook(look: LookState, movementX: number, movementY: number): LookState {
  return {
    yaw: look.yaw - movementX * LOCKED_SENSITIVITY,
    pitch: clampPitch(look.pitch - movementY * LOCKED_SENSITIVITY),
  };
}

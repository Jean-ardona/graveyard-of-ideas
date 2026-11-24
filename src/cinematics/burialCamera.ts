import { MAX_POSE_PITCH, blendPose, finiteOr, smoothstep } from './cameraPose';
import type { CameraPose } from './cameraPose';
import { DOLLY_ARC_HEIGHT, DOLLY_IN, HOLD_DISTANCE, HOLD_END, RETURN, TOTAL_SECONDS } from './burialTimings';
import { lookAtSlot } from './lookAtSlot';
import type { Look, Point3 } from './lookAtSlot';

/**
 * Camera path of the burial: the camera leaves the player's pose, travels to a hold spot in front of
 * the tomb, rests there while the book is revealed, then travels back. Pure: no React, Three.js, DOM,
 * store or timers, and no random source. Every value is a function of `elapsed` alone, so a skip or
 * a reload needs no history.
 */

/** Scratch records: overwritten on every call, so no state survives between calls. */
const EYE: Point3 = { x: 0, y: 0, z: 0 };
const NO_LOOK: Look = { yaw: 0, pitch: 0 };
const LOOK: Look = { yaw: 0, pitch: 0 };
const FROM: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
const TO: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

/**
 * How far the camera is from the player's pose toward the hold pose, in [0, 1]. Smoothstep over the
 * dolly, 1 over the hold, `1 - smoothstep` over the return. 0 for `elapsed <= 0`, for
 * `elapsed >= TOTAL_SECONDS` and for NaN; infinities clamp to those ends.
 */
export function burialWeight(elapsed: number): number {
  if (!(elapsed > 0) || elapsed >= TOTAL_SECONDS) return 0;
  if (elapsed < DOLLY_IN) return smoothstep(elapsed / DOLLY_IN);
  if (elapsed <= HOLD_END) return 1;
  return 1 - smoothstep((elapsed - HOLD_END) / RETURN);
}

/**
 * Writes into `out` the hold pose and returns `out`: the eye is `HOLD_DISTANCE` from the slab point on
 * the ground plane, on the front side of the tomb (`slab + (sin heading, cos heading) * HOLD_DISTANCE`)
 * at height `eyeY`, looking at the slab point. Finite for any input; the pitch stays within 75 degrees.
 */
export function holdPose(slab: Point3, heading: number, eyeY: number, out: CameraPose): CameraPose {
  const angle = finiteOr(heading, 0);
  EYE.x = finiteOr(slab.x, 0) + Math.sin(angle) * HOLD_DISTANCE;
  EYE.y = finiteOr(eyeY, 0);
  EYE.z = finiteOr(slab.z, 0) + Math.cos(angle) * HOLD_DISTANCE;
  lookAtSlot(EYE, slab, NO_LOOK, LOOK);
  out.x = EYE.x;
  out.y = EYE.y;
  out.z = EYE.z;
  out.yaw = LOOK.yaw;
  out.pitch = LOOK.pitch;
  return out;
}

/** Copies `source` into `target` with every field finite and the pitch within 75 degrees. */
function sanitize(source: CameraPose, target: CameraPose): void {
  target.x = finiteOr(source.x, 0);
  target.y = finiteOr(source.y, 0);
  target.z = finiteOr(source.z, 0);
  target.yaw = finiteOr(source.yaw, 0);
  target.pitch = Math.max(-MAX_POSE_PITCH, Math.min(MAX_POSE_PITCH, finiteOr(source.pitch, 0)));
}

/**
 * Writes into `out` the camera pose at `elapsed` seconds and returns `out`. At weight 0 the pose is the
 * player's pose exactly, at weight 1 it is the hold pose exactly, and between them it travels with a
 * small arc of `DOLLY_ARC_HEIGHT`. Finite for any input; the pitch stays within 75 degrees.
 */
export function writeBurialCamera(elapsed: number, player: CameraPose, hold: CameraPose, out: CameraPose): CameraPose {
  sanitize(player, FROM);
  sanitize(hold, TO);
  return blendPose(FROM, TO, burialWeight(elapsed), DOLLY_ARC_HEIGHT, out);
}

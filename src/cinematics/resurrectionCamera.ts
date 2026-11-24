import { MAX_POSE_PITCH, blendPose, finiteOr, smoothstep } from './cameraPose';
import type { CameraPose } from './cameraPose';
import { FOLLOW_IN_SECONDS, FRAME_DROP, LOOK_LAG } from './cameraTimings';
import { lookAtSlot } from './lookAtSlot';
import type { Look, Point3 } from './lookAtSlot';
import { specterCenter } from './specterParticles';
import type { SpecterPoint } from './specterParticles';
import { GROUP_B_TOTAL, RETURN_SECONDS, SPECTER_TOTAL } from './specterTimings';

/**
 * Camera path of the resurrection: the camera stays where the player stands and turns to follow
 * the specter, then turns back. Pure: no React, Three.js, DOM, store or timers, and no random
 * source. Every value is a function of `groupBTime` alone, so a skip or a reload needs no history.
 */

/** Where the tomb stands and the way it faces, in world space. */
export interface TombFrame {
  x: number;
  z: number;
  groundY: number;
  heading: number;
}

/**
 * How far the camera has turned from the player's look toward the specter, in [0, 1]. Eases in over
 * `FOLLOW_IN_SECONDS`, holds at 1 while the specter is on stage and eases out over the return.
 * 0 for `u <= 0`, for `u >= GROUP_B_TOTAL` and for NaN; infinities clamp to those ends.
 */
export function followWeight(groupBTime: number): number {
  const u = groupBTime;
  if (!(u > 0) || u >= GROUP_B_TOTAL) return 0;
  if (u < FOLLOW_IN_SECONDS) return smoothstep(u / FOLLOW_IN_SECONDS);
  if (u <= SPECTER_TOTAL) return 1;
  return 1 - smoothstep((u - SPECTER_TOTAL) / RETURN_SECONDS);
}

/** Scratch records: overwritten on every call, so no state survives between calls. */
const FROM: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
const AIM: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
const CENTER: SpecterPoint = { x: 0, y: 0, z: 0 };
const TARGET: Point3 = { x: 0, y: 0, z: 0 };
const LOOK: Look = { yaw: 0, pitch: 0 };

/**
 * Writes into `out` the camera pose at `groupBTime` seconds of group B and returns `out`. The
 * position is always the player's (finite) position. The look blends from the player's look to the
 * aim at the lagged specter center, lowered by `FRAME_DROP`, with the follow weight. At weight 0
 * the pose is the player's pose exactly. Finite for any input; the pitch stays within 75 degrees.
 */
export function writeResurrectionCamera(
  groupBTime: number,
  player: CameraPose,
  tomb: TombFrame,
  out: CameraPose,
): CameraPose {
  FROM.x = finiteOr(player.x, 0);
  FROM.y = finiteOr(player.y, 0);
  FROM.z = finiteOr(player.z, 0);
  FROM.yaw = finiteOr(player.yaw, 0);
  FROM.pitch = Math.max(-MAX_POSE_PITCH, Math.min(MAX_POSE_PITCH, finiteOr(player.pitch, 0)));
  const w = followWeight(groupBTime);
  if (!(w > 0)) return blendPose(FROM, FROM, 0, 0, out);
  const u = groupBTime < SPECTER_TOTAL ? groupBTime : SPECTER_TOTAL;
  const lagged = u - LOOK_LAG > 0 ? u - LOOK_LAG : 0;
  specterCenter(lagged, finiteOr(tomb.heading, 0), CENTER);
  TARGET.x = finiteOr(tomb.x, 0) + CENTER.x;
  TARGET.y = finiteOr(tomb.groundY, 0) + CENTER.y - FRAME_DROP;
  TARGET.z = finiteOr(tomb.z, 0) + CENTER.z;
  lookAtSlot(FROM, TARGET, FROM, LOOK);
  AIM.x = FROM.x;
  AIM.y = FROM.y;
  AIM.z = FROM.z;
  AIM.yaw = LOOK.yaw;
  AIM.pitch = LOOK.pitch;
  return blendPose(FROM, AIM, w, 0, out);
}

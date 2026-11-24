/**
 * UI-only flag: a cinematic owns the camera. While it is claimed, `PlayerController` skips its two
 * camera writes (position and rotation) and keeps its own position, yaw and pitch, so the first
 * frame after the release shows the player's pose again. Never persisted, never part of the store.
 * Claiming twice or releasing twice is harmless.
 */

let claimed = false;

export function claimCamera(): void {
  claimed = true;
}

export function releaseCamera(): void {
  claimed = false;
}

export function isCameraClaimed(): boolean {
  return claimed;
}

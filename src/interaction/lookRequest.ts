/**
 * A look the player controller must adopt. A cinematic turns the camera, and the controller owns the
 * look that the mouse changes, so the cinematic hands its look over here: otherwise the controller
 * would turn the camera back on the next frame. One record, written in place, read once per frame.
 */
export const lookRequest: { pending: boolean; yaw: number; pitch: number } = {
  pending: false,
  yaw: 0,
  pitch: 0,
};

/** Asks the controller to adopt this look on its next frame. Allocates nothing. */
export function requestLook(yaw: number, pitch: number): void {
  lookRequest.yaw = yaw;
  lookRequest.pitch = pitch;
  lookRequest.pending = true;
}

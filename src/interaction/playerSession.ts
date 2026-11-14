import { PLAYER_START } from '../world/config';

/**
 * Where the player stands and looks. Written every frame and read when the
 * canvas is recreated (antialias change), so the player keeps their place.
 */
export const playerSession: { x: number; z: number; yaw: number; pitch: number } = {
  x: PLAYER_START.x,
  z: PLAYER_START.z,
  yaw: 0,
  pitch: 0,
};

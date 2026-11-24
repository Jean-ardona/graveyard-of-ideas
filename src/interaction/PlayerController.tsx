import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EYE_HEIGHT, PLAYER_BOUNDS, PLAYER_RADIUS } from '../world/config';
import { isCameraClaimed } from './cameraOverride';
import { getColliders } from './colliderRegistry';
import { terrainHeight } from '../world/terrain';
import type { Point } from './collision';
import { clampDelta, keysToAxes, stepPlayer } from './playerMovement';
import { playerSession } from './playerSession';
import { canWalk } from './inputLock';
import { lookRequest } from './lookRequest';
import { getPointerMode } from './pointerLock';
import { usePlayerInput } from './usePlayerInput';

/**
 * First-person controller: moves and turns the camera every frame.
 * Set `enabled` to false to suspend movement and look (menus, cinematics).
 * Walking also stops while the pointer lock is lost; see pointerLock.ts.
 */
export default function PlayerController({
  enabled = true,
  inputLocked = false,
}: {
  enabled?: boolean;
  /** Freezes walking and look without touching the pointer mode (a book sequence is running). */
  inputLocked?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const input = usePlayerInput(enabled, canvas, inputLocked);
  const position = useRef<Point>({ x: playerSession.x, z: playerSession.z });

  useLayoutEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useFrame((_, rawDelta) => {
    const state = input.current;
    if (lookRequest.pending) {
      state.look.yaw = lookRequest.yaw;
      state.look.pitch = lookRequest.pitch;
      lookRequest.pending = false;
    }
    if (canWalk(enabled, inputLocked, getPointerMode())) {
      position.current = stepPlayer(
        position.current,
        keysToAxes(state.keys),
        state.look.yaw,
        state.fast,
        clampDelta(rawDelta),
        PLAYER_RADIUS,
        getColliders(),
        PLAYER_BOUNDS,
      );
    }
    const { x, z } = position.current;
    if (!isCameraClaimed()) {
      camera.position.set(x, terrainHeight(x, z) + EYE_HEIGHT, z);
      camera.rotation.set(state.look.pitch, state.look.yaw, 0);
    }
    playerSession.x = x;
    playerSession.z = z;
    playerSession.yaw = state.look.yaw;
    playerSession.pitch = state.look.pitch;
  });

  return null;
}

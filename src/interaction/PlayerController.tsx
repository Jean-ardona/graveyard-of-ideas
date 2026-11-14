import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  COLLIDERS,
  EYE_HEIGHT,
  PLAYER_BOUNDS,
  PLAYER_RADIUS,
} from '../world/config';
import { terrainHeight } from '../world/terrain';
import type { Point } from './collision';
import { clampDelta, keysToAxes, stepPlayer } from './playerMovement';
import { playerSession } from './playerSession';
import { allowsMovement, getPointerMode } from './pointerLock';
import { usePlayerInput } from './usePlayerInput';

/**
 * First-person controller: moves and turns the camera every frame.
 * Set `enabled` to false to suspend movement and look (menus, cinematics).
 * Walking also stops while the pointer lock is lost; see pointerLock.ts.
 */
export default function PlayerController({ enabled = true }: { enabled?: boolean }) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const input = usePlayerInput(enabled, canvas);
  const position = useRef<Point>({ x: playerSession.x, z: playerSession.z });

  useLayoutEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useFrame((_, rawDelta) => {
    const state = input.current;
    if (enabled && allowsMovement(getPointerMode())) {
      position.current = stepPlayer(
        position.current,
        keysToAxes(state.keys),
        state.look.yaw,
        state.fast,
        clampDelta(rawDelta),
        PLAYER_RADIUS,
        COLLIDERS,
        PLAYER_BOUNDS,
      );
    }
    const { x, z } = position.current;
    camera.position.set(x, terrainHeight(x, z) + EYE_HEIGHT, z);
    camera.rotation.set(state.look.pitch, state.look.yaw, 0);
    playerSession.x = x;
    playerSession.z = z;
    playerSession.yaw = state.look.yaw;
    playerSession.pitch = state.look.pitch;
  });

  return null;
}

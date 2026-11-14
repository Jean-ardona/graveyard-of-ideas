import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  COLLIDERS,
  EYE_HEIGHT,
  PLAYER_BOUNDS,
  PLAYER_RADIUS,
  PLAYER_START,
} from '../world/config';
import { terrainHeight } from '../world/terrain';
import type { Point } from './collision';
import { applyLockedLook, stepFreeLook, type LookState } from './playerLook';
import { clampDelta, keysToAxes, stepPlayer } from './playerMovement';
import { usePlayerInput } from './usePlayerInput';

/**
 * First-person controller: moves and turns the camera every frame.
 * Set `enabled` to false to suspend movement and look (menus, cinematics).
 */
export default function PlayerController({ enabled = true }: { enabled?: boolean }) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const input = usePlayerInput(enabled, canvas);
  const position = useRef<Point>({ x: PLAYER_START.x, z: PLAYER_START.z });
  const look = useRef<LookState>({ yaw: 0, pitch: 0 });

  useLayoutEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useFrame((_, rawDelta) => {
    const delta = clampDelta(rawDelta);
    const state = input.current;
    if (enabled) {
      if (state.pointerLocked) {
        look.current = applyLockedLook(look.current, state.lockedDeltaX, state.lockedDeltaY);
        state.lockedDeltaX = 0;
        state.lockedDeltaY = 0;
      } else {
        look.current = stepFreeLook(look.current, state.cursorX, state.cursorY, delta);
      }
      position.current = stepPlayer(
        position.current,
        keysToAxes(state.keys),
        look.current.yaw,
        state.fast,
        delta,
        PLAYER_RADIUS,
        COLLIDERS,
        PLAYER_BOUNDS,
      );
    }
    const { x, z } = position.current;
    camera.position.set(x, terrainHeight(x, z) + EYE_HEIGHT, z);
    camera.rotation.set(look.current.pitch, look.current.yaw, 0);
  });

  return null;
}

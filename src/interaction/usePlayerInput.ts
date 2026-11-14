import { useEffect, useRef, type MutableRefObject } from 'react';
import { MOVEMENT_KEYS } from './playerMovement';
import { isTypingTarget } from './typingTarget';

export interface PlayerInput {
  /** Held movement keys, lowercase. */
  keys: Set<string>;
  fast: boolean;
  /** Cursor offset from the screen center, -1..1, right and down positive. */
  cursorX: number;
  cursorY: number;
  pointerLocked: boolean;
  /** Mouse movement accumulated since the last frame while Pointer Lock is active. */
  lockedDeltaX: number;
  lockedDeltaY: number;
}

const POINTER_LOCK_KEY = 'l';

/**
 * Collects keyboard and pointer input into a ref read every frame.
 * While `enabled` is false nothing is recorded and Pointer Lock is released.
 */
export function usePlayerInput(
  enabled: boolean,
  canvas: HTMLElement,
): MutableRefObject<PlayerInput> {
  const input = useRef<PlayerInput>({
    keys: new Set(),
    fast: false,
    cursorX: 0,
    cursorY: 0,
    pointerLocked: false,
    lockedDeltaX: 0,
    lockedDeltaY: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    const state = input.current;

    function releaseKeys() {
      state.keys.clear();
      state.fast = false;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      state.fast = event.shiftKey;
      if (MOVEMENT_KEYS.has(key)) {
        state.keys.add(key);
        event.preventDefault();
      } else if (key === POINTER_LOCK_KEY && !event.repeat) {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        else canvas.requestPointerLock();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      state.keys.delete(event.key.toLowerCase());
      state.fast = event.shiftKey;
    }

    function onPointerMove(event: PointerEvent) {
      state.cursorX = (event.clientX / window.innerWidth) * 2 - 1;
      state.cursorY = (event.clientY / window.innerHeight) * 2 - 1;
    }

    function onMouseMove(event: MouseEvent) {
      if (!state.pointerLocked) return;
      state.lockedDeltaX += event.movementX;
      state.lockedDeltaY += event.movementY;
    }

    function onPointerLockChange() {
      state.pointerLocked = document.pointerLockElement === canvas;
      state.lockedDeltaX = 0;
      state.lockedDeltaY = 0;
    }

    function onVisibilityChange() {
      if (document.hidden) releaseKeys();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      releaseKeys();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [enabled, canvas]);

  return input;
}

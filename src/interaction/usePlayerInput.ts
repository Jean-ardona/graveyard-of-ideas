import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { browserStorage, DEFAULT_LOOK_SENSITIVITY, loadLookSensitivity } from '../store';
import { isLooking } from './inputLock';
import { applyLook, type LookState } from './playerLook';
import { MOVEMENT_KEYS } from './playerMovement';
import { playerSession } from './playerSession';
import {
  allowsMovement,
  attachPointerTarget,
  getPointerMode,
  requestPointer,
  subscribePointerMode,
} from './pointerLock';
import { isTypingTarget } from './typingTarget';

export interface PlayerInput {
  /** Held movement keys, lowercase. */
  keys: Set<string>;
  fast: boolean;
  /** View direction, updated by each mouse event as it arrives. */
  look: LookState;
  /** Radians per pixel. */
  sensitivity: number;
  /** While true, walking keys and look are ignored; the pointer mode is not touched. */
  locked: boolean;
}

/**
 * Collects keyboard and mouse input into a ref read every frame.
 * While `enabled` is false nothing is recorded and the cursor is freed.
 */
export function usePlayerInput(
  enabled: boolean,
  canvas: HTMLElement,
  inputLocked = false,
): MutableRefObject<PlayerInput> {
  const input = useRef<PlayerInput>({
    keys: new Set(),
    fast: false,
    look: { yaw: playerSession.yaw, pitch: playerSession.pitch },
    sensitivity: DEFAULT_LOOK_SENSITIVITY,
    locked: inputLocked,
  });

  useLayoutEffect(() => {
    const state = input.current;
    state.locked = inputLocked;
    if (inputLocked) {
      state.keys.clear();
      state.fast = false;
    }
  }, [inputLocked]);

  useEffect(() => {
    if (!enabled) return;
    const state = input.current;
    state.sensitivity = loadLookSensitivity(browserStorage());

    function releaseKeys() {
      state.keys.clear();
      state.fast = false;
    }

    function canRequestLock(): boolean {
      const mode = getPointerMode();
      return mode === 'idle' || mode === 'lost';
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      state.fast = event.shiftKey;
      if (key === 'enter') {
        const onPage = event.target === document.body || event.target === canvas;
        if (onPage && !event.repeat && canRequestLock()) requestPointer();
      } else if (MOVEMENT_KEYS.has(key) && !state.locked && allowsMovement(getPointerMode())) {
        state.keys.add(key);
        event.preventDefault();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      state.keys.delete(event.key.toLowerCase());
      state.fast = event.shiftKey;
    }

    function onClick() {
      if (canRequestLock()) requestPointer();
    }

    function onMouseMove(event: MouseEvent) {
      if (!isLooking(getPointerMode(), (event.buttons & 1) === 1, state.locked)) return;
      state.look = applyLook(state.look, event.movementX, event.movementY, state.sensitivity);
    }

    function onVisibilityChange() {
      if (document.hidden) releaseKeys();
    }

    const detachPointer = attachPointerTarget(canvas);
    const unsubscribeMode = subscribePointerMode(() => {
      if (!allowsMovement(getPointerMode())) releaseKeys();
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      unsubscribeMode();
      detachPointer();
      releaseKeys();
    };
  }, [enabled, canvas]);

  return input;
}

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { allowsInteraction, selectFocus } from './interactables';
import { activateFocused, getInteractables, setFocused } from './interactionState';
import { getPointerMode } from './pointerLock';
import { isTypingTarget } from './typingTarget';

/** The focus is recomputed at most this often (20 times per second). */
const FOCUS_INTERVAL = 0.05;

const forward = new Vector3();

/**
 * Picks the interactable the player is facing and runs its action on E.
 * Set `enabled` to false while movement is off (menus, cinematics): nothing is focused.
 */
export default function InteractionController({ enabled = true }: { enabled?: boolean }) {
  const elapsed = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setFocused(null);
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'e' || event.repeat) return;
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (allowsInteraction(getPointerMode())) activateFocused();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      setFocused(null);
    };
  }, [enabled]);

  useFrame(({ camera }, delta) => {
    if (!enabled) return;
    elapsed.current += delta;
    if (elapsed.current < FOCUS_INTERVAL) return;
    elapsed.current = 0;
    if (!allowsInteraction(getPointerMode())) {
      setFocused(null);
      return;
    }
    camera.getWorldDirection(forward);
    setFocused(selectFocus(getInteractables(), camera.position, forward));
  });

  return null;
}

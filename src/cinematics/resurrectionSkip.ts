import { getPointerMode, subscribePointerMode } from '../interaction/pointerLock';
import type { PointerMode } from '../interaction/pointerLock';
import { isTypingTarget } from '../interaction/typingTarget';

/** Escape, Enter and Space skip the resurrection, like the burial cinematic. */
export function isSkipResurrectionKey(key: string): boolean {
  return key === 'Escape' || key === 'Enter' || key === ' ';
}

/** A lost pointer lock (Escape leaves the lock without a key event) counts as a skip. Other changes do not. */
export function isLockLoss(previous: PointerMode, next: PointerMode): boolean {
  return previous === 'locked' && next === 'lost';
}

/**
 * Calls `onSkip` once for a skip key outside text fields or for a lost pointer lock while the sequence
 * runs. Returns a function that detaches both listeners.
 */
export function attachResurrectionSkip(onSkip: () => void): () => void {
  let previous = getPointerMode();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !isSkipResurrectionKey(event.key) || isTypingTarget(event.target)) return;
    onSkip();
  };
  const unsubscribe = subscribePointerMode(() => {
    const next = getPointerMode();
    const lost = isLockLoss(previous, next);
    previous = next;
    if (lost) onSkip();
  });
  window.addEventListener('keydown', onKeyDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    unsubscribe();
  };
}

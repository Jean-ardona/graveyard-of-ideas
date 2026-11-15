import { allowsMovement } from './pointerLock';
import type { PointerMode } from './pointerLock';

/**
 * Whether the player walks this frame. `inputLocked` is a flag of its own: unlike `enabled`
 * it leaves the pointer mode alone, so a book can free the cursor while the view stays still.
 */
export function canWalk(enabled: boolean, inputLocked: boolean, mode: PointerMode): boolean {
  return enabled && !inputLocked && allowsMovement(mode);
}

/** Whether a mouse move turns the view: locked pointer, or primary button held in the fallback. */
export function isLooking(mode: PointerMode, primaryButtonDown: boolean, inputLocked: boolean): boolean {
  if (inputLocked) return false;
  return mode === 'locked' || (mode === 'fallback' && primaryButtonDown);
}

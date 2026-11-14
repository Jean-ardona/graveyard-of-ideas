import { useSyncExternalStore } from 'react';

/**
 * - idle: Pointer Lock not requested yet; walking works, a click requests the lock.
 * - locked: mouse movement turns the view; walking works.
 * - lost: the lock was lost (Escape, focus loss); walking is off and a resume overlay shows.
 * - released: the cursor was freed on purpose (menus, books); walking and look are off.
 * - fallback: Pointer Lock is unavailable or rejected; look by click and drag; walking works.
 */
export type PointerMode = 'idle' | 'locked' | 'lost' | 'released' | 'fallback';

/** Whether the player may walk in this mode. */
export function allowsMovement(mode: PointerMode): boolean {
  return mode === 'idle' || mode === 'locked' || mode === 'fallback';
}

/** Mode after the browser reports a Pointer Lock change on the canvas. */
export function modeAfterLockChange(mode: PointerMode, locked: boolean): PointerMode {
  if (locked) return 'locked';
  return mode === 'locked' ? 'lost' : mode;
}

/**
 * Mode after a lock request fails. A failure before the first successful lock means
 * the feature is unusable here, so look falls back to click and drag. After a success
 * a failure is transient (browsers refuse a new request right after Escape), so the
 * mode is kept and the user can click again.
 */
export function modeAfterLockFailure(mode: PointerMode, hasLockedBefore: boolean): PointerMode {
  return hasLockedBefore ? mode : 'fallback';
}

/** Mode when the controller is turned off: a held or lost lock becomes a deliberate release. */
export function modeOnSuspend(mode: PointerMode): PointerMode {
  return mode === 'locked' || mode === 'lost' ? 'released' : mode;
}

/** Mode when the controller is turned back on: a click is needed to lock again. */
export function modeOnResume(mode: PointerMode): PointerMode {
  return mode === 'released' ? 'lost' : mode;
}

let mode: PointerMode = 'idle';
let target: HTMLElement | null = null;
let hasLockedBefore = false;
const listeners = new Set<() => void>();

function setMode(next: PointerMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener());
}

export function getPointerMode(): PointerMode {
  return mode;
}

export function subscribePointerMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current pointer mode for UI components. */
export function usePointerMode(): PointerMode {
  return useSyncExternalStore(subscribePointerMode, getPointerMode, getPointerMode);
}

function onLockFailed(): void {
  setMode(modeAfterLockFailure(mode, hasLockedBefore));
}

function onLockChange(): void {
  const locked = target !== null && document.pointerLockElement === target;
  if (locked) hasLockedBefore = true;
  setMode(modeAfterLockChange(mode, locked));
}

/**
 * Asks the browser to lock the pointer to the canvas. Needs a user gesture (click or key).
 * Does nothing while the controller is off or already in click-and-drag fallback.
 */
export function requestPointer(): void {
  if (!target || mode === 'fallback' || mode === 'locked') return;
  if (typeof target.requestPointerLock !== 'function') {
    onLockFailed();
    return;
  }
  try {
    Promise.resolve(target.requestPointerLock() as unknown).catch(onLockFailed);
  } catch {
    onLockFailed();
  }
}

/**
 * Frees the cursor on purpose (for example while a book or the grimoire is open).
 * Walking and look stop and no resume overlay is shown until requestPointer() locks again.
 */
export function releasePointer(): void {
  if (!target || mode === 'fallback') return;
  setMode('released');
  if (document.pointerLockElement === target) document.exitPointerLock();
}

/** Connects the canvas to the pointer state. Returns a function that disconnects it. */
export function attachPointerTarget(canvas: HTMLElement): () => void {
  target = canvas;
  setMode(modeOnResume(mode));
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockFailed);
  return () => {
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockFailed);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    target = null;
    setMode(modeOnSuspend(mode));
  };
}

/**
 * Ids of the projects whose tomb book stays hidden until the burial cinematic reveals it.
 * UI-only: never persisted, never in the store and never part of `AppData`. A reload starts with an
 * empty set, so the book is simply there. Pure: no React, Three.js, DOM, store or timers.
 */

const pending = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Hides the book of the project until the flag is cleared. */
export function markRevealPending(projectId: string): void {
  if (pending.has(projectId)) return;
  pending.add(projectId);
  notify();
}

/** Shows the book of the project again. Safe for an id that is not set. */
export function clearRevealPending(projectId: string): void {
  if (pending.delete(projectId)) notify();
}

export function isRevealPending(projectId: string): boolean {
  return pending.has(projectId);
}

/** How many books are waiting for their reveal. */
export function revealPendingCount(): number {
  return pending.size;
}

/** Clears every flag, as a reload does. */
export function resetRevealPending(): void {
  if (pending.size === 0) return;
  pending.clear();
  notify();
}

export function subscribeRevealPending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

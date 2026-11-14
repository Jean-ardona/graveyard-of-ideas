import { MAX_SLOTS, Project } from './types';

/**
 * Finds the first free slot index (0–11) not currently used by any resting project.
 * Returns null if all 12 slots are occupied.
 */
export function allocateSlot(projects: Project[]): number | null {
  const usedSlots = new Set(
    projects
      .filter((p) => p.status === 'resting' && p.slot !== undefined)
      .map((p) => p.slot as number),
  );

  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!usedSlots.has(i)) {
      return i;
    }
  }

  return null;
}

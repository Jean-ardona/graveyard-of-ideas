import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Project } from '../domain';
import { allowsMovement, getPointerMode } from '../interaction/pointerLock';
import { canOpenBook } from '../interaction/uiMode';
import { appStore, useAppStore } from '../store/appStore';
import { readingMachine } from './readingMachine';

/** Which book is open for reading, if any. Only the id lives here; the project data stays in the saved store. */
const readingStore = createStore<{ projectId: string | null }>()(() => ({ projectId: null }));

// The id is kept for the whole sequence and dropped once the book has returned to its base.
readingMachine.subscribe(() => {
  if (readingMachine.phase() === 'closed') readingStore.setState({ projectId: null });
});

/** Reduced motion lands on the final state at once instead of playing the sequence. */
function skipWhenReducedMotion(): void {
  if (appStore.getState().data.prefs.reducedMotion) readingMachine.skip();
}

/** Starts the opening sequence for a resting project. Ignored if the guard refuses it. */
export function openBook(projectId: string): void {
  const guard = {
    mode: readingMachine.uiMode(),
    pointerAllowsMovement: allowsMovement(getPointerMode()),
    projectResting: appStore.getState().data.projects.some((p) => p.id === projectId && p.status === 'resting'),
  };
  if (readingMachine.phase() !== 'closed' || !canOpenBook(guard)) return;
  // The id is set first: the machine notifies the driver, which looks up the book by it.
  readingStore.setState({ projectId });
  readingMachine.open(guard);
  skipWhenReducedMotion();
}

/** Plays the sequence back to the base. Closing waits for a page turn to finish. */
export function closeBook(): void {
  readingMachine.close();
  skipWhenReducedMotion();
}

/** Id of the project whose book is open or moving, or null. Not reactive; for event handlers. */
export function getReadingProjectId(): string | null {
  return readingStore.getState().projectId;
}

/** The resting project whose book is open, or null (also when that project no longer rests). */
export function useReadingProject(): Project | null {
  const projectId = useStore(readingStore, (state) => state.projectId);
  return useAppStore((state) => {
    if (projectId === null) return null;
    const project = state.data.projects.find((p) => p.id === projectId);
    return project?.status === 'resting' ? project : null;
  });
}

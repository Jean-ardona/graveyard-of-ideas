import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { currentUiMode } from '../cinematics/resurrectionSession';
import type { Project } from '../domain';
import { allowsMovement, getPointerMode } from '../interaction/pointerLock';
import { ritualMachine } from '../interaction/ritualMachine';
import { canOpenBook } from '../interaction/uiMode';
import { appStore, useAppStore } from '../store/appStore';
import type { TurnDirection } from './pageTurn';
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

/**
 * Starts the opening sequence for a resting project. Ignored if the guard refuses it,
 * including when the player is not in front of the tomb.
 */
export function openBook(projectId: string, playerInFront: boolean): void {
  const guard = {
    playerInFront,
    ritualPhase: ritualMachine.phase(),
    mode: currentUiMode(),
    pointerAllowsMovement: allowsMovement(getPointerMode()),
    projectResting: appStore.getState().data.projects.some((p) => p.id === projectId && p.status === 'resting'),
  };
  if (readingMachine.phase() !== 'closed' || !canOpenBook(guard)) return;
  // The id is set first: the machine notifies the driver, which looks up the book by it.
  readingStore.setState({ projectId });
  readingMachine.open(guard);
  skipWhenReducedMotion();
}

/** Reduced motion ends a page turn at once, and a close that waited for it plays out as a skip. */
function finishTurnWhenReducedMotion(): void {
  if (!appStore.getState().data.prefs.reducedMotion) return;
  readingMachine.finishTurn();
  readingMachine.skip();
}

/** Turns one page by keyboard. */
export function turnPage(direction: TurnDirection): void {
  readingMachine.turnPage(direction);
  finishTurnWhenReducedMotion();
}

/** Releases a page drag: at least half the turn distance completes the turn. */
export function endPageDrag(): void {
  readingMachine.endDrag();
  finishTurnWhenReducedMotion();
}

/** Abandons a page drag; the page returns. */
export function cancelPageDrag(): void {
  readingMachine.cancelDrag();
  finishTurnWhenReducedMotion();
}

/** Plays the sequence back to the base. Closing waits for a page turn to finish. */
export function closeBook(): void {
  readingMachine.close();
  finishTurnWhenReducedMotion();
}

/**
 * Ends the reading at once, whatever the phase: SKIP, then CLOSE, then SKIP again so the book lands on
 * `closed` without playing. A page turn in progress is finished first, never replayed. Leaving `open`
 * hands the pointer back through the driver, and `closed` releases the curl geometry and leaf textures.
 */
export function endReading(): void {
  readingMachine.finishTurn();
  readingMachine.skip();
  readingMachine.close();
  readingMachine.finishTurn();
  readingMachine.skip();
}

/**
 * Watches the saved projects: when the open book's project is removed or no longer rests, the
 * reading ends at once. Returns a function that stops watching.
 */
export function watchReadingProject(): () => void {
  return appStore.subscribe((state) => {
    const projectId = readingStore.getState().projectId;
    if (projectId === null || readingMachine.phase() === 'closed') return;
    const project = state.data.projects.find((p) => p.id === projectId);
    if (project?.status !== 'resting') endReading();
  });
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

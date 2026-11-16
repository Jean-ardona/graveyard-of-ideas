import { useSyncExternalStore } from 'react';
import type { BookPhase } from './bookSequence';
import type { TurnStatus } from './pageTurn';
import { appStore } from '../store/appStore';
import { isBackClosingGesture } from './backClose';
import { readingMachine } from './readingMachine';

/** Current phase of the book sequence; re-renders only on discrete changes. */
export function useReadingPhase(): BookPhase {
  return useSyncExternalStore(
    (listener) => readingMachine.subscribe(listener),
    () => readingMachine.phase(),
    () => readingMachine.phase(),
  );
}

export interface PageTurnView {
  index: number;
  status: TurnStatus;
  /**
   * The page content must hide: a leaf is moving (the direction of a turn has been chosen), or the
   * cover is being scrubbed by a closing gesture. A closing gesture with reduced motion moves nothing.
   */
  turning: boolean;
  /** The back board is being dragged shut from the last page: the Close button hides too. */
  backDrag: boolean;
}

/** Page index and turn status; re-renders on discrete changes only, never per frame. */
export function usePageTurnView(): PageTurnView {
  useSyncExternalStore(
    (listener) => readingMachine.subscribe(listener),
    () => readingMachine.version(),
    () => readingMachine.version(),
  );
  const { index, status, direction, closeDrag } = readingMachine.pages;
  const scrubbing = closeDrag && !appStore.getState().data.prefs.reducedMotion;
  const backDrag = scrubbing && isBackClosingGesture(readingMachine.pages);
  return { index, status, turning: direction !== null || scrubbing, backDrag };
}

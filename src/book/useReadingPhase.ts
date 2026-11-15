import { useSyncExternalStore } from 'react';
import type { BookPhase } from './bookSequence';
import type { TurnStatus } from './pageTurn';
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
}

/** Page index and turn status; re-renders on discrete changes only, never per frame. */
export function usePageTurnView(): PageTurnView {
  useSyncExternalStore(
    (listener) => readingMachine.subscribe(listener),
    () => readingMachine.version(),
    () => readingMachine.version(),
  );
  const { index, status } = readingMachine.pages;
  return { index, status };
}

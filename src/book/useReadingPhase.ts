import { useSyncExternalStore } from 'react';
import type { BookPhase } from './bookSequence';
import { readingMachine } from './readingMachine';

/** Current phase of the book sequence; re-renders only on discrete changes. */
export function useReadingPhase(): BookPhase {
  return useSyncExternalStore(
    (listener) => readingMachine.subscribe(listener),
    () => readingMachine.phase(),
    () => readingMachine.phase(),
  );
}

import type { BookPhase } from './bookSequence';

export type ReadingKeyAction = 'CLOSE' | 'NEXT_PAGE' | 'PREV_PAGE';

/**
 * Maps a key press to a reading action, or null when it means nothing here.
 * Escape closes in any phase that has a book to close; E and the arrows leave text fields alone.
 */
export function routeReadingKey(key: string, isTyping: boolean, phase: BookPhase): ReadingKeyAction | null {
  if (phase === 'closed' || phase === 'closing') return null;
  if (key === 'Escape') return 'CLOSE';
  if (isTyping) return null;
  if (key === 'e' || key === 'E') return 'CLOSE';
  if (phase !== 'open') return null;
  if (key === 'ArrowRight') return 'NEXT_PAGE';
  if (key === 'ArrowLeft') return 'PREV_PAGE';
  return null;
}

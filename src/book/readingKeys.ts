import type { BookPhase } from './bookSequence';

export type ReadingKeyAction = 'CLOSE' | 'CANCEL_DRAG' | 'NEXT_PAGE' | 'PREV_PAGE' | 'LAND';

/**
 * Maps a key press to a reading action, or null when it means nothing here.
 * Escape closes in any phase that has a book to close, except while a page is being dragged:
 * then it only cancels the drag. E and the arrows leave text fields alone.
 * `confirmLanded` is null without a resurrection dialog. While the dialog is still rising (false),
 * Escape, Enter and Space only land it (`LAND`); once it has landed (true) the mapping is unchanged,
 * so the next Escape closes as before and Enter acts on the focused button.
 * Safety rule: a second Escape before landing (`escapesBeforeLanding` at least 1) always closes, so a dialog that
 * never lands can still be left.
 */
export function routeReadingKey(
  key: string,
  isTyping: boolean,
  phase: BookPhase,
  isDragging = false,
  confirmLanded: boolean | null = null,
  escapesBeforeLanding = 0,
): ReadingKeyAction | null {
  if (phase === 'closed' || phase === 'closing') return null;
  const escapeThrough = key === 'Escape' && escapesBeforeLanding >= 1;
  if (confirmLanded === false && !escapeThrough && (key === 'Escape' || key === 'Enter' || key === ' ')) return 'LAND';
  if (key === 'Escape') return isDragging && phase === 'open' ? 'CANCEL_DRAG' : 'CLOSE';
  if (isTyping) return null;
  if (key === 'e' || key === 'E') return 'CLOSE';
  if (phase !== 'open') return null;
  if (key === 'ArrowRight') return 'NEXT_PAGE';
  if (key === 'ArrowLeft') return 'PREV_PAGE';
  return null;
}

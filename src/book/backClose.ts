import { coverOpenFraction } from './coverScrub';
import { END_INDEX } from './pageTurn';
import type { PageTurnState } from './pageTurn';

/**
 * Closing the book from its last page, in numbers. Pure: no Three.js.
 *
 * The back board closes by a rigid swing of the book about the spine axis, from 0 (open) to pi
 * (closed, back up). The front cover and the turned leaves fold the other way by the same amount,
 * so they stay where they lie while the back half comes over them. At pi the book is a closed book
 * turned upside down about its spine; the flip then turns it back from pi to 0 on the way home.
 */

/** Swing of the back board when it has closed over the leaves, in radians. */
export const BACK_SWING_MAX = Math.PI;

function clamp01(value: number, whenNaN: number): number {
  return Number.isNaN(value) ? whenNaN : Math.min(Math.max(value, 0), 1);
}

/**
 * Swing about the spine in radians for the front stack's open fraction (1 open, 0 closed) and the
 * approach progress (1 at the reading pose, 0 at the base). Always in [0, pi]; NaN counts as open
 * and as the reading pose. It is largest when the front stack is closed and the book still at the
 * reading pose, and falls to 0 as the book returns: that fall is the flip.
 */
export function backSwingAngle(openFraction: number, approach = 1): number {
  return BACK_SWING_MAX * (1 - clamp01(openFraction, 1)) * clamp01(approach, 1);
}

/** The drag in progress is a closing gesture from the right zone: it exists only in the end position. */
export function isBackClosingGesture(pages: PageTurnState): boolean {
  return pages.closeDrag && pages.side === 'right' && pages.index === END_INDEX;
}

/**
 * Angle of the back board while a closing gesture drags it, in radians: 0 when open, `pi` when closed.
 * It follows the drag progress one to one, so a longer drag never lowers it. Any other state, and
 * reduced motion (no scrubbing animation), gives 0.
 */
export function backBoardAngle(pages: PageTurnState, reducedMotion = false): number {
  if (!isBackClosingGesture(pages)) return 0;
  return backSwingAngle(coverOpenFraction(pages, reducedMotion));
}

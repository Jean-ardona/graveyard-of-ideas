import { COVER_OPEN_ANGLE } from './bookTimings';
import type { PageTurnState } from './pageTurn';

/** Clamps to [0, 1]. NaN counts as `whenNaN`. */
function clamp01(value: number, whenNaN: number): number {
  return Number.isNaN(value) ? whenNaN : Math.min(Math.max(value, 0), 1);
}

/**
 * How open the cover is while a closing gesture is scrubbing it: 1 fully open, 0 closed. It
 * follows the drag progress one to one, so it never increases while the progress grows. Any other
 * state, and reduced motion (no scrubbing animation), gives 1. Invalid progress counts as 0.
 */
export function coverOpenFraction(pages: PageTurnState, reducedMotion = false): number {
  if (reducedMotion || !pages.closeDrag) return 1;
  return 1 - clamp01(pages.progress, 0);
}

/** Front board angle in radians for an open fraction. Always in [0, COVER_OPEN_ANGLE]; NaN counts as open. */
export function coverAngle(openFraction: number): number {
  return COVER_OPEN_ANGLE * clamp01(openFraction, 1);
}

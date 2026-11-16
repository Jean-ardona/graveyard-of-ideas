import type { BookPhase } from './bookSequence';
import { PAGE_FADE_SECONDS } from './bookTimings';
import type { TurnStatus } from './pageTurn';

/**
 * Pure model of how the leaf texture and the HTML overlay hand the page over, so the page is never
 * blank: either the texture is visible or the overlay is fully opaque, at every step.
 *
 * The page is shown by the overlay only when the book is open and the pages rest. At turn start or
 * when the book leaves `open`, the texture is shown (after the dirty leaves are redrawn) and the
 * overlay is hidden, in that order and in one step. At turn end the overlay fades in over
 * `crossfadeSeconds` with the texture still visible. Only after the overlay reports opacity 1 does the
 * texture give way to the blank paper. Without a report the texture stays under the opaque overlay.
 */

export interface CrossfadeState {
  /** The front slot of the leaf shows the texture (otherwise the blank paper). */
  readonly textureVisible: boolean;
  /** `hidden`: opacity 0. `fading`: fading in. `opaque`: opacity 1, reported. */
  readonly overlay: 'hidden' | 'fading' | 'opaque';
}

export interface CrossfadeInput {
  phase: BookPhase;
  status: TurnStatus;
  reducedMotion: boolean;
  /** The overlay reports that it reached opacity 1 (the `transitionend` of its opacity). */
  opaqueReported: boolean;
}

/** Only these three states exist, so a step never allocates. */
const TEXTURE_ONLY: CrossfadeState = { textureVisible: true, overlay: 'hidden' };
const FADING_IN: CrossfadeState = { textureVisible: true, overlay: 'fading' };
const OVERLAY_ONLY: CrossfadeState = { textureVisible: false, overlay: 'opaque' };

/** The state before anything is open: the texture slot shows the texture, the overlay is hidden. */
export const INITIAL_CROSSFADE: CrossfadeState = TEXTURE_ONLY;

/** Fade-in duration of the overlay in seconds: none with reduced motion. */
export function crossfadeSeconds(reducedMotion: boolean): number {
  return reducedMotion ? 0 : PAGE_FADE_SECONDS;
}

/** The overlay is wanted only when the book is open and no leaf moves. */
export function overlayWanted(phase: BookPhase, status: TurnStatus): boolean {
  return phase === 'open' && status === 'idle';
}

/** The next state after a change of phase or status, or after the overlay's opacity report. */
export function stepCrossfade(state: CrossfadeState, input: CrossfadeInput): CrossfadeState {
  if (!overlayWanted(input.phase, input.status)) return TEXTURE_ONLY;
  if (crossfadeSeconds(input.reducedMotion) === 0) return OVERLAY_ONLY;
  if (state.overlay === 'hidden') return FADING_IN;
  if (state.overlay === 'fading') return input.opaqueReported ? OVERLAY_ONLY : FADING_IN;
  return OVERLAY_ONLY;
}

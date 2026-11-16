import { backSwingAngle } from './backClose';
import { APPROACH_END, BACK_FLIP_RATE, LIFT_END, MAX_FRAME_DELTA, SEQUENCE_TIMINGS, TOTAL_SECONDS } from './bookTimings';

export type BookPhase = 'closed' | 'lifting' | 'approaching' | 'coverOpening' | 'open' | 'closing';
export type BookEvent = 'OPEN' | 'CLOSE' | 'SKIP';
/** Which board the book closes with: the front cover, or the back board from the last page. */
export type CloseSide = 'front' | 'back';

/**
 * `t` is time on the forward timeline, from 0 to TOTAL_SECONDS. Every pose depends on `t` and on
 * `side` alone. `side` is `back` only while closing from the last page; it is `front` otherwise.
 */
export interface SequenceState {
  phase: BookPhase;
  t: number;
  closePending: boolean;
  side: CloseSide;
}

/** Eased progress of each step, each in [0, 1], and the swing of the book about its spine in [0, pi]. */
export interface SequenceProgress {
  lift: number;
  approach: number;
  cover: number;
  /** Radians. 0 except while closing with the back board: pi when closed back up, 0 again at the base. */
  swing: number;
}

export function createSequenceState(): SequenceState {
  return { phase: 'closed', t: 0, closePending: false, side: 'front' };
}

export function createSequenceProgress(): SequenceProgress {
  return { lift: 0, approach: 0, cover: 0, swing: 0 };
}

/** Largest step a frame may advance the sequence; invalid or negative values count as zero. */
export function clampDelta(dt: number): number {
  return dt > 0 ? Math.min(dt, MAX_FRAME_DELTA) : 0;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Writes the eased progress for time `t` and the closing side into `out`. */
export function writeProgress(t: number, out: SequenceProgress, side: CloseSide = 'front'): void {
  out.lift = easeOutCubic(clamp01(t / SEQUENCE_TIMINGS.liftSeconds));
  out.approach = easeInOutCubic(clamp01((t - LIFT_END) / SEQUENCE_TIMINGS.approachSeconds));
  out.cover = easeInOutCubic(clamp01((t - APPROACH_END) / SEQUENCE_TIMINGS.coverSeconds));
  out.swing = side === 'back' ? backSwingAngle(out.cover, out.approach) : 0;
}

/** Opening phase for a time strictly inside the timeline. */
function openingPhaseAt(t: number): BookPhase {
  if (t < LIFT_END) return 'lifting';
  if (t < APPROACH_END) return 'approaching';
  if (t < TOTAL_SECONDS) return 'coverOpening';
  return 'open';
}

export function isOpening(phase: BookPhase): boolean {
  return phase === 'lifting' || phase === 'approaching' || phase === 'coverOpening';
}

function enterOpen(state: SequenceState): void {
  state.phase = 'open';
  state.t = TOTAL_SECONDS;
  state.closePending = false;
  state.side = 'front';
}

function enterClosing(state: SequenceState, back: boolean): void {
  state.phase = 'closing';
  state.closePending = false;
  state.side = back ? 'back' : 'front';
}

function enterClosed(state: SequenceState): void {
  state.phase = 'closed';
  state.t = 0;
  state.closePending = false;
  state.side = 'front';
}

/** Inverse of `easeInOutCubic` on [0, 1]; NaN counts as 1 (fully open). */
function inverseEaseInOutCubic(y: number): number {
  const v = Number.isNaN(y) ? 1 : clamp01(y);
  const x = v < 0.5 ? Math.cbrt(v / 4) : 1 - Math.cbrt(2 * (1 - v)) / 2;
  return clamp01(x);
}

/**
 * Closes from an open book whose cover was scrubbed to `openFraction` (1 open, 0 closed): sets `t`
 * so the eased cover progress equals the fraction, then starts closing. The cover continues from
 * its current angle with no jump, then the rest of the closing sequence runs. Only from `open`.
 * `back` closes with the back board (a gesture from the last page) instead of the front cover.
 */
export function startClosingFromCover(state: SequenceState, openFraction: number, back = false): void {
  if (state.phase !== 'open') return;
  state.t = APPROACH_END + SEQUENCE_TIMINGS.coverSeconds * inverseEaseInOutCubic(openFraction);
  enterClosing(state, back);
}

/**
 * Applies one event to the state. `pagesIdle` tells whether the page model is at rest;
 * closing from `open` waits for it. OPEN is accepted only from `closed`; whether the
 * world allows it is decided by the caller (see `canOpenBook`). `atEnd` (the pages are in the end
 * position) makes a close from `open` use the back board; closing while the book is still opening
 * always uses the front cover.
 */
export function applySequenceEvent(
  state: SequenceState,
  event: BookEvent,
  pagesIdle: boolean,
  atEnd = false,
): void {
  const { phase } = state;
  if (event === 'OPEN') {
    if (phase === 'closed') state.phase = 'lifting';
  } else if (event === 'CLOSE') {
    if (isOpening(phase)) enterClosing(state, false);
    else if (phase === 'open') {
      if (pagesIdle) enterClosing(state, atEnd);
      else state.closePending = true;
    }
  } else if (isOpening(phase)) enterOpen(state);
  else if (phase === 'closing') enterClosed(state);
}

/**
 * Moves a back-side closing down the timeline by `dt` real seconds. The approach step is the flip:
 * it takes `BACK_FLIP.seconds`, so the timeline runs slower there. Returns when time or timeline runs out.
 */
function tickBackClosing(state: SequenceState, dt: number): void {
  let remaining = dt;
  while (remaining > 0 && state.t > 0) {
    const inFlip = state.t > LIFT_END && state.t <= APPROACH_END;
    const floor = state.t > APPROACH_END ? APPROACH_END : inFlip ? LIFT_END : 0;
    const rate = inFlip ? BACK_FLIP_RATE : 1;
    const room = (state.t - floor) / rate;
    if (remaining < room) {
      state.t -= remaining * rate;
      return;
    }
    state.t = floor;
    remaining -= room;
  }
}

/** Advances the sequence by `dt` seconds (clamped). Time left over at an end point is discarded. */
export function tickSequence(state: SequenceState, dt: number, pagesIdle: boolean, atEnd = false): void {
  const step = clampDelta(dt);
  const { phase } = state;
  if (isOpening(phase)) {
    state.t = Math.min(state.t + step, TOTAL_SECONDS);
    state.phase = openingPhaseAt(state.t);
  } else if (phase === 'closing') {
    if (state.side === 'back') tickBackClosing(state, step);
    else state.t = Math.max(state.t - step, 0);
    if (state.t <= 0) enterClosed(state);
  } else if (phase === 'open' && state.closePending && pagesIdle) {
    enterClosing(state, atEnd);
  }
}

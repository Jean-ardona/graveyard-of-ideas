import { APPROACH_END, LIFT_END, MAX_FRAME_DELTA, SEQUENCE_TIMINGS, TOTAL_SECONDS } from './bookTimings';

export type BookPhase = 'closed' | 'lifting' | 'approaching' | 'coverOpening' | 'open' | 'closing';
export type BookEvent = 'OPEN' | 'CLOSE' | 'SKIP';

/** `t` is time on the forward timeline, from 0 to TOTAL_SECONDS. Every pose depends on `t` alone. */
export interface SequenceState {
  phase: BookPhase;
  t: number;
  closePending: boolean;
}

/** Eased progress of each step, each in [0, 1]. */
export interface SequenceProgress {
  lift: number;
  approach: number;
  cover: number;
}

export function createSequenceState(): SequenceState {
  return { phase: 'closed', t: 0, closePending: false };
}

export function createSequenceProgress(): SequenceProgress {
  return { lift: 0, approach: 0, cover: 0 };
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

/** Writes the eased progress for time `t` into `out`. */
export function writeProgress(t: number, out: SequenceProgress): void {
  out.lift = easeOutCubic(clamp01(t / SEQUENCE_TIMINGS.liftSeconds));
  out.approach = easeInOutCubic(clamp01((t - LIFT_END) / SEQUENCE_TIMINGS.approachSeconds));
  out.cover = easeInOutCubic(clamp01((t - APPROACH_END) / SEQUENCE_TIMINGS.coverSeconds));
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
}

function enterClosing(state: SequenceState): void {
  state.phase = 'closing';
  state.closePending = false;
}

function enterClosed(state: SequenceState): void {
  state.phase = 'closed';
  state.t = 0;
  state.closePending = false;
}

/**
 * Applies one event to the state. `pagesIdle` tells whether the page model is at rest;
 * closing from `open` waits for it. OPEN is accepted only from `closed`; whether the
 * world allows it is decided by the caller (see `canOpenBook`).
 */
export function applySequenceEvent(state: SequenceState, event: BookEvent, pagesIdle: boolean): void {
  const { phase } = state;
  if (event === 'OPEN') {
    if (phase === 'closed') state.phase = 'lifting';
  } else if (event === 'CLOSE') {
    if (isOpening(phase)) enterClosing(state);
    else if (phase === 'open') {
      if (pagesIdle) enterClosing(state);
      else state.closePending = true;
    }
  } else if (isOpening(phase)) enterOpen(state);
  else if (phase === 'closing') enterClosed(state);
}

/** Advances the sequence by `dt` seconds (clamped). Time left over at an end point is discarded. */
export function tickSequence(state: SequenceState, dt: number, pagesIdle: boolean): void {
  const step = clampDelta(dt);
  const { phase } = state;
  if (isOpening(phase)) {
    state.t = Math.min(state.t + step, TOTAL_SECONDS);
    state.phase = openingPhaseAt(state.t);
  } else if (phase === 'closing') {
    state.t = Math.max(state.t - step, 0);
    if (state.t <= 0) enterClosed(state);
  } else if (phase === 'open' && state.closePending && pagesIdle) {
    enterClosing(state);
  }
}

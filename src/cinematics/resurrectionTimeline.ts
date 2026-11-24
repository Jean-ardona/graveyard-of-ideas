import { GROUP_B_TOTAL, RETURN_SECONDS, SPECTER_PHASES, SPECTER_TOTAL } from './specterTimings';

/**
 * The resurrection cinematic as a list of timed steps. Pure: no React, Three.js, DOM or timers.
 * The project is already saved as Resurrected when the timeline starts; it only represents that.
 *
 * Group A (embers) is the first step. Group B (gather, form, depart, vanish, return) starts only after A
 * has completed AND the book has disappeared: a step advances only when the previous one finished, so the
 * order cannot be broken by a large `dt`. Group B is reported as plain times (`groupBTime`, `specterTime`)
 * that the specter and the camera evaluate; its durations come from `specterTimings` (one source).
 * The state, progress and effects records are created once and mutated in place.
 */

/** Largest step a frame may advance the timeline, in seconds. */
export const MAX_FRAME_DELTA = 0.1;

export const BOOK_PARTS = ['cover', 'spine', 'pageBlock', 'pages'] as const;
export type BookPartName = (typeof BOOK_PARTS)[number];

/** Seconds of the embers step (data constant, tuned on the target machine). */
export const EMBERS_SECONDS = 3.4;

/** Steps in order, with their duration in seconds. */
export const STEPS = [
  { id: 'embers', seconds: EMBERS_SECONDS },
  { id: 'gather', seconds: SPECTER_PHASES.gather.duration },
  { id: 'form', seconds: SPECTER_PHASES.form.duration },
  { id: 'depart', seconds: SPECTER_PHASES.depart.duration },
  { id: 'vanish', seconds: SPECTER_PHASES.vanish.duration },
  { id: 'return', seconds: RETURN_SECONDS },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

/** Index of the first step of group B. */
export const FIRST_SPECTER_STEP = 1;
export const STEP_COUNT = STEPS.length;
export const TOTAL_SECONDS = STEPS.reduce((sum, step) => sum + step.seconds, 0);

/** Where each step of group B starts on the `groupBTime` axis (indexed by step; entry 0 is unused). */
const GROUP_B_STARTS: readonly number[] = [
  0,
  SPECTER_PHASES.gather.start,
  SPECTER_PHASES.form.start,
  SPECTER_PHASES.depart.start,
  SPECTER_PHASES.vanish.start,
  SPECTER_TOTAL,
];

/**
 * When each book part burns, as a fraction of the embers step: [start, end]. Staggered, and every
 * part is gone by 0.75 so the last embers have a quarter of the step left to rise and die out.
 */
export const PART_WINDOWS: Readonly<Record<BookPartName, readonly [number, number]>> = {
  cover: [0, 0.35],
  spine: [0.1, 0.45],
  pageBlock: [0.2, 0.6],
  pages: [0.3, 0.75],
};

/** Fraction of the embers step an ember lives; born no later than the end of its part's window. */
export const EMBER_LIFE = 0.25;

export interface ResurrectionState {
  /** Index into STEPS; `STEP_COUNT` once the sequence is over. */
  step: number;
  /** Seconds spent in the current step. */
  elapsed: number;
}

/** Eased progress of the book parts, in [0, 1], and the plain times of group B. */
export interface ResurrectionProgress {
  /** Raw progress of the embers step, for the ember field. */
  embers: number;
  cover: number;
  spine: number;
  pageBlock: number;
  pages: number;
  /** Seconds since group B opened, in [0, GROUP_B_TOTAL]. 0 until the embers are done and the book is gone. */
  groupBTime: number;
  /** `min(groupBTime, SPECTER_TOTAL)`: the time the specter evaluates. */
  specterTime: number;
}

export interface ResurrectionEffects {
  /** All four book parts have completely dissolved. */
  bookGone: boolean;
  /** The sequence is over: the tomb, its collider and every temporary object may go. */
  done: boolean;
}

export function createResurrectionState(): ResurrectionState {
  return { step: 0, elapsed: 0 };
}

export function createResurrectionProgress(): ResurrectionProgress {
  return { embers: 0, cover: 0, spine: 0, pageBlock: 0, pages: 0, groupBTime: 0, specterTime: 0 };
}

export function createResurrectionEffects(): ResurrectionEffects {
  return { bookGone: false, done: false };
}

/** A frame step: invalid or negative values count as zero, large ones are clamped. */
export function clampDelta(dt: number): number {
  return dt > 0 ? Math.min(dt, MAX_FRAME_DELTA) : 0;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Raw (linear) progress of step `index` for the state. */
function stepFraction(state: ResurrectionState, index: number): number {
  if (index < state.step) return 1;
  if (index > state.step) return 0;
  return clamp01(state.elapsed / (STEPS[index]?.seconds ?? 1));
}

/** Eased progress of one book part for the raw progress `embers` of the embers step. */
export function partProgress(part: BookPartName, embers: number): number {
  const [start, end] = PART_WINDOWS[part];
  return easeInOutCubic(clamp01((embers - start) / (end - start)));
}

/** Writes progress and effects from the state. Every value depends on the state alone. */
function derive(state: ResurrectionState, progress: ResurrectionProgress, effects: ResurrectionEffects): void {
  const embers = stepFraction(state, 0);
  progress.embers = embers;
  progress.cover = partProgress('cover', embers);
  progress.spine = partProgress('spine', embers);
  progress.pageBlock = partProgress('pageBlock', embers);
  progress.pages = partProgress('pages', embers);
  effects.bookGone = progress.cover === 1 && progress.spine === 1 && progress.pageBlock === 1 && progress.pages === 1;
  // Group B shows nothing until group A has completed.
  const open = state.step >= FIRST_SPECTER_STEP && effects.bookGone;
  if (!open) {
    progress.groupBTime = 0;
  } else if (state.step >= STEP_COUNT) {
    progress.groupBTime = GROUP_B_TOTAL;
  } else {
    progress.groupBTime = Math.min(GROUP_B_STARTS[state.step]! + state.elapsed, GROUP_B_TOTAL);
  }
  progress.specterTime = Math.min(progress.groupBTime, SPECTER_TOTAL);
  effects.done = state.step >= STEP_COUNT;
}

/**
 * The final state of the sequence: every step complete, the book gone, `groupBTime` 9.4, `specterTime`
 * 7.8 (the specter is gone), `done` set. Reduced motion lands here in one tick; a later skip lands here too.
 */
export function finishResurrection(
  state: ResurrectionState,
  progress: ResurrectionProgress,
  effects: ResurrectionEffects,
): void {
  state.step = STEP_COUNT;
  state.elapsed = 0;
  derive(state, progress, effects);
}

/**
 * Advances the timeline by `dt` seconds (clamped). A step completes before the next one starts and
 * left-over time carries into it. With `instant` (reduced motion or calm mode) one tick reaches the end.
 */
export function tickResurrection(
  state: ResurrectionState,
  progress: ResurrectionProgress,
  effects: ResurrectionEffects,
  dt: number,
  instant: boolean,
): void {
  if (instant) {
    finishResurrection(state, progress, effects);
    return;
  }
  let remaining = clampDelta(dt);
  while (remaining > 0 && state.step < STEP_COUNT) {
    // Awaiting completion: group B cannot start before the book has completely disappeared.
    if (state.step >= FIRST_SPECTER_STEP && !effects.bookGone) break;
    const room = (STEPS[state.step]?.seconds ?? 0) - state.elapsed;
    if (remaining < room) {
      state.elapsed += remaining;
      remaining = 0;
    } else {
      remaining -= room;
      state.step += 1;
      state.elapsed = 0;
    }
    derive(state, progress, effects);
  }
  derive(state, progress, effects);
}

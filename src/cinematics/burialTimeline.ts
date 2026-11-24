/**
 * The burial cinematic as a timeline. Pure: no React, Three.js, DOM, store or timers.
 * The project is already saved when the timeline starts; it only represents that state, so there is
 * no data effect here and the effects record is just `{ done }`.
 *
 * The timeline, its progress record and its effects record are created once and mutated in place.
 */

/** Seconds of each step (data constants, tuned on the target machine). */
export const TURN = 1.2;
export const APPEAR = 1.0;
export const SETTLE = 0.8;
export const TOTAL_SECONDS = TURN + APPEAR + SETTLE;

/** Largest step a frame may advance the timeline, in seconds. */
export const MAX_FRAME_DELTA = 0.1;

/** Eased progress of every visual, each in [0, 1]. `glow` rises with the appear step and fades in the settle step. */
export interface BurialProgress {
  turn: number;
  appear: number;
  glow: number;
  settle: number;
}

export interface BurialEffects {
  /** The timeline reached its end. */
  done: boolean;
}

export interface BurialTimeline {
  /** Seconds spent so far, in [0, duration]. */
  elapsed: number;
  /** Total length: `TOTAL_SECONDS`, or 0 when motion is off (reduced motion or calm mode). */
  duration: number;
  readonly progress: BurialProgress;
  readonly effects: BurialEffects;
}

/** Length of the timeline: 0 with reduced motion or calm mode, so one tick reaches the final state. */
export function burialDuration(instant: boolean): number {
  return instant ? 0 : TOTAL_SECONDS;
}

function clamp01(value: number): number {
  return value > 0 ? Math.min(value, 1) : 0;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** A frame step: invalid or negative values count as zero, large ones are clamped. */
export function clampDelta(dt: number): number {
  return dt > 0 ? Math.min(dt, MAX_FRAME_DELTA) : 0;
}

/** Writes progress and effects from the elapsed time alone. */
function derive(timeline: BurialTimeline): void {
  const { elapsed, progress, effects } = timeline;
  const appear = clamp01((elapsed - TURN) / APPEAR);
  const settle = clamp01((elapsed - TURN - APPEAR) / SETTLE);
  const done = elapsed >= timeline.duration;
  // A timeline of length 0 is already at its end: every step is complete.
  progress.turn = done ? 1 : easeInOutCubic(clamp01(elapsed / TURN));
  progress.appear = done ? 1 : easeInOutCubic(appear);
  progress.settle = done ? 1 : easeInOutCubic(settle);
  progress.glow = done ? 0 : settle > 0 ? 1 - progress.settle : progress.appear;
  effects.done = done;
}

export function createBurialTimeline(instant = false): BurialTimeline {
  const timeline: BurialTimeline = {
    elapsed: 0,
    duration: burialDuration(instant),
    progress: { turn: 0, appear: 0, glow: 0, settle: 0 },
    effects: { done: false },
  };
  derive(timeline);
  return timeline;
}

/**
 * Advances the timeline by `dt` seconds (clamped). With `reducedMotion` (reduced motion or calm mode)
 * one tick reaches the final state. Returns the timeline for chaining.
 */
export function tickBurial(timeline: BurialTimeline, dt: number, reducedMotion: boolean): BurialTimeline {
  timeline.duration = burialDuration(reducedMotion);
  timeline.elapsed = Math.min(timeline.elapsed + clampDelta(dt), timeline.duration);
  derive(timeline);
  return timeline;
}

/**
 * Lands on the final state whatever `at`, the moment the skip arrived, is: a time before the start,
 * beyond the end or not a number all end the same way.
 */
export function skipBurial(timeline: BurialTimeline, at: number): BurialTimeline {
  const arrived = Number.isFinite(at) ? Math.min(Math.max(at, 0), timeline.duration) : 0;
  // Never earlier than the end: the skip always lands on the final state.
  timeline.elapsed = Math.max(arrived, timeline.duration);
  derive(timeline);
  return timeline;
}

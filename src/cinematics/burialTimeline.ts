import { smoothstep } from './cameraPose';
import {
  APPEAR_SECONDS,
  DOLLY_IN,
  GLOW_FADE_SECONDS,
  GLOW_FADE_START,
  HOLD_END,
  RETURN,
  TOTAL_SECONDS,
} from './burialTimings';

/**
 * The burial cinematic as a timeline. Pure: no React, Three.js, DOM, store or timers.
 * The project is already saved when the timeline starts; it only represents that state, so there is
 * no data effect here and the effects record is just `{ done }`.
 *
 * Every progress value is a function of `elapsed` alone. The timeline, its progress record and its
 * effects record are created once and mutated in place.
 */

/** Largest step a frame may advance the timeline, in seconds. */
export const MAX_FRAME_DELTA = 0.1;

/**
 * Eased progress of every visual, each in [0, 1]. `dolly` is the travel to the hold spot, `appear` the
 * book rising over the first `APPEAR_SECONDS` of the hold, `glow` follows `appear` and falls to 0 over
 * the last `GLOW_FADE_SECONDS` of the hold, and `back` is the travel back to the player.
 */
export interface BurialProgress {
  dolly: number;
  appear: number;
  glow: number;
  back: number;
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

/** A frame step: invalid or negative values count as zero, large ones are clamped. */
export function clampDelta(dt: number): number {
  return dt > 0 ? Math.min(dt, MAX_FRAME_DELTA) : 0;
}

/** Writes progress and effects from the elapsed time alone. */
function derive(timeline: BurialTimeline): void {
  const { elapsed, progress, effects } = timeline;
  const done = elapsed >= timeline.duration;
  if (done) {
    // A timeline of length 0 is already at its end: every step is complete and the glow is gone.
    progress.dolly = 1;
    progress.appear = 1;
    progress.glow = 0;
    progress.back = 1;
  } else {
    const appear = smoothstep((elapsed - DOLLY_IN) / APPEAR_SECONDS);
    progress.dolly = smoothstep(elapsed / DOLLY_IN);
    progress.appear = appear;
    progress.glow = appear * (1 - smoothstep((elapsed - GLOW_FADE_START) / GLOW_FADE_SECONDS));
    progress.back = smoothstep((elapsed - HOLD_END) / RETURN);
  }
  effects.done = done;
}

export function createBurialTimeline(instant = false): BurialTimeline {
  const timeline: BurialTimeline = {
    elapsed: 0,
    duration: burialDuration(instant),
    progress: { dolly: 0, appear: 0, glow: 0, back: 0 },
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

import { SUMMON_LOOK, SUMMON_TIMINGS } from './summonTimings';
import type { SummonDirection, SummonDurations, SummonKind } from './summonTimings';

/** Pure timeline of one page: how far it has risen or dissolved at time `t`. No React, DOM, store or timers. */

export interface PagePose {
  opacity: number;
  /** Pixels, positive is down. */
  offsetY: number;
  /** Degrees about the bottom edge. */
  tilt: number;
  scale: number;
}

export const FINAL_POSE: Readonly<PagePose> = Object.freeze({ opacity: 1, offsetY: 0, tilt: 0, scale: 1 });

const INSTANT: SummonDurations = Object.freeze({ inSeconds: 0, outSeconds: 0 });

/** The durations of `kind`, both 0 when motion is instant (reduced animations or calm mode). */
export function summonDurations(kind: SummonKind, instant: boolean): SummonDurations {
  return instant ? INSTANT : SUMMON_TIMINGS[kind];
}

/** `t / duration` in [0, 1]: NaN, 0 and negative give 0, +Infinity gives 1. `duration` must be above 0. */
function fraction(t: number, duration: number): number {
  if (!(t > 0)) return 0;
  const raw = t / duration;
  return raw < 1 ? raw : 1;
}

/** Eased progress in [0, 1]: ease-out cubic for a summon, ease-in cubic for a dismissal. A duration of 0 gives 1. */
export function summonProgress(direction: SummonDirection, kind: SummonKind, t: number, instant: boolean): number {
  const durations = summonDurations(kind, instant);
  const duration = direction === 'summon' ? durations.inSeconds : durations.outSeconds;
  if (!(duration > 0)) return 1;
  const raw = fraction(t, duration);
  if (direction === 'summon') {
    const rest = 1 - raw;
    return 1 - rest * rest * rest;
  }
  return raw * raw * raw;
}

/** Writes the pose of a page at time `t` into `out` and returns `out`. */
export function writePagePose(
  direction: SummonDirection,
  kind: SummonKind,
  t: number,
  instant: boolean,
  out: PagePose,
): PagePose {
  const p = summonProgress(direction, kind, t, instant);
  if (direction === 'summon') {
    const rest = 1 - p;
    const gained = SUMMON_LOOK.fadeInGain * p;
    out.opacity = gained < 1 ? gained : 1;
    out.offsetY = SUMMON_LOOK.riseY * rest;
    out.tilt = SUMMON_LOOK.tiltDegrees * rest;
    out.scale = 1 - (1 - SUMMON_LOOK.startScale) * rest;
  } else {
    out.opacity = 1 - p;
    out.offsetY = 0 - SUMMON_LOOK.outLift * p;
    out.tilt = 0;
    out.scale = 1 + SUMMON_LOOK.outGrow * p;
  }
  return out;
}

/**
 * A swap between two pages: the outgoing page dissolves first, then the incoming page is summoned
 * (its clock starts when the outgoing one has finished), so the two are never visible together.
 */
export function writeSwap(
  kind: SummonKind,
  t: number,
  instant: boolean,
  outgoing: PagePose,
  incoming: PagePose,
): void {
  writePagePose('dismiss', kind, t, instant, outgoing);
  writePagePose('summon', kind, t - summonDurations(kind, instant).outSeconds, instant, incoming);
}

/** True once the summon has reached its end (at once when its duration is 0). NaN has not landed. */
export function isLanded(kind: SummonKind, t: number, instant: boolean): boolean {
  const duration = summonDurations(kind, instant).inSeconds;
  if (!(duration > 0)) return true;
  return t >= duration;
}

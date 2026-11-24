import type { QualityLevel } from '../../domain/types';

/**
 * Data for the page summon animation. Pure: no React, Three.js, DOM, store or timers.
 * Colors are not stored here: the motes use the existing `mist` token of the UI kit.
 */

export type SummonKind = 'full' | 'short';
export type SummonDirection = 'summon' | 'dismiss';

export interface SummonDurations {
  /** Seconds the summon (rise) takes. */
  readonly inSeconds: number;
  /** Seconds the dismissal (dissolve) takes. */
  readonly outSeconds: number;
}

export const SUMMON_TIMINGS: Readonly<Record<SummonKind, SummonDurations>> = Object.freeze({
  full: Object.freeze({ inSeconds: 2.2, outSeconds: 0.9 }),
  short: Object.freeze({ inSeconds: 0.5, outSeconds: 0.3 }),
});

export const SUMMON_LOOK = Object.freeze({
  /** Pixels the page starts below its place. */
  riseY: 48,
  /** Degrees the page starts tilted about its bottom edge. */
  tiltDegrees: 12,
  startScale: 0.96,
  /** Opacity reaches 1 when the eased progress reaches 1 / fadeInGain. */
  fadeInGain: 1.5,
  /** Pixels the dissolving page lifts. */
  outLift: 16,
  outGrow: 0.02,
  /** Pixels the motes drift up when a page dissolves. */
  moteLift: 140,
  /** Sideways sway of a drifting mote, in pixels. */
  moteSway: 6,
  /** Turns a mote spirals through on its way in. */
  swirlTurns: 0.75,
  /** Pixel size of an ordinary mote. */
  moteSizeMin: 1,
  moteSizeMax: 4,
  /** About this fraction of the motes are larger and softer (lower alpha). */
  largeMoteFraction: 0.08,
  largeMoteSizeMax: 7,
  largeMoteAlpha: 0.45,
  moteAlpha: 0.8,
  /**
   * Start ring of a summoned mote, as a fraction of the page's half-diagonal around its target. Small values
   * start behind the page, large ones around it.
   */
  ringMin: 0.15,
  ringMax: 1.05,
  /** Twinkle: the alpha dips by up to this fraction, at a per-mote rate between the two values (Hz). */
  twinkleDepth: 0.45,
  twinkleHzMin: 1.5,
  twinkleHzMax: 3.5,
  /** A mote arrives at a point between this fraction of the summon and its end. */
  arrivalMin: 0.55,
});

export const MOTES_MIN = 60;
export const MOTES_MAX = 100;

export const MOTE_COUNTS: Readonly<Record<QualityLevel, number>> = Object.freeze({
  low: 60,
  medium: 80,
  high: 100,
});

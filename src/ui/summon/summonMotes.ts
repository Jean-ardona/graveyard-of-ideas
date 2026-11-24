import type { QualityLevel } from '../../domain/types';
import { summonDurations, summonProgress } from './pageSummon';
import { MOTE_COUNTS, MOTES_MAX, MOTES_MIN, SUMMON_LOOK } from './summonTimings';
import type { SummonDirection, SummonKind } from './summonTimings';

/**
 * The motes of the page summon, as pure math over preallocated typed arrays. No React, Three.js,
 * DOM, store or timers, and no random source: every mote depends on its index alone.
 * Positions are pixels relative to the top-left corner of the page rectangle.
 */

const SEED_ANGLE = 0;
const SEED_RING = 1;
const SEED_ARRIVAL = 2;
const SEED_TARGET_X = 3;
const SEED_TARGET_Y = 4;
const SEED_SWAY = 5;
const SEED_SIZE = 6;
const SEED_FIELDS = 7;

/** Largest page extent used, so no product below can overflow. */
const MAX_EXTENT = 1e6;
const TAU = Math.PI * 2;

export interface MoteBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  /** `SEED_FIELDS` deterministic values in [0, 1) per mote. */
  readonly seeds: Float32Array;
}

/** 0 when motion is instant, otherwise 30, 36 or 40 for Low, Medium and High. */
export function moteCount(quality: QualityLevel, instant: boolean): number {
  return instant ? 0 : MOTE_COUNTS[quality];
}

/** `n` truncated to an integer in [MOTES_MIN, MOTES_MAX]. NaN counts as the minimum. */
export function clampMoteCount(n: number): number {
  const whole = Math.trunc(n);
  if (!(whole > MOTES_MIN)) return MOTES_MIN;
  return whole < MOTES_MAX ? whole : MOTES_MAX;
}

/** Deterministic hash of an integer index and a salt to [0, 1). */
function hash(index: number, salt: number): number {
  let x = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

/** Radical inverse of `index` (an integer from 1) in `base`: a value in (0, 1). */
function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  let rest = index;
  while (rest > 0) {
    fraction /= base;
    result += fraction * (rest % base);
    rest = Math.floor(rest / base);
  }
  return result;
}

/** Allocates the buffer once, for `MOTES_MAX` motes, with its seed table. */
export function createMoteBuffer(): MoteBuffer {
  const seeds = new Float32Array(MOTES_MAX * SEED_FIELDS);
  for (let i = 0; i < MOTES_MAX; i++) {
    const base = i * SEED_FIELDS;
    seeds[base + SEED_ANGLE] = hash(i, 1);
    seeds[base + SEED_RING] = hash(i, 2);
    seeds[base + SEED_ARRIVAL] = SUMMON_LOOK.arrivalMin + (1 - SUMMON_LOOK.arrivalMin) * hash(i, 3);
    seeds[base + SEED_TARGET_X] = halton(i + 1, 2);
    seeds[base + SEED_TARGET_Y] = halton(i + 1, 3);
    seeds[base + SEED_SWAY] = hash(i, 4);
    seeds[base + SEED_SIZE] = hash(i, 5);
  }
  return {
    x: new Float32Array(MOTES_MAX),
    y: new Float32Array(MOTES_MAX),
    size: new Float32Array(MOTES_MAX),
    alpha: new Float32Array(MOTES_MAX),
    seeds,
  };
}

/** A page extent in pixels: non-finite or non-positive counts as 1, huge values are capped. */
function extent(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  return value < MAX_EXTENT ? value : MAX_EXTENT;
}

/** The number of motes to write: `count` truncated to an integer in [0, MOTES_MAX]. */
function activeLimit(count: number): number {
  const whole = Math.trunc(count);
  if (!(whole > 0)) return 0;
  return whole < MOTES_MAX ? whole : MOTES_MAX;
}

/**
 * Writes the motes of a page at time `t` into `buffer` and returns how many have an alpha above 0.
 * Summon: each mote starts on a ring around the page and spirals inward to a Halton point inside it,
 * arriving before the end of the summon. Dismiss: each mote starts inside the page and drifts up.
 * Every alpha is 0 at `t <= 0`, at `t >= duration`, for non-finite `t`, and when motion is instant.
 */
export function writeMotes(
  direction: SummonDirection,
  kind: SummonKind,
  t: number,
  instant: boolean,
  width: number,
  height: number,
  count: number,
  buffer: MoteBuffer,
): number {
  buffer.alpha.fill(0);
  const durations = summonDurations(kind, instant);
  const duration = direction === 'summon' ? durations.inSeconds : durations.outSeconds;
  const limit = activeLimit(count);
  if (instant || limit === 0 || !(duration > 0) || !Number.isFinite(t) || !(t > 0) || t >= duration) return 0;

  const w = extent(width);
  const h = extent(height);
  const halfDiagonal = 0.5 * Math.hypot(w, h);
  const raw = t / duration;
  const eased = summonProgress('summon', kind, t, false);
  const ringSpan = SUMMON_LOOK.ringMax - SUMMON_LOOK.ringMin;
  const sizeSpan = SUMMON_LOOK.moteSizeMax - SUMMON_LOOK.moteSizeMin;
  let active = 0;

  for (let i = 0; i < limit; i++) {
    const base = i * SEED_FIELDS;
    const targetX = buffer.seeds[base + SEED_TARGET_X] * w;
    const targetY = buffer.seeds[base + SEED_TARGET_Y] * h;
    buffer.size[i] = SUMMON_LOOK.moteSizeMin + sizeSpan * buffer.seeds[base + SEED_SIZE];
    if (direction === 'summon') {
      const q = eased / buffer.seeds[base + SEED_ARRIVAL];
      const left = q < 1 ? 1 - q : 0;
      const ring = (SUMMON_LOOK.ringMin + ringSpan * buffer.seeds[base + SEED_RING]) * halfDiagonal * left;
      const angle = TAU * (buffer.seeds[base + SEED_ANGLE] + SUMMON_LOOK.swirlTurns * (q < 1 ? q : 1));
      buffer.x[i] = targetX + ring * Math.cos(angle);
      buffer.y[i] = targetY + ring * Math.sin(angle);
      buffer.alpha[i] = q > 0 && q < 1 ? SUMMON_LOOK.moteAlpha * Math.sin(Math.PI * q) : 0;
    } else {
      buffer.x[i] = targetX + SUMMON_LOOK.moteSway * Math.sin(TAU * (buffer.seeds[base + SEED_SWAY] + raw));
      buffer.y[i] = targetY - SUMMON_LOOK.moteLift * raw;
      buffer.alpha[i] = SUMMON_LOOK.moteAlpha * Math.sin(Math.PI * raw);
    }
    if (buffer.alpha[i] > 0) active++;
  }
  return active;
}

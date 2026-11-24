import { finiteOr, smoothstep } from './cameraPose';
import {
  BIRTH_DELAY_MAX,
  BODY_ALPHA,
  DEPART_CLIMB,
  DEPART_DISTANCE,
  FADE_IN_SECONDS,
  GATHER_RISE_SECONDS,
  HOVER_END,
  HOVER_START,
  JITTER_AMPLITUDE,
  SHED_DRIFT,
  SHED_EARLIEST,
  SHED_FRACTION,
  SHED_LATEST,
  SHED_LIFE,
  SHED_RISE,
  START_HEIGHT_RANGE,
  START_MIN_HEIGHT,
  START_RADIUS,
  SWAY,
  SWIRL_RADIUS,
  SWIRL_SPEED,
  TRAIL_LAG,
  TURN_SECONDS,
  VANISH_DISSOLVE,
  VANISH_RISE,
  VANISH_STAGGER,
  WIND,
  WIND_DRIFT,
} from './specterLook';
import { SILHOUETTE_HEIGHT, silhouetteCount, writeSilhouette } from './specterShape';
import { SPECTER_PHASES, SPECTER_TOTAL } from './specterTimings';

/**
 * The state of every specter particle as a pure function of time. Pure: no React, Three.js, DOM,
 * store or timers, and no random source. Nothing is stored between calls, so evaluating times in
 * any order, twice, or jumping straight to one (a skip) gives the same bytes.
 * Frame: offsets from the tomb origin in world axes. `heading` is the way the tomb faces; the
 * specter departs the opposite way.
 */

const TWO_PI = Math.PI * 2;

/**
 * Floats per particle in `SpecterSeeds.traits`, and the slot of each one: birth delay, swirl phase,
 * swirl radius factor, trail lag factor, shed time (seconds, negative when the particle is never
 * shed) and vanish delay.
 */
export const SPECTER_TRAITS = {
  stride: 6,
  birth: 0,
  phase: 1,
  radius: 2,
  lag: 3,
  shed: 4,
  vanish: 5,
} as const;

const TRAIT_STRIDE = SPECTER_TRAITS.stride;
const BIRTH = SPECTER_TRAITS.birth;
const PHASE = SPECTER_TRAITS.phase;
const RADIUS_FACTOR = SPECTER_TRAITS.radius;
const LAG_FACTOR = SPECTER_TRAITS.lag;
const SHED_TIME = SPECTER_TRAITS.shed;
const VANISH_DELAY = SPECTER_TRAITS.vanish;

export interface SpecterPoint {
  x: number;
  y: number;
  z: number;
}

/** Everything fixed per particle. Allocated once and never written again. */
export interface SpecterSeeds {
  readonly count: number;
  /** x, y, z of the birth point over the tomb. */
  readonly start: Float32Array;
  /** x, y, z of the silhouette point. */
  readonly target: Float32Array;
  /** `SPECTER_TRAITS.stride` floats per particle, laid out as described there. */
  readonly traits: Float32Array;
}

/** What the adapter reads. `positions` has 3 floats and `colors` 4 floats (rgba) per particle. */
export interface SpecterBuffers {
  readonly count: number;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
}

/** Deterministic hash of an integer index and a salt to [0, 1). */
function hash(index: number, salt: number): number {
  let x = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

/** Allocates the seeds once. `count` is clamped by `silhouetteCount`. */
export function createSpecterSeeds(count: number): SpecterSeeds {
  const n = silhouetteCount(count);
  const start = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);
  const traits = new Float32Array(n * TRAIT_STRIDE);
  writeSilhouette(n, target);
  for (let i = 0; i < n; i++) {
    const angle = TWO_PI * hash(i, 1);
    const radius = START_RADIUS * Math.sqrt(hash(i, 2));
    start[i * 3] = Math.cos(angle) * radius;
    start[i * 3 + 1] = START_MIN_HEIGHT + START_HEIGHT_RANGE * hash(i, 3);
    start[i * 3 + 2] = Math.sin(angle) * radius;
    const k = i * TRAIT_STRIDE;
    traits[k + BIRTH] = BIRTH_DELAY_MAX * hash(i, 4);
    traits[k + PHASE] = TWO_PI * hash(i, 5);
    traits[k + RADIUS_FACTOR] = 0.5 + 0.5 * hash(i, 6);
    traits[k + LAG_FACTOR] = hash(i, 7);
    traits[k + SHED_TIME] = hash(i, 8) < SHED_FRACTION ? SHED_EARLIEST + (SHED_LATEST - SHED_EARLIEST) * hash(i, 9) : -1;
    traits[k + VANISH_DELAY] = VANISH_STAGGER * hash(i, 10);
  }
  return { count: n, start, target, traits };
}

/** Allocates the buffers once. `count` is clamped by `silhouetteCount`. The rgb is white and never changes: the dot texture carries the colors. */
export function createSpecterBuffers(count: number): SpecterBuffers {
  const n = silhouetteCount(count);
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
  }
  return { count: n, positions: new Float32Array(n * 3), colors };
}

/**
 * Where the silhouette's body center is at `t` seconds of specter time, relative to the tomb origin.
 * It hovers over the tomb while it gathers and forms, then leaves along the tomb's heading turned
 * around, climbing, pushed by the wind and swaying. It takes no viewer position: it never chases.
 * NaN counts as 0 and `t` is clamped to [0, SPECTER_TOTAL]. Writes into `out` and returns it.
 */
export function specterCenter(t: number, heading: number, out: SpecterPoint): SpecterPoint {
  const time = t > 0 ? (t < SPECTER_TOTAL ? t : SPECTER_TOTAL) : 0;
  const facing = finiteOr(heading, 0);
  const departStart = SPECTER_PHASES.depart.start;
  if (time <= departStart) {
    out.x = 0;
    out.y = HOVER_START + (HOVER_END - HOVER_START) * smoothstep(time / departStart);
    out.z = 0;
    return out;
  }
  const p = (time - departStart) / (SPECTER_TOTAL - departStart);
  const away = DEPART_DISTANCE * Math.pow(p, 1.4);
  const drift = WIND_DRIFT * p * p;
  const sway = SWAY * p * Math.sin(TWO_PI * 1.3 * p);
  const sinH = Math.sin(facing);
  const cosH = Math.cos(facing);
  out.x = -sinH * away + WIND.x * drift + cosH * sway;
  out.y = HOVER_END + DEPART_CLIMB * p;
  out.z = -cosH * away + WIND.z * drift - sinH * sway;
  return out;
}

/** Scratch points: overwritten on every call, so no state survives between calls. */
const CENTER: SpecterPoint = { x: 0, y: 0, z: 0 };
const BODY: SpecterPoint = { x: 0, y: 0, z: 0 };

/** Position of particle `i` as part of the body at time `t` (0 < t < SPECTER_TOTAL), before shedding and dissolving. */
function writeBody(seeds: SpecterSeeds, i: number, t: number, heading: number, out: SpecterPoint): void {
  const k = i * TRAIT_STRIDE;
  const k3 = i * 3;
  const phase = seeds.traits[k + PHASE]!;
  const targetY = seeds.target[k3 + 1]!;
  const rise = smoothstep((t - seeds.traits[k + BIRTH]!) / GATHER_RISE_SECONDS);
  const loose = 1 - smoothstep((t - SPECTER_PHASES.form.start) / SPECTER_PHASES.form.duration);
  const spin = phase + t * SWIRL_SPEED;
  const swirl = SWIRL_RADIUS * seeds.traits[k + RADIUS_FACTOR]! * loose;
  const lx = seeds.target[k3]! + Math.cos(spin) * swirl + JITTER_AMPLITUDE * Math.sin(t * 9 + phase);
  const ly = targetY + 0.5 * Math.sin(spin * 1.3) * swirl + JITTER_AMPLITUDE * Math.sin(t * 7 + phase * 2);
  const lz = seeds.target[k3 + 2]! + Math.sin(spin) * swirl + JITTER_AMPLITUDE * Math.cos(t * 8 + phase * 3);
  const turned = heading + Math.PI * smoothstep((t - SPECTER_PHASES.depart.start) / TURN_SECONDS);
  const c = Math.cos(turned);
  const s = Math.sin(turned);
  const low = 1 - Math.min(1, Math.max(0, targetY / SILHOUETTE_HEIGHT));
  specterCenter(t - seeds.traits[k + LAG_FACTOR]! * TRAIL_LAG * low, heading, CENTER);
  const sx = seeds.start[k3]!;
  const sy = seeds.start[k3 + 1]!;
  const sz = seeds.start[k3 + 2]!;
  out.x = sx + (CENTER.x + lx * c + lz * s - sx) * rise;
  out.y = sy + (CENTER.y + ly - sy) * rise;
  out.z = sz + (CENTER.z - lx * s + lz * c - sz) * rise;
}

/** Parks particles `from` to the end: alpha 0 and position at the origin. The rgb is left alone. */
function park(buffers: SpecterBuffers, from: number): void {
  for (let i = from; i < buffers.count; i++) {
    buffers.positions[i * 3] = 0;
    buffers.positions[i * 3 + 1] = 0;
    buffers.positions[i * 3 + 2] = 0;
    buffers.colors[i * 4 + 3] = 0;
  }
}

/**
 * Writes every position and alpha for `specterTime` (seconds) and returns the number of particles
 * with alpha above 0. NaN counts as 0; `t <= 0` and `t >= SPECTER_TOTAL` park everything. Between
 * them each particle is born at its own delay, gathers, forms the silhouette, departs with it, and
 * is either shed as smoke (it freezes its place at its shed time and drifts with the wind while it
 * fades) or dissolves in the vanish phase. A heading that is not finite counts as 0.
 */
export function writeSpecter(seeds: SpecterSeeds, specterTime: number, heading: number, buffers: SpecterBuffers): number {
  if (!(specterTime > 0) || specterTime >= SPECTER_TOTAL) {
    park(buffers, 0);
    return 0;
  }
  const facing = finiteOr(heading, 0);
  const usable = Math.min(seeds.count, buffers.count);
  let active = 0;
  for (let i = 0; i < usable; i++) {
    const k = i * TRAIT_STRIDE;
    const shedTime = seeds.traits[k + SHED_TIME]!;
    const fadeIn = smoothstep((specterTime - seeds.traits[k + BIRTH]!) / FADE_IN_SECONDS);
    let alpha: number;
    let bodyTime = specterTime;
    let driftX = 0;
    let driftY = 0;
    let driftZ = 0;
    if (shedTime > 0 && specterTime >= shedTime) {
      const age = specterTime - shedTime;
      bodyTime = shedTime;
      alpha = age >= SHED_LIFE ? 0 : BODY_ALPHA * (1 - age / SHED_LIFE);
      driftX = WIND.x * SHED_DRIFT * age;
      driftY = SHED_RISE * age;
      driftZ = WIND.z * SHED_DRIFT * age;
    } else if (shedTime > 0) {
      alpha = BODY_ALPHA * fadeIn;
    } else {
      const dissolve = smoothstep(
        (specterTime - SPECTER_PHASES.vanish.start - seeds.traits[k + VANISH_DELAY]!) / VANISH_DISSOLVE,
      );
      alpha = BODY_ALPHA * fadeIn * (1 - dissolve);
      driftY = VANISH_RISE * dissolve;
    }
    writeBody(seeds, i, bodyTime, facing, BODY);
    buffers.positions[i * 3] = BODY.x + driftX;
    buffers.positions[i * 3 + 1] = BODY.y + driftY;
    buffers.positions[i * 3 + 2] = BODY.z + driftZ;
    const stored = Math.fround(alpha);
    buffers.colors[i * 4 + 3] = stored;
    if (stored > 0) active++;
  }
  park(buffers, usable);
  return active;
}

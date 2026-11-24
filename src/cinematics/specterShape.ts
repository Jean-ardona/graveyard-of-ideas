import { smoothstep } from './cameraPose';
import { SPECTER_MAX_PARTICLES } from './specterTimings';

/**
 * The target points of the hooded silhouette. Pure: no React, Three.js, DOM, store or timers, and
 * no random source. Point `i` depends on `i` alone (Halton sequence), so a shape of 400 points is
 * the first 400 points of a shape of 800.
 * Frame: x lateral, y up with 0 at the hem, z toward the front of the figure.
 */

/** Height in meters of the silhouette (the hood's top is a little lower than this). */
export const SILHOUETTE_HEIGHT = 2.4;

const HEM_HALF_WIDTH = 0.9;
const SHOULDER_HALF_WIDTH = 0.55;
const NECK_HALF_WIDTH = 0.14;
const SHOULDER_Y = 1.6;
const NECK_Y = 1.85;
const HOOD_CENTER_Y = 2.1;
const HOOD_RADIUS = 0.28;
const THICKNESS = 0.25;
const HEM_RAGGEDNESS = 0.12;
const HEM_FREQUENCY = 17;
const FACE_Y = 2.12;
const FACE_HALF_WIDTH = 0.12;
const FACE_HALF_HEIGHT = 0.16;

/** `n` truncated to an integer in [0, 800]. NaN and negative numbers give 0; +Infinity gives 800. */
export function silhouetteCount(n: number): number {
  const whole = Math.trunc(n);
  if (!(whole > 0)) return 0;
  return whole < SPECTER_MAX_PARTICLES ? whole : SPECTER_MAX_PARTICLES;
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

/** Half the width of the figure at height `y`: a flared cloak, shoulders, a narrow neck and a round hood. */
function halfWidth(y: number): number {
  if (y >= NECK_Y) {
    const dy = y - HOOD_CENTER_Y;
    const inside = HOOD_RADIUS * HOOD_RADIUS - dy * dy;
    return inside > 0 ? Math.sqrt(inside) : 0;
  }
  if (y >= SHOULDER_Y) {
    const s = smoothstep((y - SHOULDER_Y) / (NECK_Y - SHOULDER_Y));
    return SHOULDER_HALF_WIDTH + (NECK_HALF_WIDTH - SHOULDER_HALF_WIDTH) * s;
  }
  return HEM_HALF_WIDTH + (SHOULDER_HALF_WIDTH - HEM_HALF_WIDTH) * (y / SHOULDER_Y);
}

/**
 * Writes `3 * silhouetteCount(count)` finite floats (x, y, z per point) into `out` and returns the
 * number of points written. A shorter `out` limits the count to what fits. Bounds: |x| <= 1,
 * 0 <= y <= 2.6, |z| <= 0.3. The hem is tattered and the hood has a hollow face.
 */
export function writeSilhouette(count: number, out: Float32Array): number {
  const n = Math.min(silhouetteCount(count), Math.floor(out.length / 3));
  for (let i = 0; i < n; i++) {
    const index = i + 1;
    const height = halton(index, 2);
    const side = halton(index, 3);
    const depth = halton(index, 5);
    const rawY = height * SILHOUETTE_HEIGHT;
    const width = halfWidth(rawY);
    let x = (2 * side - 1) * width;
    const hem = HEM_RAGGEDNESS * (0.5 + 0.5 * Math.sin(x * HEM_FREQUENCY + 0.7));
    let y = hem + height * (SILHOUETTE_HEIGHT - hem);
    const z = (2 * depth - 1) * THICKNESS * (0.4 + 0.6 * Math.min(1, width / HEM_HALF_WIDTH));
    const nx = x / FACE_HALF_WIDTH;
    const ny = (y - FACE_Y) / FACE_HALF_HEIGHT;
    const inside = nx * nx + ny * ny;
    if (inside < 1) {
      const length = Math.sqrt(inside);
      x = length > 1e-9 ? (nx / length) * FACE_HALF_WIDTH : FACE_HALF_WIDTH;
      y = FACE_Y + (length > 1e-9 ? (ny / length) * FACE_HALF_HEIGHT : 0);
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return n;
}

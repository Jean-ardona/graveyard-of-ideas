import { CURL_STRENGTH, LEAF_CURL } from './bookTimings';
import { turningLeafIndex } from './pageTurn';
import type { PageTurnState } from './pageTurn';

export { CURL_STRENGTH, LEAF_CURL };

/** Typed arrays the strip is written into. The caller allocates them once. */
export type NumberBuffer = Float32Array | Float64Array;

/**
 * Direction of each segment of the bending leaf, as an absolute angle about the spine axis like
 * `leafAngle`: 0 points to the right side, pi to the left side. `progress` is the leaf fraction,
 * `leafAngle / pi`. Any input is accepted: NaN counts as 0 and the rest is clamped to [0, 1].
 * The first segment has the rigid leaf angle `pi * progress`; the tip trails it by at most
 * `tipLag`, so the bend is zero at both ends and largest in the middle of the turn.
 * `strength` scales the bend (0 rigid, 1 full tip lag); it is clamped to [0, 1] and NaN counts as 0.
 * The shape depends on `progress` alone, so a turn back retraces the same shapes in reverse.
 * Writes `segments` values into `out`; allocates nothing.
 */
export function leafCurl(progress: number, segments: number, out: Float64Array, strength = CURL_STRENGTH): void {
  const s = Number.isNaN(progress) ? 0 : Math.min(Math.max(progress, 0), 1);
  const k = Number.isNaN(strength) ? 0 : Math.min(Math.max(strength, 0), 1);
  const spine = Math.PI * s;
  const lag = LEAF_CURL.tipLag * k * Math.sin(spine);
  const last = segments - 1;
  for (let i = 0; i < segments; i++) {
    out[i] = spine - lag * (last > 0 ? i / last : 0);
  }
}

/**
 * Builds the two faces of the bending leaf in the frame of its hinge, from the segment directions
 * of `leafCurl`. Layout: face (0 front, 1 back), column 0..segments, row (0 bottom, 1 top), so a
 * vertex is `(face * (segments + 1) + column) * 2 + row`. Each segment has length `width / segments`.
 * The front face is the centerline pushed by `depth / 2` along the segment normal, the back face by
 * `-depth / 2`. The centerline starts `originX` from the hinge along the spine direction, the bottom
 * row is at `originY` and the rows are `height` apart.
 * `positions` and `normals` need `12 * (segments + 1)` values each. Allocates nothing.
 */
export function leafStrip(
  phi: ArrayLike<number>,
  segments: number,
  width: number,
  depth: number,
  positions: NumberBuffer,
  normals: NumberBuffer,
  height = 1,
  originX = 0,
  originY = 0,
): void {
  const columns = segments + 1;
  const step = width / segments;
  const half = depth / 2;
  // The gap between the hinge and the leaf follows the direction of the spine, like the rigid leaf.
  let x = originX * Math.cos(phi[0]!);
  let z = originX * Math.sin(phi[0]!);
  for (let k = 0; k < columns; k++) {
    // The normal of a column is the mean direction of the segments on both sides of it.
    const angle = k === 0 ? phi[0]! : k === segments ? phi[segments - 1]! : (phi[k - 1]! + phi[k]!) / 2;
    const nx = -Math.sin(angle);
    const nz = Math.cos(angle);
    for (let face = 0; face < 2; face++) {
      const side = face === 0 ? 1 : -1;
      for (let row = 0; row < 2; row++) {
        const v = ((face * columns + k) * 2 + row) * 3;
        positions[v] = x + side * half * nx;
        positions[v + 1] = originY + row * height;
        positions[v + 2] = z + side * half * nz;
        normals[v] = side * nx;
        normals[v + 1] = 0;
        normals[v + 2] = side * nz;
      }
    }
    if (k < segments) {
      x += step * Math.cos(phi[k]!);
      z += step * Math.sin(phi[k]!);
    }
  }
}

/**
 * The leaf to draw curved, or -1. Only the turning leaf bends, only while the cover is fully
 * open, and never with reduced motion (the leaf then follows the drag rigidly).
 */
export function curledLeafIndex(pages: PageTurnState, cover: number, reducedMotion: boolean): number {
  if (reducedMotion || cover !== 1) return -1;
  return turningLeafIndex(pages) ?? -1;
}

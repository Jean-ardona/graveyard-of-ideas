import { COVER_OPEN_ANGLE } from './bookTimings';

/**
 * Where the leaves sit along the book's thickness axis (the z axis of the upright book, which is
 * up when the book lies flat). Pure numbers, no Three.js, so the stacking can be tested alone.
 *
 * Unturned leaves stack on the right, page 1 on top. Turned leaves lie on the left above the open
 * cover's inner face, the later turned leaf higher. Every leaf has its own height, so no two share
 * a plane. A leaf is described by `f`, its turned fraction: 0 on the right, 1 on the left.
 */

export const BOOK_DEPTH = 0.07;
export const BOARD_THICKNESS = 0.012;
export const LEAF_THICKNESS = 0.004;
export const LEAF_COUNT = 3;

const INNER_DEPTH = BOOK_DEPTH - 2 * BOARD_THICKNESS;

/** Height of the front board's hinge, and of its inner face once it lies open and flat. */
export const COVER_PIVOT_Z = BOOK_DEPTH / 2 - BOARD_THICKNESS / 2;
export const COVER_OPEN_INNER_FACE_Z = BOOK_DEPTH / 2;

/** Air between the open cover and the lowest turned leaf, and between two turned leaves. */
export const TURNED_GAP = 0.001;
/** Radians by which each turned leaf lies steeper than the one before, so planes never coincide. */
export const LEAF_FAN = 0.01;

/** Hinge height of leaf `j` while it lies unturned against the front board; page 1 is the highest. */
export function restLeafZ(j: number): number {
  return INNER_DEPTH / 2 - LEAF_THICKNESS / 2 - j * LEAF_THICKNESS;
}

/** Hinge height of leaf `j` once turned: above the open cover, later leaves higher. */
export function turnedLeafZ(j: number): number {
  return COVER_OPEN_INNER_FACE_Z + TURNED_GAP + LEAF_THICKNESS / 2 + j * (LEAF_THICKNESS + TURNED_GAP);
}

/**
 * Angle about the spine of leaf `j` once turned. Smaller than the cover's, so the leaf lies at
 * least as steep as the cover and stays above its inner face along the whole page.
 */
export function turnedLeafAngle(j: number): number {
  return COVER_OPEN_ANGLE - (j + 1) * LEAF_FAN;
}

/** Turned fraction of a leaf drawn at `renderedAngle` radians (0 to pi). */
export function leafTurnFraction(renderedAngle: number): number {
  return Math.min(Math.max(renderedAngle / Math.PI, 0), 1);
}

/**
 * Share of the cover's opening that turned leaf `j` has reached. Later leaves trail the cover, so
 * leaves folding together with it stay at distinct angles while their heights swap order.
 */
export const LEAF_FOLD_LAG = 0.08;

export function leafCoverProgress(j: number, cover: number): number {
  const lag = j * LEAF_FOLD_LAG;
  return Math.min(Math.max((cover - lag) / (1 - lag), 0), 1);
}

/** Hinge heights of all leaves at rest when the first `turnedCount` leaves are turned. */
export function restLeafHeights(turnedCount: number): number[] {
  return Array.from({ length: LEAF_COUNT }, (_, j) => (j < turnedCount ? turnedLeafZ(j) : restLeafZ(j)));
}

/** Height of the underside of turned leaf `j`, `x` meters from the spine, with the book flat. */
export function turnedLeafFloorAt(j: number, x: number): number {
  const angle = turnedLeafAngle(j);
  return turnedLeafZ(j) + x * Math.sin(angle) + (LEAF_THICKNESS / 2) * Math.cos(angle);
}

/** Height of the open cover's inner face, `x` meters from the spine. */
export function coverInnerFaceAt(x: number): number {
  return COVER_PIVOT_Z + x * Math.sin(COVER_OPEN_ANGLE) - (BOARD_THICKNESS / 2) * Math.cos(COVER_OPEN_ANGLE);
}

export function leafHingeAngle(j: number, f: number): number {
  return f * turnedLeafAngle(j);
}

export function leafHingeZ(j: number, f: number): number {
  const rest = restLeafZ(j);
  return rest + (turnedLeafZ(j) - rest) * f;
}

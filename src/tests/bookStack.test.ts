import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  COVER_OPEN_INNER_FACE_Z,
  LEAF_COUNT,
  LEAF_THICKNESS,
  coverInnerFaceAt,
  leafCoverProgress,
  leafHingeAngle,
  leafHingeZ,
  restLeafHeights,
  turnedLeafFloorAt,
} from '../book/bookStack';

const EPSILON = 1e-4;
const PAGE_WIDTH = 0.3;
const TURNED_COUNTS = [0, 1, 2, 3];

describe('leaf stacking at rest', () => {
  it('lies every turned leaf above the cover inner face, by more than epsilon', () => {
    for (const turned of TURNED_COUNTS) {
      const heights = restLeafHeights(turned);
      for (let j = 0; j < turned; j++) {
        expect(heights[j]! - LEAF_THICKNESS / 2 - COVER_OPEN_INNER_FACE_Z).toBeGreaterThan(EPSILON);
      }
    }
  });

  it('orders turned leaves with later ones higher', () => {
    for (const turned of TURNED_COUNTS) {
      const heights = restLeafHeights(turned);
      for (let j = 1; j < turned; j++) expect(heights[j]!).toBeGreaterThan(heights[j - 1]! + EPSILON);
    }
  });

  it('keeps unturned leaves stacked with page 1 on top, below every turned leaf', () => {
    for (const turned of TURNED_COUNTS) {
      const heights = restLeafHeights(turned);
      for (let j = turned + 1; j < LEAF_COUNT; j++) expect(heights[j]!).toBeLessThan(heights[j - 1]! - EPSILON);
      for (let j = turned; j < LEAF_COUNT; j++) expect(heights[j]!).toBeLessThan(COVER_OPEN_INNER_FACE_Z);
    }
  });

  it('gives no two leaves the same height', () => {
    for (const turned of TURNED_COUNTS) {
      const heights = restLeafHeights(turned);
      expect(new Set(heights.map((h) => h.toFixed(6))).size).toBe(LEAF_COUNT);
    }
  });

  it('keeps turned leaves above the tilted cover along the whole page width', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: LEAF_COUNT - 1 }), fc.double({ min: 0, max: PAGE_WIDTH, noNaN: true }), (j, x) => {
        expect(turnedLeafFloorAt(j, x) - coverInnerFaceAt(x)).toBeGreaterThan(EPSILON);
        if (j > 0) expect(turnedLeafFloorAt(j, x) - turnedLeafFloorAt(j - 1, x)).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});

describe('leaf motion', () => {
  it('moves each leaf continuously between its rest and turned poses', () => {
    for (let j = 0; j < LEAF_COUNT; j++) {
      expect(leafHingeZ(j, 0)).toBe(restLeafHeights(0)[j]);
      expect(leafHingeZ(j, 1)).toBeCloseTo(restLeafHeights(LEAF_COUNT)[j]!, 12);
      expect(leafHingeAngle(j, 0)).toBe(0);
    }
  });

  it('lags later leaves behind the cover but ends every leaf with it', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (cover) => {
        for (let j = 0; j < LEAF_COUNT; j++) {
          expect(leafCoverProgress(j, cover)).toBeLessThanOrEqual(cover + 1e-12);
          if (j > 0) expect(leafCoverProgress(j, cover)).toBeLessThanOrEqual(leafCoverProgress(j - 1, cover) + 1e-12);
        }
      }),
      { numRuns: 200 },
    );
    for (let j = 0; j < LEAF_COUNT; j++) {
      expect(leafCoverProgress(j, 0)).toBe(0);
      expect(leafCoverProgress(j, 1)).toBe(1);
    }
  });
});

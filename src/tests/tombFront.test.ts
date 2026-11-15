import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FRONT_MIN_DOT, isInFrontOfTomb } from '../interaction/tombFront';

const TOMB = { x: 4, z: -3 };
const FACING = { x: 0, z: 1 };

/** Player at `degrees` from the facing direction, `distance` from the tomb. */
function playerAt(degrees: number, distance = 2) {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: TOMB.x + Math.sin(angle) * distance,
    z: TOMB.z + Math.cos(angle) * distance,
  };
}

describe('isInFrontOfTomb', () => {
  it('is true directly in front and at 60 degrees', () => {
    expect(isInFrontOfTomb(TOMB, FACING, playerAt(0))).toBe(true);
    expect(isInFrontOfTomb(TOMB, FACING, playerAt(60))).toBe(true);
  });

  it('is false at 90 degrees and directly behind', () => {
    expect(isInFrontOfTomb(TOMB, FACING, playerAt(90))).toBe(false);
    expect(isInFrontOfTomb(TOMB, FACING, playerAt(180))).toBe(false);
  });

  it('is true exactly at the threshold', () => {
    // Offset (4, 3) has length 5, so the dot with the facing is exactly 3 / 5 = 0.6.
    const edge = { x: TOMB.x + 4, z: TOMB.z + 3 };
    expect(isInFrontOfTomb(TOMB, FACING, edge, 0.6)).toBe(true);
    expect(isInFrontOfTomb(TOMB, FACING, edge, 0.61)).toBe(false);
    expect(FRONT_MIN_DOT).toBe(0.35);
  });

  it('is false, never NaN, when the player is at the tomb position', () => {
    expect(isInFrontOfTomb(TOMB, FACING, { ...TOMB })).toBe(false);
  });

  it('ignores height', () => {
    expect(isInFrontOfTomb(TOMB, FACING, { ...playerAt(0), y: 50 } as { x: number; z: number })).toBe(true);
  });

  /**
   * **Feature: graveyard-core, Property 16: Tomb front side (correction to 4.3 and 5.3.3): the player is in front exactly when the angle to the tomb's facing is below the threshold**
   * **Validates: Requirements 4.3, 5.3.3**
   */
  it('Feature: graveyard-core, Property 16: Tomb front side', () => {
    const limit = Math.acos(FRONT_MIN_DOT);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        (turn, distance, facingAngle) => {
          const facing = { x: Math.sin(facingAngle), z: Math.cos(facingAngle) };
          const angle = facingAngle + turn;
          const player = { x: TOMB.x + Math.sin(angle) * distance, z: TOMB.z + Math.cos(angle) * distance };
          // Angle between the two directions, folded to 0..PI.
          const between = Math.min(turn, 2 * Math.PI - turn);
          // Skip the numerically ambiguous band around the threshold itself.
          fc.pre(Math.abs(between - limit) > 1e-6);
          expect(isInFrontOfTomb(TOMB, facing, player)).toBe(between < limit);
        },
      ),
      { numRuns: 200 },
    );
  });
});

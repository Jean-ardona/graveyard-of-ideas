import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_LOOK_PITCH, lookAtSlot, shortestAngle } from '../cinematics/lookAtSlot';
import type { Look, Point3 } from '../cinematics/lookAtSlot';

const anyNumber = fc.oneof(
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.double(),
  fc.constantFrom(0, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e308, -1e308),
);
const pointArb: fc.Arbitrary<Point3> = fc.record({ x: anyNumber, y: anyNumber, z: anyNumber });
const lookArb: fc.Arbitrary<Look> = fc.record({ yaw: anyNumber, pitch: anyNumber });

function aim(eye: Point3, target: Point3, start: Look): Look {
  return lookAtSlot(eye, target, start, { yaw: 0, pitch: 0 });
}

describe('lookAtSlot', () => {
  it('faces -z at yaw 0 and turns left (positive yaw) toward -x', () => {
    const eye = { x: 0, y: 1.7, z: 0 };
    expect(aim(eye, { x: 0, y: 1.7, z: -5 }, { yaw: 0, pitch: 0 }).yaw).toBeCloseTo(0, 10);
    expect(aim(eye, { x: -5, y: 1.7, z: 0 }, { yaw: 0, pitch: 0 }).yaw).toBeCloseTo(Math.PI / 2, 10);
    expect(aim(eye, { x: 5, y: 1.7, z: 0 }, { yaw: 0, pitch: 0 }).yaw).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('looks down at a target below the eye and up at one above it', () => {
    const eye = { x: 0, y: 1.7, z: 0 };
    expect(aim(eye, { x: 0, y: 0.2, z: -3 }, { yaw: 0, pitch: 0 }).pitch).toBeLessThan(0);
    expect(aim(eye, { x: 0, y: 4, z: -3 }, { yaw: 0, pitch: 0 }).pitch).toBeGreaterThan(0);
  });

  it('takes the short way around: from yaw 3 to a target behind it never turns more than half a circle', () => {
    const eye = { x: 0, y: 1.7, z: 0 };
    const look = aim(eye, { x: 1, y: 1.7, z: 5 }, { yaw: 3, pitch: 0 });
    expect(Math.abs(look.yaw - 3)).toBeLessThanOrEqual(Math.PI);
  });

  it('keeps the start yaw when the target is straight above or below, and when it is the same point', () => {
    const eye = { x: 2, y: 1.7, z: 2 };
    expect(aim(eye, { x: 2, y: 9, z: 2 }, { yaw: 0.7, pitch: 0 }).yaw).toBe(0.7);
    expect(aim(eye, eye, { yaw: 0.7, pitch: 0.2 })).toEqual({ yaw: 0.7, pitch: 0.2 });
  });

  it('gives a finite look for any input, the short turn and a pitch within 75 degrees (100+ runs)', () => {
    fc.assert(
      fc.property(pointArb, pointArb, lookArb, (eye, target, start) => {
        const look = aim(eye, target, start);
        expect(Number.isFinite(look.yaw)).toBe(true);
        expect(Number.isFinite(look.pitch)).toBe(true);
        expect(Math.abs(look.pitch)).toBeLessThanOrEqual(MAX_LOOK_PITCH);
        const startYaw = Number.isFinite(start.yaw) ? start.yaw : 0;
        // Absolute tolerance grows with the magnitude of the start yaw: adding a small turn to 1e300 is exact to the ulp.
        expect(Math.abs(look.yaw - startYaw)).toBeLessThanOrEqual(Math.PI + Math.abs(startYaw) * 1e-15 + 1e-9);
      }),
      { numRuns: 300 },
    );
  });

  it('shortestAngle stays in [-PI, PI] and is finite for any input', () => {
    fc.assert(
      fc.property(anyNumber, (angle) => {
        const wrapped = shortestAngle(angle);
        expect(Number.isFinite(wrapped)).toBe(true);
        expect(Math.abs(wrapped)).toBeLessThanOrEqual(Math.PI);
      }),
      { numRuns: 200 },
    );
  });
});

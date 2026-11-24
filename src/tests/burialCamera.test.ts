/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { burialWeight, holdPose, writeBurialCamera } from '../cinematics/burialCamera';
import { createBurialTimeline, skipBurial, tickBurial } from '../cinematics/burialTimeline';
import { DOLLY_ARC_HEIGHT, DOLLY_IN, HOLD_DISTANCE, HOLD_END, RETURN, TOTAL_SECONDS } from '../cinematics/burialTimings';
import { MAX_POSE_PITCH, createCameraPose, wrapPi } from '../cinematics/cameraPose';
import type { CameraPose } from '../cinematics/cameraPose';
import { MAX_CAMERA_RATE } from '../cinematics/cameraTimings';
import type { Point3 } from '../cinematics/lookAtSlot';

const anyNumber = fc.oneof(
  fc.double(),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0, 1e300, -1e300),
);

const poseArb = (maxCoordinate: number): fc.Arbitrary<CameraPose> =>
  fc.record({
    x: fc.double({ min: -maxCoordinate, max: maxCoordinate, noNaN: true }),
    y: fc.double({ min: 0, max: 5, noNaN: true }),
    z: fc.double({ min: -maxCoordinate, max: maxCoordinate, noNaN: true }),
    yaw: fc.double({ min: -10, max: 10, noNaN: true }),
    pitch: fc.double({ min: -1.3, max: 1.3, noNaN: true }),
  });

const slabArb: fc.Arbitrary<Point3> = fc.record({
  x: fc.double({ min: -50, max: 50, noNaN: true }),
  y: fc.double({ min: 0, max: 3, noNaN: true }),
  z: fc.double({ min: -50, max: 50, noNaN: true }),
});

const headingArb = fc.double({ min: -7, max: 7, noNaN: true });
const eyeYArb = fc.double({ min: 0, max: 5, noNaN: true });

const rawPoseArb: fc.Arbitrary<CameraPose> = fc.record({
  x: anyNumber,
  y: anyNumber,
  z: anyNumber,
  yaw: anyNumber,
  pitch: anyNumber,
});

function pose(source: CameraPose): CameraPose {
  return { ...source };
}

function distance(a: CameraPose, b: CameraPose): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('burial weight', () => {
  it('is 0 at the ends, 1 over the hold and never leaves [0, 1]', () => {
    expect(burialWeight(0)).toBe(0);
    expect(burialWeight(-5)).toBe(0);
    expect(burialWeight(Number.NaN)).toBe(0);
    expect(burialWeight(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(burialWeight(Number.POSITIVE_INFINITY)).toBe(0);
    expect(burialWeight(TOTAL_SECONDS)).toBe(0);
    expect(burialWeight(DOLLY_IN)).toBe(1);
    expect(burialWeight(HOLD_END)).toBe(1);
    expect(burialWeight(DOLLY_IN / 2)).toBeCloseTo(0.5, 12);
    expect(burialWeight(HOLD_END + RETURN / 2)).toBeCloseTo(0.5, 12);
    fc.assert(
      fc.property(anyNumber, (elapsed) => {
        const w = burialWeight(elapsed);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('burial camera', () => {
  it('Feature: graveyard-core, Property 89: The burial camera pose is finite and has no jump', () => {
    // Finite for any input, non-finite fields and elapsed included.
    fc.assert(
      fc.property(anyNumber, rawPoseArb, rawPoseArb, rawPoseArb, anyNumber, anyNumber, (elapsed, player, hold, slab, heading, eyeY) => {
        const out = createCameraPose();
        writeBurialCamera(elapsed, player, hold, out);
        for (const value of Object.values(out)) expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(out.pitch)).toBeLessThanOrEqual(MAX_POSE_PITCH);
        const built = holdPose(slab, heading, eyeY, createCameraPose());
        for (const value of Object.values(built)) expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(built.pitch)).toBeLessThanOrEqual(MAX_POSE_PITCH);
        writeBurialCamera(elapsed, player, built, out);
        for (const value of Object.values(out)) expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(out.pitch)).toBeLessThanOrEqual(MAX_POSE_PITCH);
      }),
      { numRuns: 200 },
    );

    // No jump: the step bounds hold for any valid poses and any frame step.
    const slowest = Math.min(DOLLY_IN, RETURN);
    const arcRate = (4 * DOLLY_ARC_HEIGHT * 1.5) / slowest;
    fc.assert(
      fc.property(
        poseArb(60),
        slabArb,
        headingArb,
        eyeYArb,
        fc.double({ min: -1, max: TOTAL_SECONDS + 1, noNaN: true }),
        fc.double({ min: 1e-4, max: 0.1, noNaN: true }),
        (player, slab, heading, eyeY, elapsed, du) => {
          const hold = holdPose(slab, heading, eyeY, createCameraPose());
          const a = writeBurialCamera(elapsed, player, hold, createCameraPose());
          const b = writeBurialCamera(elapsed + du, player, hold, createCameraPose());
          const travel = distance(player, hold);
          // The return is shorter than the dolly, so its slope sets the bound on the linear part.
          const positionBound = ((1.5 * travel) / slowest + arcRate) * du + 1e-9;
          expect(distance(a, b)).toBeLessThanOrEqual(positionBound);
          expect(Math.abs(wrapPi(b.yaw - a.yaw))).toBeLessThanOrEqual(MAX_CAMERA_RATE * du + 1e-9);
          expect(Math.abs(b.pitch - a.pitch)).toBeLessThanOrEqual(MAX_CAMERA_RATE * du + 1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Feature: graveyard-core, Property 90: The burial camera starts and ends at the player\'s pose and holds about 3 m from the slab', () => {
    fc.assert(
      fc.property(
        poseArb(60),
        slabArb,
        headingArb,
        eyeYArb,
        fc.double({ min: DOLLY_IN, max: HOLD_END, noNaN: true }),
        fc.double({ max: 0, noNaN: true }),
        fc.double({ min: TOTAL_SECONDS, noNaN: true }),
        (player, slab, heading, eyeY, holding, before, after) => {
          const captured = pose(player);
          const hold = holdPose(slab, heading, eyeY, createCameraPose());
          const out = createCameraPose();

          // Starts and ends at the captured player pose, field by field.
          expect(writeBurialCamera(before, player, hold, out)).toEqual(captured);
          expect(writeBurialCamera(after, player, hold, out)).toEqual(captured);
          expect(writeBurialCamera(Number.NEGATIVE_INFINITY, player, hold, out)).toEqual(captured);
          expect(writeBurialCamera(Number.POSITIVE_INFINITY, player, hold, out)).toEqual(captured);
          expect(player).toEqual(captured);

          // Over the whole hold it is the hold pose, 3 m from the slab on the front side, looking at it.
          writeBurialCamera(holding, player, hold, out);
          expect(out).toEqual(hold);
          expect(Math.hypot(out.x - slab.x, out.z - slab.z)).toBeCloseTo(HOLD_DISTANCE, 6);
          const toEye = { x: out.x - slab.x, z: out.z - slab.z };
          expect(toEye.x * Math.sin(heading) + toEye.z * Math.cos(heading)).toBeGreaterThan(0);
          expect(out.y).toBe(eyeY);

          const toSlab = { x: slab.x - out.x, y: slab.y - out.y, z: slab.z - out.z };
          const length = Math.hypot(toSlab.x, toSlab.y, toSlab.z);
          const forward = {
            x: -Math.sin(out.yaw) * Math.cos(out.pitch),
            y: Math.sin(out.pitch),
            z: -Math.cos(out.yaw) * Math.cos(out.pitch),
          };
          const dot = (forward.x * toSlab.x + forward.y * toSlab.y + forward.z * toSlab.z) / length;
          const cross = Math.hypot(
            forward.y * toSlab.z - forward.z * toSlab.y,
            forward.z * toSlab.x - forward.x * toSlab.z,
            forward.x * toSlab.y - forward.y * toSlab.x,
          );
          // The slab is at most 5 m from the eye height, so the pitch clamp never applies here.
          expect(dot).toBeGreaterThan(0);
          expect(cross / length).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 90: a run to the end and a skip to the end give the same final pose', () => {
    fc.assert(
      fc.property(poseArb(60), slabArb, headingArb, eyeYArb, (player, slab, heading, eyeY) => {
        const hold = holdPose(slab, heading, eyeY, createCameraPose());
        const run = createBurialTimeline();
        for (let i = 0; i < 100; i += 1) tickBurial(run, 0.1, false);
        const skipped = createBurialTimeline();
        tickBurial(skipped, 0.1, false);
        skipBurial(skipped, 0.1);
        const ran = writeBurialCamera(run.elapsed, player, hold, createCameraPose());
        const jumped = writeBurialCamera(skipped.elapsed, player, hold, createCameraPose());
        expect(jumped).toEqual(ran);
        expect(jumped).toEqual(pose(player));
      }),
      { numRuns: 100 },
    );
  });

  it('keeps the out record and gives the hold pose for a tomb facing +z', () => {
    const out = createCameraPose();
    const hold = createCameraPose();
    const result = holdPose({ x: 2, y: 1, z: -4 }, 0, 1.7, hold);
    expect(result).toBe(hold);
    expect(hold.x).toBeCloseTo(2, 12);
    expect(hold.z).toBeCloseTo(-4 + HOLD_DISTANCE, 12);
    // The eye is in front (+z) and looks back toward -z: yaw 0, a little down.
    expect(hold.yaw).toBeCloseTo(0, 12);
    expect(hold.pitch).toBeLessThan(0);
    expect(writeBurialCamera(1, createCameraPose(), hold, out)).toBe(out);
  });
});

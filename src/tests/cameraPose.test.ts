/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_POSE_PITCH,
  blendPose,
  copyPose,
  createCameraPose,
  finiteOr,
  smoothstep,
  wrapPi,
} from '../cinematics/cameraPose';
import type { CameraPose } from '../cinematics/cameraPose';
import * as TIMINGS from '../cinematics/cameraTimings';

const SOURCES = import.meta.glob<string>(
  ['../cinematics/cameraPose.ts', '../cinematics/cameraTimings.ts', '../interaction/cameraOverride.ts'],
  { query: '?raw', import: 'default', eager: true },
);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Any double, including NaN and the infinities. */
const anyNumber = fc.double({ noNaN: false });
const finiteNumber = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
const anyPose = fc.record({ x: anyNumber, y: anyNumber, z: anyNumber, yaw: anyNumber, pitch: anyNumber });
const finitePose = fc.record({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
  yaw: finiteNumber,
  pitch: finiteNumber,
});
const FIELDS = ['x', 'y', 'z', 'yaw', 'pitch'] as const;

function sameBits(a: CameraPose, b: CameraPose): boolean {
  return FIELDS.every((field) => Object.is(a[field], b[field]));
}

describe('camera foundation is pure data and math', () => {
  it('imports no React, Three.js, DOM, store or timers and never calls Math.random', () => {
    expect(Object.keys(SOURCES)).toHaveLength(3);
    for (const [file, source] of Object.entries(SOURCES)) {
      const code = withoutComments(source);
      expect(code, file).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code, file).not.toMatch(/from\s+['"][^'"]*\/store[^'"]*['"]/);
      expect(code, file).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame)\b/);
      expect(code, file).not.toMatch(/Math\.random/);
    }
  });

  it('has the timing constants of the design', () => {
    expect(TIMINGS.FOLLOW_IN_SECONDS).toBe(2.0);
    // Retuned in 13.5 so Property 88 holds from the closest reading spot.
    expect(TIMINGS.LOOK_LAG).toBe(0.1);
    expect(TIMINGS.FRAME_DROP).toBe(0.3);
    expect(TIMINGS.FRAME_CONE).toBe(0.45);
    expect(TIMINGS.MAX_CAMERA_RATE).toBe(3.5);
    expect(TIMINGS.RETURN_SECONDS).toBe(1.6);
  });
});

describe('pose helpers', () => {
  it('creates a zero pose and copies every field', () => {
    expect(createCameraPose()).toEqual({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    const from = { x: 1, y: 2, z: 3, yaw: 0.4, pitch: -0.2 };
    const to = createCameraPose();
    expect(copyPose(from, to)).toBe(to);
    expect(to).toEqual(from);
  });

  it('finiteOr keeps finite numbers and replaces everything else', () => {
    expect(finiteOr(3, 9)).toBe(3);
    expect(finiteOr(Number.NaN, 9)).toBe(9);
    expect(finiteOr(Infinity, 9)).toBe(9);
    expect(finiteOr(-Infinity, 9)).toBe(9);
  });

  it('wrapPi returns the shortest equivalent angle and is finite for any input', () => {
    fc.assert(
      fc.property(anyNumber, (angle) => {
        const wrapped = wrapPi(angle);
        expect(Number.isFinite(wrapped)).toBe(true);
        // The range is (-PI, PI]: -PI itself is never returned.
        expect(wrapped).toBeGreaterThan(-Math.PI);
        expect(wrapped).toBeLessThanOrEqual(Math.PI);
      }),
      { numRuns: 200 },
    );
    expect(wrapPi(3 * Math.PI)).toBe(Math.PI);
    expect(wrapPi(Math.PI)).toBe(Math.PI);
    expect(wrapPi(-Math.PI)).toBe(Math.PI);
    expect(wrapPi(-3 * Math.PI)).toBe(Math.PI);
    expect(wrapPi(0.5)).toBe(0.5);
  });
});

describe('smoothstep', () => {
  it('is 0 at 0, 1 at 1 and clamped outside', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(-5)).toBe(0);
    expect(smoothstep(5)).toBe(1);
    expect(smoothstep(Infinity)).toBe(1);
    expect(smoothstep(-Infinity)).toBe(0);
    expect(smoothstep(Number.NaN)).toBe(0);
  });

  it('is monotonic, stays in [0, 1] and has a slope of at most 1.5', () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: 3, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, step) => {
        const b = a + step;
        const sa = smoothstep(a);
        const sb = smoothstep(b);
        expect(sa).toBeGreaterThanOrEqual(0);
        expect(sb).toBeLessThanOrEqual(1);
        expect(sb).toBeGreaterThanOrEqual(sa);
        expect(sb - sa).toBeLessThanOrEqual(1.5 * step + 1e-12);
      }),
      { numRuns: 200 },
    );
  });
});

describe('blendPose', () => {
  it('is finite for any input, including NaN and infinities', () => {
    fc.assert(
      fc.property(anyPose, anyPose, anyNumber, anyNumber, (from, to, w, arc) => {
        const out = createCameraPose();
        blendPose(from, to, w, arc, out);
        for (const field of FIELDS) expect(Number.isFinite(out[field]), field).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('copies `from` bit for bit at w <= 0 and `to` bit for bit at w >= 1, with no arc', () => {
    fc.assert(
      fc.property(
        finitePose,
        finitePose,
        fc.double({ max: 0 }),
        fc.double({ min: 1, noNaN: true }),
        fc.double({ min: -1e3, max: 1e3, noNaN: true }),
        (from, to, low, high, arc) => {
          const out = createCameraPose();
          expect(sameBits(blendPose(from, to, low, arc, out), from)).toBe(true);
          expect(sameBits(blendPose(from, to, high, arc, out), to)).toBe(true);
          expect(sameBits(blendPose(from, to, Number.NaN, arc, out), from)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('lifts y by arcHeight * 4 w (1 - w) and nothing else', () => {
    fc.assert(
      fc.property(
        finitePose,
        finitePose,
        fc.double({ min: 0.001, max: 0.999, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (from, to, w, arc) => {
          const flat = blendPose(from, to, w, 0, createCameraPose());
          const lifted = blendPose(from, to, w, arc, createCameraPose());
          expect(lifted.y - flat.y).toBeCloseTo(arc * 4 * w * (1 - w), 6);
          expect(lifted.x).toBe(flat.x);
          expect(lifted.z).toBe(flat.z);
          expect(lifted.yaw).toBe(flat.yaw);
          expect(lifted.pitch).toBe(flat.pitch);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('turns yaw by the shortest angle, never more than pi', () => {
    fc.assert(
      fc.property(finitePose, finitePose, fc.double({ min: 0, max: 1, noNaN: true }), (from, to, w) => {
        const out = blendPose(from, to, w, 0, createCameraPose());
        expect(Math.abs(out.yaw - from.yaw)).toBeLessThanOrEqual(Math.PI + 1e-6);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the pitch within 75 degrees while blending', () => {
    fc.assert(
      fc.property(finitePose, finitePose, fc.double({ min: 0.001, max: 0.999, noNaN: true }), (from, to, w) => {
        const out = blendPose(from, to, w, 0, createCameraPose());
        expect(Math.abs(out.pitch)).toBeLessThanOrEqual(MAX_POSE_PITCH);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps the identity of `out` and may write into `from`', () => {
    const from = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    const to = { x: 10, y: 2, z: -4, yaw: 1, pitch: 0.3 };
    const out = createCameraPose();
    expect(blendPose(from, to, 0.5, 1, out)).toBe(out);
    const into = blendPose(from, to, 0.5, 0, from);
    expect(into).toBe(from);
    expect(from.x).toBe(5);
    expect(from.yaw).toBe(0.5);
  });
});

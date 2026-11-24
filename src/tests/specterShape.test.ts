import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SILHOUETTE_HEIGHT, silhouetteCount, writeSilhouette } from '../cinematics/specterShape';
import { SPECTER_MAX_PARTICLES } from '../cinematics/specterTimings';

/** Counts of every kind: negative, NaN, infinite, fractional and above the cap. */
const countArb = fc.oneof(
  fc.integer({ min: -50, max: 2000 }),
  fc.double({ noNaN: false }),
  fc.double({ min: -5, max: 1000, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, 799.9, 800, 801),
);

function filled(): Float32Array {
  return new Float32Array(SPECTER_MAX_PARTICLES * 3).fill(Number.NaN);
}

function sameBytes(a: Float32Array, b: Float32Array): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

describe('specter silhouette', () => {
  it('Feature: graveyard-core, Property 81: The silhouette is deterministic, finite and driven by the count alone', () => {
    fc.assert(
      fc.property(countArb, fc.integer({ min: 0, max: 800 }), fc.integer({ min: 0, max: 800 }), (count, a, b) => {
        const n = silhouetteCount(count);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(SPECTER_MAX_PARTICLES);

        // Exactly three finite floats per point, and nothing written beyond them.
        const first = filled();
        expect(writeSilhouette(count, first)).toBe(n);
        for (let i = 0; i < n * 3; i++) expect(Number.isFinite(first[i]), `float ${i}`).toBe(true);
        for (let i = n * 3; i < first.length; i++) expect(Number.isNaN(first[i]), `untouched ${i}`).toBe(true);

        // Identical bytes twice.
        const second = filled();
        writeSilhouette(count, second);
        expect(sameBytes(first, second)).toBe(true);

        // Bounds.
        for (let i = 0; i < n; i++) {
          expect(Math.abs(first[i * 3]!)).toBeLessThanOrEqual(1);
          expect(first[i * 3 + 1]!).toBeGreaterThanOrEqual(0);
          expect(first[i * 3 + 1]!).toBeLessThanOrEqual(2.6);
          expect(Math.abs(first[i * 3 + 2]!)).toBeLessThanOrEqual(0.3);
        }

        // The first k points of a shape of size m equal the shape of size k.
        const k = Math.min(a, b);
        const m = Math.max(a, b);
        const big = filled();
        const small = filled();
        writeSilhouette(m, big);
        writeSilhouette(k, small);
        expect(sameBytes(big.subarray(0, k * 3), small.subarray(0, k * 3))).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it('truncates, clamps and handles the special numbers', () => {
    expect(silhouetteCount(Number.NaN)).toBe(0);
    expect(silhouetteCount(-3)).toBe(0);
    expect(silhouetteCount(-Infinity)).toBe(0);
    expect(silhouetteCount(Infinity)).toBe(800);
    expect(silhouetteCount(799.9)).toBe(799);
    expect(silhouetteCount(5000)).toBe(800);
    expect(silhouetteCount(400)).toBe(400);
  });

  it('writes only what fits in a short output array', () => {
    const out = new Float32Array(9);
    expect(writeSilhouette(800, out)).toBe(3);
  });

  it('stands about 2.4 m high, wider at the hem than at the hood, with a hollow face', () => {
    const out = new Float32Array(SPECTER_MAX_PARTICLES * 3);
    writeSilhouette(800, out);
    let top = 0;
    let hemWidth = 0;
    let hoodWidth = 0;
    for (let i = 0; i < 800; i++) {
      const x = Math.abs(out[i * 3]!);
      const y = out[i * 3 + 1]!;
      top = Math.max(top, y);
      if (y < 0.4) hemWidth = Math.max(hemWidth, x);
      if (y > 1.95) hoodWidth = Math.max(hoodWidth, x);
      const nx = x / 0.12;
      const ny = (y - 2.12) / 0.16;
      expect(nx * nx + ny * ny, `point ${i} inside the face`).toBeGreaterThanOrEqual(0.99);
    }
    expect(top).toBeGreaterThan(SILHOUETTE_HEIGHT - 0.1);
    expect(top).toBeLessThanOrEqual(SILHOUETTE_HEIGHT);
    expect(hemWidth).toBeGreaterThan(0.6);
    expect(hoodWidth).toBeLessThan(0.35);
  });
});

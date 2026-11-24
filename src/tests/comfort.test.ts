import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COMFORT_MOTION_SCALE, comfortFlags } from '../domain';

const prefsArb = fc.record({ calmMode: fc.boolean(), reducedMotion: fc.boolean() });

describe('comfortFlags', () => {
  it('keeps everything on with both settings off', () => {
    expect(comfortFlags({ calmMode: false, reducedMotion: false })).toEqual({
      flashes: true,
      shakes: true,
      fastMist: true,
      motionScale: 1,
    });
  });

  it('turns the intense effects off with either setting alone', () => {
    for (const prefs of [
      { calmMode: true, reducedMotion: false },
      { calmMode: false, reducedMotion: true },
    ]) {
      expect(comfortFlags(prefs)).toEqual({
        flashes: false,
        shakes: false,
        fastMist: false,
        motionScale: COMFORT_MOTION_SCALE,
      });
    }
  });

  it('Feature: graveyard-core, Property 54: Comfort flags only remove effects', () => {
    fc.assert(
      fc.property(prefsArb, (prefs) => {
        const flags = comfortFlags(prefs);
        const bothOff = !prefs.calmMode && !prefs.reducedMotion;
        const effects = [flags.flashes, flags.shakes, flags.fastMist];

        if (!bothOff) expect(effects).toEqual([false, false, false]);
        else expect(effects).toEqual([true, true, true]);
        expect(flags.motionScale).toBeGreaterThan(0);
        expect(flags.motionScale).toBeLessThanOrEqual(1);
        expect(flags.motionScale === 1).toBe(bothOff);

        // Turning either setting on never enables a flag or speeds motion up.
        for (const more of [{ ...prefs, calmMode: true }, { ...prefs, reducedMotion: true }]) {
          const after = comfortFlags(more);
          expect(after.flashes && !flags.flashes).toBe(false);
          expect(after.shakes && !flags.shakes).toBe(false);
          expect(after.fastMist && !flags.fastMist).toBe(false);
          expect(after.motionScale).toBeLessThanOrEqual(flags.motionScale);
        }
      }),
      { numRuns: 100 },
    );
  });
});

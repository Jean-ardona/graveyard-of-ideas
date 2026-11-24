import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { QUALITY_LEVELS } from '../domain';
import { DEFAULT_QUALITY } from '../world/quality';
import { COMFORT_MOTION_SCALE, MAX_MIST_PUFFS, MODULE_ENABLED, atmosphereBudget } from '../world/atmosphere/budget';
import type { AtmosphereBudget } from '../world/atmosphere/budget';
import { mulberry32 } from '../world/atmosphere/rng';

const KEYS: (keyof AtmosphereBudget)[] = ['leaves', 'spectres', 'skulls', 'mistPuffs'];

describe('atmosphereBudget', () => {
  it('has the agreed numbers', () => {
    expect(atmosphereBudget('low')).toEqual({ leaves: 30, spectres: 3, skulls: 8, mistPuffs: 16 });
    expect(atmosphereBudget('medium')).toEqual({ leaves: 45, spectres: 4, skulls: 12, mistPuffs: 24 });
    expect(atmosphereBudget('high')).toEqual({ leaves: 60, spectres: 5, skulls: 16, mistPuffs: 40 });
    expect(COMFORT_MOTION_SCALE).toBe(0.4);
    expect(Object.values(MODULE_ENABLED).every((value) => typeof value === 'boolean')).toBe(true);
  });

  it('keeps Low the default quality', () => {
    expect(DEFAULT_QUALITY).toBe('low');
  });

  it('Feature: graveyard-core, Property 66: The atmosphere budget fits the limits', () => {
    fc.assert(
      fc.property(fc.constantFrom(...QUALITY_LEVELS), fc.constantFrom(...QUALITY_LEVELS), (a, b) => {
        const budget = atmosphereBudget(a);
        expect(budget.leaves).toBeGreaterThanOrEqual(30);
        expect(budget.leaves).toBeLessThanOrEqual(60);
        expect(budget.spectres).toBeGreaterThanOrEqual(3);
        expect(budget.spectres).toBeLessThanOrEqual(5);
        expect(budget.skulls).toBeGreaterThanOrEqual(1);
        expect(budget.skulls).toBeLessThanOrEqual(16);
        expect(budget.mistPuffs).toBeLessThanOrEqual(MAX_MIST_PUFFS);

        // Never decreasing from a lighter level to a heavier one; Low is the smallest.
        const [lighter, heavier] = QUALITY_LEVELS.indexOf(a) <= QUALITY_LEVELS.indexOf(b) ? [a, b] : [b, a];
        for (const key of KEYS) {
          expect(atmosphereBudget(heavier)[key]).toBeGreaterThanOrEqual(atmosphereBudget(lighter)[key]);
          expect(atmosphereBudget('low')[key]).toBeLessThanOrEqual(budget[key]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('mulberry32', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AMBER_HUE_RANGE, contrastRatio, hexToRgb, hueOf, isAmberHue, relativeLuminance } from '../ui/theme/colorMath';

const hexArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((value) => `#${value.toString(16).padStart(6, '0')}`);

describe('colorMath', () => {
  it('parses hex colors and rejects other text', () => {
    expect(hexToRgb('#0b1020')).toEqual([11, 16, 32]);
    expect(() => hexToRgb('red')).toThrow(RangeError);
  });

  it('gives black 0, white 1 and the extreme contrast 21', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
  });

  it('finds the hue of primary colors and flags amber only', () => {
    expect(hueOf('#ff0000')).toBe(0);
    expect(hueOf('#00ff00')).toBe(120);
    expect(hueOf('#0000ff')).toBe(240);
    expect(hueOf('#808080')).toBe(0);
    expect(isAmberHue('#ffb347')).toBe(true);
    expect(isAmberHue('#9db8ff')).toBe(false);
    expect(AMBER_HUE_RANGE.min).toBeLessThan(AMBER_HUE_RANGE.max);
  });

  it('Feature: graveyard-core, Property 47: Contrast ratio is symmetric and bounded', () => {
    fc.assert(
      fc.property(hexArb, hexArb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBe(contrastRatio(b, a));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
        expect(contrastRatio(a, a)).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});

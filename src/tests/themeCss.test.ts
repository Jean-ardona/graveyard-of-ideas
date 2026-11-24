import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { installTheme } from '../ui/theme/installTheme';
import { parseCssVars, tokenMap, tokensToCssVars } from '../ui/theme/themeCss';

const hexArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((value) => `#${value.toString(16).padStart(6, '0')}`);

const nameArb = fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'), { minLength: 1, maxLength: 24 });

describe('themeCss', () => {
  it('Feature: graveyard-core, Property 48: Theme variables round trip', () => {
    fc.assert(
      fc.property(fc.dictionary(nameArb, hexArb), (map) => {
        expect(parseCssVars(tokensToCssVars(map))).toEqual(map);
      }),
      { numRuns: 200 },
    );
  });

  it('round trips the real token map', () => {
    const map = tokenMap();
    expect(map['color-night-900']).toBe('#0b1020');
    expect(parseCssVars(tokensToCssVars(map))).toEqual(map);
  });

  it('installs one style element, once', () => {
    installTheme(document);
    installTheme(document);
    const styles = document.head.querySelectorAll('style#haunted-theme');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('--color-mist:');
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOOK_LOOK, coverBorderPixels, createCoverBorderTexture } from '../book/bookLook';
import { TOKENS } from '../ui/theme/tokens';
import { COLORS } from '../world/config';

/** Relative luminance of a hex color (linear sRGB, Rec. 709 weights). */
function luminance(hex: string): number {
  const { r, g, b } = new THREE.Color(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LEAF_COLORS = [
  BOOK_LOOK.leafPaper,
  BOOK_LOOK.leafInk,
  BOOK_LOOK.leafMuted,
  BOOK_LOOK.fieldFill,
  BOOK_LOOK.fieldBorder,
  BOOK_LOOK.buttonFill,
  BOOK_LOOK.buttonText,
  BOOK_LOOK.buttonBorder,
];

const LOOK_COLORS = [
  COLORS.bookCover,
  COLORS.bookSpine,
  BOOK_LOOK.pageEdge,
  BOOK_LOOK.coverBorder,
  BOOK_LOOK.rim,
  ...LEAF_COLORS,
];

/** WCAG contrast ratio between two hex colors. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('bookLook colors', () => {
  it('makes the page edge at least twice as bright as the cover', () => {
    expect(luminance(BOOK_LOOK.pageEdge)).toBeGreaterThanOrEqual(2 * luminance(COLORS.bookCover));
  });

  it('never has less blue than red', () => {
    for (const hex of LOOK_COLORS) {
      const { r, b } = new THREE.Color(hex);
      expect(b, hex).toBeGreaterThanOrEqual(r);
    }
  });

  it('keeps every hue outside the amber range (20 to 50 degrees)', () => {
    for (const hex of LOOK_COLORS) {
      const { h } = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
      const degrees = h * 360;
      expect(degrees < 20 || degrees > 50, hex).toBe(true);
    }
  });

  it('keeps the leaf colors as specified', () => {
    expect(LEAF_COLORS).toEqual(Object.values(TOKENS.leaf));
  });

  it('reads at least 7:1 for ink on paper and on a field, for the muted ink and for the button text', () => {
    expect(contrast(BOOK_LOOK.leafInk, BOOK_LOOK.leafPaper)).toBeGreaterThanOrEqual(7);
    expect(contrast(BOOK_LOOK.leafInk, BOOK_LOOK.fieldFill)).toBeGreaterThanOrEqual(7);
    expect(contrast(BOOK_LOOK.buttonText, BOOK_LOOK.buttonFill)).toBeGreaterThanOrEqual(7);
    expect(contrast(BOOK_LOOK.leafMuted, BOOK_LOOK.leafPaper)).toBeGreaterThanOrEqual(7);
  });

  it('keeps the rim low', () => {
    expect(BOOK_LOOK.pageEdgeRimIntensity).toBeLessThanOrEqual(0.2);
    expect(BOOK_LOOK.coverRimIntensity).toBeLessThanOrEqual(0.2);
  });
});

describe('cover border texture', () => {
  it('is small, opaque, and draws the border over the cover color', () => {
    const size = BOOK_LOOK.borderTextureSize;
    const pixels = coverBorderPixels(size);
    expect(size).toBeLessThanOrEqual(128);
    expect(pixels).toHaveLength(size * size * 4);
    const at = (x: number, y: number) => Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4));
    expect(at(0, 0)).toEqual([0x2d, 0x3f, 0x63, 255]);
    expect(at(size / 2, BOOK_LOOK.borderInset)).toEqual([0x5f, 0x72, 0x98, 255]);
    expect(at(size / 2, size / 2)).toEqual([0x2d, 0x3f, 0x63, 255]);
  });

  it('builds an sRGB data texture', () => {
    const texture = createCoverBorderTexture();
    expect(texture.image.width).toBe(BOOK_LOOK.borderTextureSize);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    texture.dispose();
  });
});

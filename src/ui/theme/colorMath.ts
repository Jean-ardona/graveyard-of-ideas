/** Pure color math (WCAG contrast and hue). No React, Three.js or DOM. */

/** Hue range, in degrees, reserved for embers. */
export const AMBER_HUE_RANGE = { min: 20, max: 50 } as const;

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function hexToRgb(hex: string): [number, number, number] {
  const match = HEX.exec(hex);
  if (!match) throw new RangeError(`Not a #rrggbb color: ${hex}`);
  return [parseInt(match[1] as string, 16), parseInt(match[2] as string, 16), parseInt(match[3] as string, 16)];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio in [1, 21]; symmetric, and 1 for a color against itself. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.min(21, Math.max(1, ratio));
}

/** Hue in degrees [0, 360); 0 for grays. */
export function hueOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  let sector: number;
  if (max === r) sector = ((g - b) / delta + 6) % 6;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;
  return sector * 60;
}

export function isAmberHue(hex: string): boolean {
  const hue = hueOf(hex);
  return hue >= AMBER_HUE_RANGE.min && hue <= AMBER_HUE_RANGE.max;
}

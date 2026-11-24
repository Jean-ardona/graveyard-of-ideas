import type { QualityLevel } from '../domain/types';
import { hexToRgb } from '../ui/theme/colorMath';
import { TOKENS } from '../ui/theme/tokens';
import { BOOK_PARTS, EMBER_LIFE, PART_WINDOWS } from './resurrectionTimeline';
import type { ResurrectionProgress } from './resurrectionTimeline';

/**
 * What the embers look like, as numbers written into preallocated arrays. Pure: no React,
 * Three.js, DOM or timers. The specter is a separate pure module (`specterParticles`).
 */

/** Ember counts per quality; Low is the smallest and the default. */
export const RESURRECTION_BUDGET: Readonly<Record<QualityLevel, { embers: number }>> = {
  low: { embers: 40 },
  medium: { embers: 80 },
  high: { embers: 140 },
};

/** Fixed-size pseudo-random sequence in [0, 1) so the same count always gives the same look. */
function seeded(count: number, salt: number): Float32Array {
  const out = new Float32Array(count);
  let x = (salt * 2654435761) >>> 0;
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x ^ (x >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    out[i] = (x % 100000) / 100000;
  }
  return out;
}

/** The three ember colors as 0..1 channels, from the one token set reserved for embers. */
const EMBER_RGB: readonly (readonly [number, number, number])[] = [
  TOKENS.ember.core,
  TOKENS.ember.glow,
  TOKENS.ember.spark,
].map((hex) => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255] as const;
});

export interface EmberField {
  readonly count: number;
  /** World position the embers come from (the resting book). Set once at the start. */
  originX: number;
  originY: number;
  originZ: number;
  /** Per particle: x, y, z offset inside the book, and a drift angle. 4 floats each. */
  readonly seeds: Float32Array;
  /** Per particle: part index, birth fraction inside the part window, color index, rise speed. */
  readonly traits: Float32Array;
  readonly positions: Float32Array;
  /** Brightness-scaled amber. Under additive blending, a dimmer color is a fainter ember. */
  readonly colors: Float32Array;
}

export function createEmberField(count: number): EmberField {
  const a = seeded(count * 4, 1);
  const b = seeded(count * 4, 2);
  const seeds = new Float32Array(count * 4);
  const traits = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = (a[i * 4]! - 0.5) * 0.3;
    seeds[i * 4 + 1] = a[i * 4 + 1]! * 0.08;
    seeds[i * 4 + 2] = (a[i * 4 + 2]! - 0.5) * 0.4;
    seeds[i * 4 + 3] = a[i * 4 + 3]! * Math.PI * 2;
    traits[i * 4] = i % BOOK_PARTS.length;
    traits[i * 4 + 1] = b[i * 4]!;
    traits[i * 4 + 2] = Math.floor(b[i * 4 + 1]! * EMBER_RGB.length);
    traits[i * 4 + 3] = 0.6 + b[i * 4 + 2]! * 0.8;
  }
  return {
    count,
    originX: 0,
    originY: 0,
    originZ: 0,
    seeds,
    traits,
    positions: new Float32Array(count * 3),
    colors: new Float32Array(count * 3),
  };
}

const EMBER_RISE = 1.6;
const EMBER_DRIFT = 0.5;

/**
 * Writes every ember for the progress of the embers step. An ember is born inside its part's burn
 * window and lives `EMBER_LIFE` of the step; unborn and dead embers have brightness 0 (invisible).
 */
export function writeEmbers(field: EmberField, progress: ResurrectionProgress): void {
  const { seeds, traits, positions, colors } = field;
  for (let i = 0; i < field.count; i++) {
    const part = BOOK_PARTS[traits[i * 4]!]!;
    const [start, end] = PART_WINDOWS[part];
    const born = start + traits[i * 4 + 1]! * (end - start);
    const age = (progress.embers - born) / EMBER_LIFE;
    const alive = age >= 0 && age < 1;
    const a = alive ? age : 0;
    const speed = traits[i * 4 + 3]!;
    const angle = seeds[i * 4 + 3]!;
    positions[i * 3] = field.originX + seeds[i * 4]! + Math.cos(angle) * EMBER_DRIFT * a;
    positions[i * 3 + 1] = field.originY + seeds[i * 4 + 1]! + EMBER_RISE * speed * a;
    positions[i * 3 + 2] = field.originZ + seeds[i * 4 + 2]! + Math.sin(angle) * EMBER_DRIFT * a;
    const brightness = alive ? (1 - a) ** 1.5 * Math.min(1, a * 8) : 0;
    const rgb = EMBER_RGB[traits[i * 4 + 2]!]!;
    colors[i * 3] = rgb[0] * brightness;
    colors[i * 3 + 1] = rgb[1] * brightness;
    colors[i * 3 + 2] = rgb[2] * brightness;
  }
}


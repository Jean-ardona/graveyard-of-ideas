import type { QualityLevel } from '../domain/types';
import { hexToRgb } from '../ui/theme/colorMath';
import { TOKENS } from '../ui/theme/tokens';
import { BOOK_PARTS, EMBER_LIFE, PART_WINDOWS } from './resurrectionTimeline';
import type { ResurrectionProgress } from './resurrectionTimeline';

/**
 * What the resurrection looks like, as numbers written into preallocated arrays. Pure: no React,
 * Three.js, DOM or timers. The driver copies these numbers into buffers and sprites.
 */

/** Particle and puff counts per quality; Low is the smallest and the default. */
export const RESURRECTION_BUDGET: Readonly<Record<QualityLevel, { embers: number; puffs: number }>> = {
  low: { embers: 40, puffs: 6 },
  medium: { embers: 80, puffs: 10 },
  high: { embers: 140, puffs: 14 },
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

export interface SmokeField {
  readonly count: number;
  /** x, y, z (relative to the tomb) and scale of each puff. 4 floats each. */
  readonly puffs: Float32Array;
  /** Shared opacity of every puff, in [0, 1]. */
  opacity: number;
}

export function createSmokeField(count: number): SmokeField {
  return { count, puffs: new Float32Array(count * 4), opacity: 0 };
}

const SMOKE_RADIUS = 0.9;
const SMOKE_HEIGHT = 1.8;

/**
 * Black smoke that wraps the tomb: puffs spiral in and up as `smoke` grows, hold while the
 * specter forms and thin out as it rises. Opacity is 0 whenever the smoke step has not started.
 */
export function writeSmoke(field: SmokeField, progress: ResurrectionProgress): void {
  const { puffs, count } = field;
  const swirl = progress.smoke * 1.4 + progress.form * 0.8 + progress.rise * 0.6;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const angle = (i / count) * Math.PI * 2 + swirl * (i % 2 === 0 ? 1 : -1);
    const radius = SMOKE_RADIUS * (1.15 - 0.3 * progress.smoke) * (0.7 + 0.3 * ((i * 7) % 5) / 4);
    puffs[i * 4] = Math.cos(angle) * radius;
    puffs[i * 4 + 1] = 0.2 + t * SMOKE_HEIGHT * (0.4 + 0.6 * progress.smoke);
    puffs[i * 4 + 2] = Math.sin(angle) * radius;
    puffs[i * 4 + 3] = (1.1 + 0.9 * t) * (0.4 + 0.6 * progress.smoke);
  }
  field.opacity = progress.smoke * (1 - progress.rise) * 0.85;
}

export interface SpecterPose {
  /** Position relative to the tomb origin, in world axes. */
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
}

export function createSpecterPose(): SpecterPose {
  return { x: 0, y: 0, z: 0, scale: 0, opacity: 0 };
}

export const SPECTER_START_HEIGHT = 1.0;
export const SPECTER_RISE_HEIGHT = 2.2;
export const SPECTER_FLY_DISTANCE = 28;
export const SPECTER_FLY_CLIMB = 5;
const SPECTER_FADE_DRIFT = 4;
const SPECTER_SIZE = 2.2;
const SPECTER_MAX_OPACITY = 0.92;

/**
 * Where the specter is. It forms over the tomb, rises, flies away along `heading` (the direction
 * the tomb faces, turned around: away from the player who stands in front) and fades out. The path
 * depends on the progress and the heading alone, never on where the player is: it does not chase.
 * Opacity is 0 before it forms and after it has faded.
 */
export function writeSpecterPose(progress: ResurrectionProgress, heading: number, out: SpecterPose): void {
  const away = progress.fly * SPECTER_FLY_DISTANCE + progress.fade * SPECTER_FADE_DRIFT;
  out.x = -Math.sin(heading) * away;
  out.z = -Math.cos(heading) * away;
  out.y = SPECTER_START_HEIGHT + SPECTER_RISE_HEIGHT * progress.rise + SPECTER_FLY_CLIMB * progress.fly;
  out.scale = SPECTER_SIZE * (0.2 + 0.8 * progress.form);
  out.opacity = SPECTER_MAX_OPACITY * progress.form * (1 - progress.fade);
}

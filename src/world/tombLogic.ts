import { MAX_SLOTS } from '../domain/types';
import type { Project } from '../domain/types';
import { openPrompt } from '../ui/copy';
import { GRAVE_SLOTS, TOMB_HALF_DEPTH, TOMB_HALF_WIDTH } from './config';
import type { BoxCollider } from './config';

/** Pure tomb logic: no Three.js, no React. */

export type TombShape = 'rounded' | 'rectangular' | 'worn' | 'cross';

/** One shape per slot number, cycling; neighbouring slots rarely look alike. */
export const TOMB_SHAPES: readonly TombShape[] = ['rounded', 'rectangular', 'worn', 'cross'];

/** Longest title drawn on a tomb, ellipsis included. */
export const MAX_TOMB_TITLE_LENGTH = 24;

const ELLIPSIS = '…';
/** Lean (radians) of the worn tomb. */
export const WORN_LEAN = 0.06;

export interface TombDescriptor {
  id: string;
  slot: number;
  shape: TombShape;
  /** Safe-length title, ready to draw as plain canvas text. */
  title: string;
  x: number;
  z: number;
  rotation: number;
  /** Tilt around the tomb's front-to-back axis, in radians. */
  lean: number;
  /** Text of the interaction prompt (the prompt adds the "E — " key hint). */
  label: string;
}

/** Shape for a slot number. Deterministic; any integer maps to a shape. */
export function tombShapeForSlot(slot: number): TombShape {
  const count = TOMB_SHAPES.length;
  const index = ((Math.trunc(slot) % count) + count) % count;
  return TOMB_SHAPES[index] as TombShape;
}

/**
 * Cuts a title to a safe length for engraving: control characters and repeated
 * whitespace become single spaces, then anything over `max` characters ends in an ellipsis.
 * Counts code points so an emoji is never split in half.
 */
export function truncateTitle(title: string, max: number = MAX_TOMB_TITLE_LENGTH): string {
  const clean = title.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + ELLIPSIS;
}

function isValidSlot(slot: unknown): slot is number {
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < MAX_SLOTS;
}

/** Descriptor of the tomb of a resting project, or null when it has none (not resting, no valid slot). */
export function toTombDescriptor(project: Project): TombDescriptor | null {
  if (project.status !== 'resting' || !isValidSlot(project.slot)) return null;
  const place = GRAVE_SLOTS[project.slot];
  if (!place) return null;
  const shape = tombShapeForSlot(project.slot);
  const title = truncateTitle(project.title);
  return {
    id: project.id,
    slot: project.slot,
    shape,
    title,
    x: place.x,
    z: place.z,
    rotation: place.rotation,
    lean: shape === 'worn' ? WORN_LEAN : 0,
    label: openPrompt(title),
  };
}

/** Tomb descriptors for all resting projects, ordered by slot. A slot used twice keeps its first project. */
export function toTombDescriptors(projects: readonly Project[]): TombDescriptor[] {
  const bySlot = new Map<number, TombDescriptor>();
  for (const project of projects) {
    const descriptor = toTombDescriptor(project);
    if (descriptor && !bySlot.has(descriptor.slot)) bySlot.set(descriptor.slot, descriptor);
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * Adds the tombs kept alive for a running cinematic to the tombs of the resting projects, ordered by slot.
 * A held tomb whose id or slot is already drawn is skipped, so nothing is drawn twice.
 */
export function withHeldTombs(
  descriptors: readonly TombDescriptor[],
  held: readonly TombDescriptor[],
): TombDescriptor[] {
  const extra = held.filter(
    (tomb) => !descriptors.some((drawn) => drawn.id === tomb.id || drawn.slot === tomb.slot),
  );
  return [...descriptors, ...extra].sort((a, b) => a.slot - b.slot);
}

/** True when a tomb built from `a` would look and behave exactly like one built from `b`. */
export function sameTomb(a: TombDescriptor, b: TombDescriptor): boolean {
  return a.id === b.id && a.slot === b.slot && a.title === b.title;
}

/** How far the front slab slides sideways when fully open, in world units. */
export const SLAB_TRAVEL = 0.8;

/** Sideways offset of the slab for an open progress; values outside 0..1 are clamped. */
export function slabOffset(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress)) * SLAB_TRAVEL;
}

/**
 * Walking obstacle of a tomb, from its footprint. `frontReach` is how far in front of the tomb
 * center the footprint extends (the plinth that carries the book); it must not be less than
 * the tomb's own half depth.
 */
export function tombCollider(descriptor: TombDescriptor, frontReach: number = TOMB_HALF_DEPTH): BoxCollider {
  const front = Math.max(frontReach, TOMB_HALF_DEPTH);
  const halfDepth = (front + TOMB_HALF_DEPTH) / 2;
  // The box center moves toward the front by the part of the footprint that sticks out.
  const shift = front - halfDepth;
  return {
    x: descriptor.x + Math.sin(descriptor.rotation) * shift,
    z: descriptor.z + Math.cos(descriptor.rotation) * shift,
    halfWidth: TOMB_HALF_WIDTH,
    halfDepth,
    rotation: descriptor.rotation,
  };
}

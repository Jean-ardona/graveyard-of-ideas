/** Static handwriting feel of the ritual page. Pure data and arithmetic: the same input always gives the same offset. */

export interface InkJitter {
  /** Vertical shift in pixels, within 1. */
  readonly dy: number;
  /** Rotation in degrees, within 1.2. */
  readonly rotation: number;
}

export interface QuillOffset {
  /** Horizontal shift in pixels, within 3. */
  readonly x: number;
  /** Vertical shift in pixels, within 3. */
  readonly y: number;
  /** Rotation in degrees, within 2. */
  readonly rotation: number;
}

export const MAX_JITTER_DY = 1;
export const MAX_JITTER_ROTATION = 1.2;
export const MAX_QUILL_SHIFT = 3;
export const MAX_QUILL_ROTATION = 2;

const JITTER_TABLE: readonly InkJitter[] = [
  { dy: 0.4, rotation: -0.6 },
  { dy: -0.7, rotation: 0.9 },
  { dy: 0.2, rotation: 0.3 },
  { dy: -0.3, rotation: -1.1 },
  { dy: 0.9, rotation: 0.5 },
  { dy: -0.1, rotation: -0.2 },
  { dy: 0.6, rotation: 1.2 },
  { dy: -0.9, rotation: -0.8 },
  { dy: 0, rotation: 0.7 },
  { dy: 0.3, rotation: -0.4 },
  { dy: -0.5, rotation: 0.1 },
  { dy: 1, rotation: -1 },
];

const QUILL_TABLE: readonly QuillOffset[] = [
  { x: 1, y: 2, rotation: -1 },
  { x: 2, y: 0, rotation: 1 },
  { x: 0, y: 3, rotation: 2 },
  { x: 3, y: 1, rotation: -2 },
  { x: -1, y: 2, rotation: 0.5 },
  { x: -2, y: 0, rotation: -1.5 },
  { x: -3, y: -1, rotation: 1.5 },
  { x: 0, y: -2, rotation: 0 },
];

const NO_QUILL_OFFSET: QuillOffset = { x: 0, y: 0, rotation: 0 };

/** A safe table position for any number: NaN, infinities and negatives fold to a valid index. */
function slot(value: number, size: number): number {
  if (!Number.isFinite(value)) return 0;
  const whole = Math.abs(Math.trunc(value));
  return whole % size;
}

/** Small fixed offset for the character at `index`; at most 1 px up or down and 1.2 degrees. */
export function inkJitter(index: number): InkJitter {
  return JITTER_TABLE[slot(index, JITTER_TABLE.length)] ?? JITTER_TABLE[0]!;
}

/** Nudge of the quill after `keystrokeCount` keystrokes; zero when motion is reduced. */
export function quillOffset(keystrokeCount: number, reducedMotion: boolean): QuillOffset {
  if (reducedMotion) return NO_QUILL_OFFSET;
  return QUILL_TABLE[slot(keystrokeCount, QUILL_TABLE.length)] ?? NO_QUILL_OFFSET;
}

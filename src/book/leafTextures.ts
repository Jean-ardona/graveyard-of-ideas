import * as THREE from 'three';
import { BOOK_BODY_STACK, BOOK_FONT_STACK } from './bookFonts';
import { BOOK_LOOK } from './bookLook';
import type { PageProject } from './bookPageLayout';
import { PAGE_METRICS, faceKey, leafFaces, textureSize } from './leafFaces';
import type { DrawOp, FontRole, TextMeasure, TextTone } from './leafFaces';

/**
 * Canvas adapter for the page text on the leaves: draws the ops of `leafFaces` on a 2D canvas and
 * uploads it as a texture. It holds no layout logic. No React. Textures are made when a book leaves
 * `closed` and released when it returns to `closed`; nothing here runs per frame.
 */

/** Makes a canvas of the given pixel size, or null when none can be had. Replaced in tests. */
export type LeafCanvasFactory = (width: number, height: number) => HTMLCanvasElement | null;

/** Slots of the front and back faces in the material array of a box (+x, -x, +y, -y, +z, -z). */
const FRONT_SLOT = 4;
const BACK_SLOT = 5;
const SLOT_COUNT = 6;

interface LeafSlot {
  readonly mesh: THREE.Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly front: THREE.MeshStandardMaterial;
  /** The shared leaf material: the edges, the back and the blank front. */
  readonly blank: THREE.Material;
  readonly materials: THREE.Material[];
  /** Key of the ops drawn on the canvas now; null when the canvas must be drawn again. */
  drawnKey: string | null;
}

export interface LeafTextures {
  readonly slots: LeafSlot[];
  readonly width: number;
  readonly height: number;
  /** Faces drawn since creation, one per leaf drawn. For tests and measurement. */
  draws: number;
  /** The front slots show the textures (otherwise the blank paper). */
  shown: boolean;
  disposed: boolean;
  readonly measure: TextMeasure;
}

function createDomCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function fontOf(role: FontRole, sizePx: number): string {
  return `${sizePx}px ${role === 'title' ? BOOK_FONT_STACK : BOOK_BODY_STACK}`;
}

const TONES: Record<TextTone, string> = {
  ink: BOOK_LOOK.leafInk,
  muted: BOOK_LOOK.leafMuted,
  button: BOOK_LOOK.buttonText,
};

function drawText(ctx: CanvasRenderingContext2D, op: Extract<DrawOp, { kind: 'text' }>, width: number): void {
  const lineHeight = op.font === 'title' ? PAGE_METRICS.titleLineHeight : PAGE_METRICS.bodyLineHeight;
  ctx.font = fontOf(op.font, op.size * width);
  ctx.textAlign = op.align;
  ctx.fillStyle = TONES[op.tone];
  ctx.fillText(op.text, op.x * width, (op.y + (op.size * lineHeight) / 2) * width);
}

function drawBox(ctx: CanvasRenderingContext2D, op: Extract<DrawOp, { kind: 'box' }>, width: number): void {
  const line = PAGE_METRICS.fieldBorder * width;
  const button = op.role === 'button';
  ctx.fillStyle = button ? BOOK_LOOK.buttonFill : BOOK_LOOK.fieldFill;
  ctx.strokeStyle = button ? BOOK_LOOK.buttonBorder : BOOK_LOOK.fieldBorder;
  ctx.lineWidth = line;
  ctx.fillRect(op.x * width, op.y * width, op.w * width, op.h * width);
  ctx.strokeRect(op.x * width + line / 2, op.y * width + line / 2, op.w * width - line, op.h * width - line);
}

/** Paper, then the ops in order. The canvas is drawn upright; `CanvasTexture` flips it once on upload. */
function drawOps(slot: LeafSlot, ops: readonly DrawOp[]): void {
  const { context: ctx, canvas } = slot;
  ctx.fillStyle = BOOK_LOOK.leafPaper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  for (const op of ops) {
    if (op.kind === 'text') drawText(ctx, op, canvas.width);
    else drawBox(ctx, op, canvas.width);
  }
  slot.texture.needsUpdate = true;
}

function createTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 1;
  return texture;
}

function createFrontMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  // The map carries the paper color, so the color stays white. A low emissive map keeps the page readable at night.
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: BOOK_LOOK.leafTextureGlowIntensity,
  });
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function createSlot(mesh: THREE.Mesh, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): LeafSlot | null {
  const blank = mesh.material;
  if (Array.isArray(blank)) return null;
  const texture = createTexture(canvas);
  const front = createFrontMaterial(texture);
  const materials = Array.from({ length: SLOT_COUNT }, () => blank);
  materials[FRONT_SLOT] = front;
  materials[BACK_SLOT] = blank;
  return { mesh, canvas, context, texture, front, blank, materials, drawnKey: null };
}

function releaseSlot(slot: LeafSlot): void {
  slot.mesh.material = slot.blank;
  slot.texture.dispose();
  slot.front.dispose();
  releaseCanvas(slot.canvas);
}

/**
 * Makes one texture per leaf, drawn as blank paper, and gives each leaf mesh the material array
 * `[edge, edge, edge, edge, front, back]` with the textured front showing. Returns null, and
 * touches nothing, when no canvas or 2D context can be had. Call `disposeLeafTextures` to give everything back.
 */
export function createLeafTextures(
  meshes: readonly THREE.Mesh[],
  createCanvas: LeafCanvasFactory = createDomCanvas,
): LeafTextures | null {
  const { width, height } = textureSize(1, PAGE_METRICS.height);
  const slots: LeafSlot[] = [];
  const fail = (): null => {
    slots.forEach(releaseSlot);
    return null;
  };
  for (const mesh of meshes) {
    const canvas = createCanvas(width, height);
    const context = canvas === null ? null : context2d(canvas);
    if (canvas === null || context === null) {
      if (canvas !== null) releaseCanvas(canvas);
      return fail();
    }
    const slot = createSlot(mesh, canvas, context);
    if (slot === null) {
      releaseCanvas(canvas);
      return fail();
    }
    slots.push(slot);
  }
  const first = slots[0];
  if (first === undefined) return null;
  const measure: TextMeasure = (text, size, font) => {
    first.context.font = fontOf(font, size * width);
    return first.context.measureText(text).width / width;
  };
  slots.forEach((slot) => {
    drawOps(slot, []);
    slot.mesh.material = slot.materials;
  });
  return { slots, width, height, draws: 0, shown: true, disposed: false, measure };
}

/**
 * Draws every leaf whose face key differs from the one on its canvas. Returns how many it drew.
 * Does nothing without a project.
 */
export function drawDirtyLeaves(set: LeafTextures, project: PageProject | null): number {
  if (set.disposed || project === null) return 0;
  // The draw ops do not depend on the resurrection handler: the button is drawn either way.
  const faces = leafFaces(project, false, set.measure);
  let drawn = 0;
  set.slots.forEach((slot, j) => {
    const ops = faces[j]?.front;
    if (ops === undefined) return;
    const key = faceKey(ops);
    if (key === slot.drawnKey) return;
    drawOps(slot, ops);
    slot.drawnKey = key;
    drawn += 1;
  });
  set.draws += drawn;
  return drawn;
}

/** Marks every canvas as out of date (the font changed), so the next `drawDirtyLeaves` draws all of them. */
export function invalidateLeafTextures(set: LeafTextures): void {
  set.slots.forEach((slot) => {
    slot.drawnKey = null;
  });
}

/** The front slots show the textures. */
export function showLeafTextures(set: LeafTextures): void {
  set.slots.forEach((slot) => {
    slot.materials[FRONT_SLOT] = slot.front;
  });
  set.shown = true;
}

/** The front slots go back to the blank paper material. Never `visible = false`. */
export function hideLeafTextures(set: LeafTextures): void {
  set.slots.forEach((slot) => {
    slot.materials[FRONT_SLOT] = slot.blank;
  });
  set.shown = false;
}

/** Restores the shared material on the leaves and disposes textures, front materials and canvases. Safe to call twice. */
export function disposeLeafTextures(set: LeafTextures): void {
  if (set.disposed) return;
  set.disposed = true;
  set.slots.forEach(releaseSlot);
  set.slots.length = 0;
}

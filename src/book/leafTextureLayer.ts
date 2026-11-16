import type { Mesh } from 'three';
import { ensureBookFont } from './bookFonts';
import type { PageProject } from './bookPageLayout';
import type { BookPhase } from './bookSequence';
import { INITIAL_CROSSFADE, stepCrossfade } from './pageCrossfade';
import type { CrossfadeInput, CrossfadeState } from './pageCrossfade';
import type { PageTurnState, TurnStatus } from './pageTurn';
import {
  createLeafTextures,
  disposeLeafTextures,
  drawDirtyLeaves,
  hideLeafTextures,
  invalidateLeafTextures,
  showLeafTextures,
} from './leafTextures';
import type { LeafCanvasFactory, LeafTextures } from './leafTextures';

/**
 * The leaf textures of the one open book and their hand-over to the HTML overlay, following the
 * `pageCrossfade` model. A singleton like the reading machine. Everything here runs on discrete
 * events (phase or page changes, a saved edit, the font, the overlay's opacity report), never per
 * frame. Without a 2D context or when drawing throws, the layer holds nothing and the overlay
 * works alone, silently.
 */

interface Layer {
  textures: LeafTextures | null;
  crossfade: CrossfadeState;
  /** The last input of the model, reused so a step allocates nothing. */
  readonly input: CrossfadeInput;
  project: PageProject | null;
  /** Changes every time the textures are made or released, so a late font promise can tell it is stale. */
  generation: number;
}

const layer: Layer = {
  textures: null,
  crossfade: INITIAL_CROSSFADE,
  input: { phase: 'closed', status: 'idle', reducedMotion: false, opaqueReported: false },
  project: null,
  generation: 0,
};

export interface LeafTextureOptions {
  /** Replaces the DOM canvas, for tests. */
  createCanvas?: LeafCanvasFactory;
  /** Replaces the font loader, for tests. */
  loadFont?: () => Promise<void>;
}

/**
 * The turn status as the overlay sees it: a leaf moves only when a turn direction was chosen or a
 * closing gesture scrubs the cover. A drag that turns nothing leaves the page at rest.
 */
export function crossfadeStatus(
  pages: Pick<PageTurnState, 'status' | 'direction' | 'closeDrag'>,
  reducedMotion: boolean,
): TurnStatus {
  const moving = pages.direction !== null || (pages.closeDrag && !reducedMotion);
  if (!moving) return 'idle';
  return pages.status === 'idle' ? 'settling' : pages.status;
}

/** Whether a changed text may be drawn now: the texture shows and the overlay is hidden. */
function drawableNow(): boolean {
  return layer.textures !== null && layer.textures.shown && layer.crossfade.overlay === 'hidden';
}

function drawDirty(): void {
  const textures = layer.textures;
  if (textures !== null) drawDirtyLeaves(textures, layer.project);
}

/** Runs `action`; if it throws, the textures are given up and the overlay works alone. */
function guarded(action: () => void): void {
  try {
    action();
  } catch {
    closeLeafTextures();
  }
}

/**
 * Makes the textures for the book whose leaf meshes are given, when it leaves `closed`. The
 * textures show at once and are drawn from `project`. The font is loaded without waiting; once it
 * is ready the leaves are drawn again. Returns whether textures exist (false without a 2D context).
 */
export function openLeafTextures(
  meshes: readonly Mesh[],
  project: PageProject | null,
  options: LeafTextureOptions = {},
): boolean {
  closeLeafTextures();
  layer.project = project;
  try {
    layer.textures = createLeafTextures(meshes, options.createCanvas);
  } catch {
    layer.textures = null;
  }
  if (layer.textures === null) return false;
  layer.generation += 1;
  const generation = layer.generation;
  guarded(drawDirty);
  if (layer.textures === null) return false;
  const loadFont = options.loadFont ?? ensureBookFont;
  void loadFont().then(() => redrawAfterFont(generation));
  return true;
}

/** The font is ready: every canvas is out of date. Draw them now when the texture shows, otherwise at the next turn. */
function redrawAfterFont(generation: number): void {
  const textures = layer.textures;
  if (textures === null || layer.generation !== generation) return;
  invalidateLeafTextures(textures);
  if (drawableNow()) guarded(drawDirty);
}

/** Disposes the textures, canvases and front materials and puts the shared material back. Safe to call twice. */
export function closeLeafTextures(): void {
  if (layer.textures !== null) disposeLeafTextures(layer.textures);
  layer.textures = null;
  layer.crossfade = INITIAL_CROSSFADE;
  layer.generation += 1;
}

/** Applies the model's next state: the dirty leaves are drawn before the texture shows, never the other way round. */
function apply(next: CrossfadeState): void {
  const textures = layer.textures;
  if (textures === null) return;
  const previous = layer.crossfade;
  layer.crossfade = next;
  if (next.textureVisible) {
    if (next.overlay === 'hidden' && (previous.overlay !== 'hidden' || !textures.shown)) drawDirty();
    if (!textures.shown) showLeafTextures(textures);
  } else if (textures.shown) {
    hideLeafTextures(textures);
  }
}

/**
 * A phase or page change. At turn start, or when the book leaves `open`, the dirty leaves are
 * redrawn and the texture shows; the overlay hides itself in the same synchronous step. At turn
 * end the overlay fades in with the texture still showing, until it reports opacity 1.
 */
export function syncLeafTextures(phase: BookPhase, status: TurnStatus, reducedMotion: boolean): void {
  if (layer.textures === null) return;
  const { input } = layer;
  input.phase = phase;
  input.status = status;
  input.reducedMotion = reducedMotion;
  input.opaqueReported = false;
  guarded(() => apply(stepCrossfade(layer.crossfade, input)));
}

/** The overlay reached opacity 1. Only then the front slots go back to the blank paper. */
export function reportOverlayOpaque(): void {
  if (layer.textures === null || layer.crossfade.overlay !== 'fading') return;
  const { input } = layer;
  input.opaqueReported = true;
  guarded(() => apply(stepCrossfade(layer.crossfade, input)));
  input.opaqueReported = false;
}

/**
 * The saved project the book shows. A changed text is drawn at once when the texture shows with the
 * overlay hidden, and otherwise when the texture next shows. The same project does nothing.
 */
export function setLeafProject(project: PageProject | null): void {
  if (project === layer.project) return;
  layer.project = project;
  if (drawableNow()) guarded(drawDirty);
}

/** For tests and measurement: the textures in use, or null. */
export function leafTexturesInUse(): LeafTextures | null {
  return layer.textures;
}

/** For tests: the current state of the hand-over. */
export function leafCrossfadeState(): CrossfadeState {
  return layer.crossfade;
}

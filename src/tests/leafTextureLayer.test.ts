import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { createBookAssets } from '../book/bookAssets';
import type { PageProject } from '../book/bookPageLayout';
import { createBookModel } from '../book/bookModel';
import {
  closeLeafTextures,
  crossfadeStatus,
  leafCrossfadeState,
  leafTexturesInUse,
  openLeafTextures,
  reportOverlayOpaque,
  setLeafProject,
  syncLeafTextures,
} from '../book/leafTextureLayer';
import { createPageTurnState } from '../book/pageTurn';

const PROJECT: PageProject = {
  title: 'The Clockwork Orchard',
  description: 'Trees that tell the time',
  abandonReason: 'Ran out of weekends',
  nextAction: 'Sketch one tree',
  reducedVersion: 'One tree, one hour',
  buriedAt: '2023-11-20T12:00:00.000Z',
};
const EDITED: PageProject = { ...PROJECT, description: 'Trees that tell the weather' };

const assets = createBookAssets();

interface Rig {
  meshes: THREE.Mesh[];
  shared: THREE.Material;
  /** For every drawing call: whether the first leaf showed its texture at that moment. */
  shownAtDraw: boolean[];
  resolveFont: () => void;
  options: { createCanvas: () => HTMLCanvasElement; loadFont: () => Promise<void> };
}

function rig(): Rig {
  const meshes = createBookModel(assets).leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
  const shared = meshes[0]!.material as THREE.Material;
  const shownAtDraw: boolean[] = [];
  let resolveFont: () => void = () => undefined;
  const font = new Promise<void>((resolve) => {
    resolveFont = resolve;
  });
  const createCanvas = (): HTMLCanvasElement => {
    const context: { font: string; [key: string]: unknown } = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '10px serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      measureText: (text: string) => ({ width: Array.from(text).length * parseFloat(context.font) * 0.5 }),
      fillRect: () => undefined,
      strokeRect: () => undefined,
      fillText: () => {
        shownAtDraw.push((meshes[0]!.material as THREE.Material[])[4] !== shared);
      },
    };
    return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
  };
  return { meshes, shared, shownAtDraw, resolveFont, options: { createCanvas, loadFont: () => font } };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const front = (r: Rig, j = 0): THREE.Material => (r.meshes[j]!.material as THREE.Material[])[4]!;

afterEach(() => {
  closeLeafTextures();
  vi.restoreAllMocks();
});

describe('crossfadeStatus', () => {
  it('counts a drag that turns nothing as a page at rest', () => {
    const pages = createPageTurnState();
    expect(crossfadeStatus(pages, false)).toBe('idle');
    pages.status = 'dragging';
    expect(crossfadeStatus(pages, false)).toBe('idle');
    pages.direction = 'next';
    expect(crossfadeStatus(pages, false)).toBe('dragging');
    pages.status = 'settling';
    expect(crossfadeStatus(pages, false)).toBe('settling');
    pages.direction = null;
    pages.closeDrag = true;
    expect(crossfadeStatus(pages, false)).toBe('settling');
    expect(crossfadeStatus(pages, true)).toBe('idle');
  });
});

describe('leaf textures: lifetime and font', () => {
  it('creates the textures once when the book opens and disposes every one at closed', () => {
    const r = rig();
    expect(openLeafTextures(r.meshes, PROJECT, r.options)).toBe(true);
    const set = leafTexturesInUse()!;
    const disposed = vi.fn();
    set.slots.forEach((slot) => {
      slot.texture.addEventListener('dispose', disposed);
      slot.front.addEventListener('dispose', disposed);
    });
    const canvases = set.slots.map((slot) => slot.canvas);
    expect(r.meshes.every((mesh) => Array.isArray(mesh.material))).toBe(true);
    closeLeafTextures();
    expect(disposed).toHaveBeenCalledTimes(6);
    expect(canvases.every((canvas) => canvas.width === 0)).toBe(true);
    expect(leafTexturesInUse()).toBeNull();
    expect(r.meshes.every((mesh) => mesh.material === r.shared)).toBe(true);
  });

  it('redraws once when the font resolves after creation, and does nothing when it resolves after close', async () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    expect(set.draws).toBe(3);
    r.resolveFont();
    await flush();
    expect(set.draws).toBe(6);

    const late = rig();
    openLeafTextures(late.meshes, PROJECT, late.options);
    const lateSet = leafTexturesInUse()!;
    closeLeafTextures();
    late.resolveFont();
    await flush();
    expect(lateSet.draws).toBe(3);
    expect(leafTexturesInUse()).toBeNull();
  });

  it('keeps a font that arrives under the opaque overlay for the next turn', async () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    syncLeafTextures('open', 'idle', false);
    reportOverlayOpaque();
    expect(set.shown).toBe(false);
    r.resolveFont();
    await flush();
    expect(set.draws).toBe(3);
    syncLeafTextures('open', 'settling', false);
    expect(set.draws).toBe(6);
    expect(set.shown).toBe(true);
  });
});

describe('cross-fade wiring', () => {
  it('follows the model: texture first, fade with the texture, blank only after the opacity report', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    expect(front(r)).toBe(set.slots[0]!.front);

    // Turn end: the overlay fades in and the texture stays.
    syncLeafTextures('open', 'idle', false);
    expect(leafCrossfadeState()).toEqual({ textureVisible: true, overlay: 'fading' });
    expect(front(r)).toBe(set.slots[0]!.front);
    syncLeafTextures('open', 'idle', false);
    expect(front(r)).toBe(set.slots[0]!.front);

    // Opacity 1 reported: the front slot goes back to the shared blank paper, never invisible.
    reportOverlayOpaque();
    expect(leafCrossfadeState()).toEqual({ textureVisible: false, overlay: 'opaque' });
    r.meshes.forEach((mesh, j) => {
      expect(front(r, j)).toBe(r.shared);
      expect(mesh.visible).toBe(true);
    });
    reportOverlayOpaque();
    expect(front(r)).toBe(r.shared);

    // Turn start: the texture shows again and the overlay is hidden in the same step.
    syncLeafTextures('open', 'dragging', false);
    expect(leafCrossfadeState()).toEqual({ textureVisible: true, overlay: 'hidden' });
    expect(front(r)).toBe(set.slots[0]!.front);
  });

  it('keeps the texture under the opaque overlay when the report never arrives', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    syncLeafTextures('open', 'idle', false);
    for (let i = 0; i < 5; i++) syncLeafTextures('open', 'idle', false);
    expect(leafCrossfadeState().textureVisible).toBe(true);
    expect(front(r)).not.toBe(r.shared);
  });

  it('shows the texture when the phase leaves open', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    syncLeafTextures('open', 'idle', false);
    reportOverlayOpaque();
    syncLeafTextures('closing', 'idle', false);
    expect(leafCrossfadeState()).toEqual({ textureVisible: true, overlay: 'hidden' });
    expect(front(r)).not.toBe(r.shared);
  });

  it('has no fade and no blank frame with reduced motion', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    syncLeafTextures('open', 'idle', true);
    expect(leafCrossfadeState()).toEqual({ textureVisible: false, overlay: 'opaque' });
    expect(front(r)).toBe(r.shared);
    syncLeafTextures('open', 'settling', true);
    expect(front(r)).not.toBe(r.shared);
  });
});

describe('redraw of changed text', () => {
  it('draws a changed leaf only when it shows, once, and never under the idle overlay', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    syncLeafTextures('open', 'idle', false);
    // During the fade the overlay is still partly transparent: the change waits.
    setLeafProject(EDITED);
    expect(set.draws).toBe(3);
    reportOverlayOpaque();
    // Typing under the opaque overlay draws nothing, however many times the text changes.
    setLeafProject({ ...EDITED, description: 'Trees that tell the weather!' });
    setLeafProject(EDITED);
    expect(set.draws).toBe(3);
    r.shownAtDraw.length = 0;
    // Turn start: only the dirty leaf is drawn, before the texture shows.
    syncLeafTextures('open', 'dragging', false);
    expect(set.draws).toBe(4);
    expect(r.shownAtDraw.length).toBeGreaterThan(0);
    expect(r.shownAtDraw.every((shown) => !shown)).toBe(true);
    // Same project again, or an unrelated turn state: nothing is drawn.
    setLeafProject(EDITED);
    syncLeafTextures('open', 'settling', false);
    expect(set.draws).toBe(4);
    // A change while the texture shows with the overlay hidden is drawn at once.
    setLeafProject({ ...EDITED, nextAction: 'Sketch a forest' });
    expect(set.draws).toBe(5);
  });

  it('draws nothing per frame while the book is open at rest', () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    syncLeafTextures('open', 'idle', false);
    reportOverlayOpaque();
    const before = set.draws;
    for (let frame = 0; frame < 300; frame++) syncLeafTextures('open', 'idle', false);
    expect(set.draws).toBe(before);
  });

  it('draws 3 leaves on open, 3 more when the font arrives, then only the leaves that changed', async () => {
    const r = rig();
    openLeafTextures(r.meshes, PROJECT, r.options);
    const set = leafTexturesInUse()!;
    r.resolveFont();
    await flush();
    syncLeafTextures('open', 'idle', false);
    reportOverlayOpaque();
    for (let turn = 0; turn < 3; turn++) {
      syncLeafTextures('open', 'settling', false);
      syncLeafTextures('open', 'idle', false);
      reportOverlayOpaque();
    }
    expect(set.draws).toBe(6);
  });
});

describe('no 2D context', () => {
  it('leaves the shared material, makes no textures and writes nothing to the console', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const r = rig();
    const empty = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(openLeafTextures(r.meshes, PROJECT, { createCanvas: () => empty, loadFont: r.options.loadFont })).toBe(false);
    syncLeafTextures('open', 'idle', false);
    reportOverlayOpaque();
    setLeafProject(EDITED);
    syncLeafTextures('closing', 'idle', false);
    closeLeafTextures();
    expect(leafTexturesInUse()).toBeNull();
    expect(r.meshes.every((mesh) => mesh.material === r.shared)).toBe(true);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('gives the textures up silently when drawing throws', () => {
    const spies = (['log', 'warn', 'error'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const r = rig();
    const throwing = (): HTMLCanvasElement =>
      ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect: () => undefined,
          measureText: () => ({ width: 1 }),
          fillText: () => {
            throw new Error('boom');
          },
          strokeRect: () => undefined,
        }),
      }) as unknown as HTMLCanvasElement;
    expect(openLeafTextures(r.meshes, PROJECT, { createCanvas: throwing, loadFont: r.options.loadFont })).toBe(false);
    expect(leafTexturesInUse()).toBeNull();
    expect(r.meshes.every((mesh) => mesh.material === r.shared)).toBe(true);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

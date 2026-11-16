/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBookAssets } from '../book/bookAssets';
import { BOOK_BODY_STACK, BOOK_FONT_STACK } from '../book/bookFonts';
import { BOOK_LOOK } from '../book/bookLook';
import type { PageProject } from '../book/bookPageLayout';
import { createBookModel } from '../book/bookModel';
import { createLeafCurlMesh, disposeLeafCurlMesh } from '../book/leafCurlMesh';
import {
  createLeafTextures,
  disposeLeafTextures,
  drawDirtyLeaves,
  hideLeafTextures,
  invalidateLeafTextures,
  showLeafTextures,
} from '../book/leafTextures';
import type { LeafTextures } from '../book/leafTextures';
import driverSource from '../book/BookSequenceDriver.tsx?raw';
import leafTexturesSource from '../book/leafTextures.ts?raw';
import layerSource from '../book/leafTextureLayer.ts?raw';

interface Call {
  name: string;
  args: unknown[];
}

const METHODS = ['fillRect', 'strokeRect', 'fillText'] as const;

/** A canvas whose 2D context only records what is drawn. Text is half its font size wide per character. */
function fakeCanvas(calls: Call[], width: number, height: number, onCall?: (name: string) => void): HTMLCanvasElement {
  const context: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '10px serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText(text: string) {
      const size = parseFloat(String(context.font));
      return { width: Array.from(text).length * size * 0.5 };
    },
  };
  for (const name of METHODS) {
    context[name] = (...args: unknown[]) => {
      calls.push({ name, args: [...args, context.fillStyle, context.font, context.textAlign] });
      onCall?.(name);
    };
  }
  return { width, height, getContext: () => context } as unknown as HTMLCanvasElement;
}

const PROJECT: PageProject = {
  title: 'The Clockwork Orchard',
  description: 'Trees that tell the time',
  abandonReason: 'Ran out of weekends',
  nextAction: 'Sketch one tree',
  reducedVersion: 'One tree, one hour',
  buriedAt: '2023-11-20T12:00:00.000Z',
};

const assets = createBookAssets();
const sets: LeafTextures[] = [];

function leafMeshes(): THREE.Mesh[] {
  return createBookModel(assets).leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
}

function make(meshes: THREE.Mesh[], calls: Call[] = []): LeafTextures {
  const set = createLeafTextures(meshes, (width, height) => fakeCanvas(calls, width, height));
  if (set === null) throw new Error('no textures');
  sets.push(set);
  return set;
}

afterEach(() => {
  sets.splice(0).forEach(disposeLeafTextures);
  vi.restoreAllMocks();
});

describe('leaf textures', () => {
  it('makes three textures of 512 x 686 at most, without mipmaps, linear, anisotropy 1 and sRGB', () => {
    const set = make(leafMeshes());
    expect(set.slots).toHaveLength(3);
    expect(set.width).toBe(512);
    expect(set.height).toBe(686);
    for (const slot of set.slots) {
      expect(slot.canvas.width).toBeLessThanOrEqual(512);
      expect(slot.canvas.height).toBeLessThanOrEqual(686);
      expect(slot.texture.generateMipmaps).toBe(false);
      expect(slot.texture.minFilter).toBe(THREE.LinearFilter);
      expect(slot.texture.magFilter).toBe(THREE.LinearFilter);
      expect(slot.texture.anisotropy).toBe(1);
      expect(slot.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    expect(new Set(set.slots.map((slot) => slot.texture)).size).toBe(3);
  });

  it('gives each leaf the array [edge, edge, edge, edge, front, back] and swaps only the front slot', () => {
    const meshes = leafMeshes();
    const shared = meshes[0]!.material;
    const set = make(meshes);
    for (const [j, mesh] of meshes.entries()) {
      const materials = mesh.material as THREE.Material[];
      expect(materials).toHaveLength(6);
      expect(materials.slice(0, 4).every((material) => material === shared)).toBe(true);
      expect(materials[5]).toBe(shared);
      expect(materials[4]).toBe(set.slots[j]!.front);
      expect((materials[4] as THREE.MeshStandardMaterial).map).toBe(set.slots[j]!.texture);
      expect((materials[4] as THREE.MeshStandardMaterial).emissiveMap).toBe(set.slots[j]!.texture);
    }
    hideLeafTextures(set);
    expect(set.shown).toBe(false);
    for (const mesh of meshes) expect((mesh.material as THREE.Material[])[4]).toBe(shared);
    showLeafTextures(set);
    expect(set.shown).toBe(true);
    expect(set.slots.every((slot, j) => (meshes[j]!.material as THREE.Material[])[4] === slot.front)).toBe(true);
  });

  it('draws the ops upright with the shared colors and fonts, and with no transform', () => {
    const calls: Call[] = [];
    const set = make(leafMeshes(), calls);
    calls.length = 0;
    expect(drawDirtyLeaves(set, PROJECT)).toBe(3);
    const texts = calls.filter((call) => call.name === 'fillText');
    const title = texts.find((call) => call.args[0] === 'The Clockwork Orchard')!;
    // Title in the ancient stack, centered at half the width, in the ink color.
    expect(title.args[1]).toBe(0.5 * set.width);
    expect(String(title.args[4])).toContain(BOOK_FONT_STACK);
    expect(title.args[5]).toBe('center');
    expect(title.args[3]).toBe(BOOK_LOOK.leafInk);
    // Body text in the body stack; the button text in the button color.
    const label = texts.find((call) => call.args[0] === 'Why it rests')!;
    expect(String(label.args[4])).toContain(BOOK_BODY_STACK);
    expect(label.args[5]).toBe('left');
    const button = texts.find((call) => call.args[0] === 'Resurrect this project')!;
    expect(button.args[3]).toBe(BOOK_LOOK.buttonText);
    // Field boxes (fill and border), the button box and the caption are drawn too.
    expect(texts.some((call) => call.args[0] === 'Page 3 of 3')).toBe(true);
    expect(calls.filter((call) => call.name === 'strokeRect')).toHaveLength(5);
    // Upright: y grows downward with the line order, and nothing mirrors or flips the canvas.
    const ys = texts.slice(0, 3).map((call) => call.args[2] as number);
    expect(ys[0]).toBeLessThan(ys[1]!);
    expect(new Set(calls.map((call) => call.name))).toEqual(new Set(['fillRect', 'strokeRect', 'fillText']));
  });

  it('draws only the leaf whose face key changed', () => {
    const calls: Call[] = [];
    const set = make(leafMeshes(), calls);
    expect(drawDirtyLeaves(set, PROJECT)).toBe(3);
    expect(drawDirtyLeaves(set, PROJECT)).toBe(0);
    expect(drawDirtyLeaves(set, { ...PROJECT, nextAction: 'Sketch two trees' })).toBe(1);
    expect(drawDirtyLeaves(set, { ...PROJECT, nextAction: 'Sketch two trees' })).toBe(0);
    expect(set.draws).toBe(4);
    invalidateLeafTextures(set);
    expect(drawDirtyLeaves(set, { ...PROJECT, nextAction: 'Sketch two trees' })).toBe(3);
    expect(drawDirtyLeaves(set, null)).toBe(0);
  });

  it('uploads each canvas once per draw', () => {
    const set = make(leafMeshes());
    const versions = set.slots.map((slot) => slot.texture.version);
    drawDirtyLeaves(set, PROJECT);
    expect(set.slots.map((slot) => slot.texture.version)).toEqual(versions.map((v) => v + 1));
    drawDirtyLeaves(set, PROJECT);
    expect(set.slots.map((slot) => slot.texture.version)).toEqual(versions.map((v) => v + 1));
  });

  it('disposes every texture, front material and canvas and restores the shared material', () => {
    const meshes = leafMeshes();
    const shared = meshes[0]!.material;
    const set = make(meshes);
    const canvases = set.slots.map((slot) => slot.canvas);
    const disposed = vi.fn();
    set.slots.forEach((slot) => {
      slot.texture.addEventListener('dispose', disposed);
      slot.front.addEventListener('dispose', disposed);
    });
    disposeLeafTextures(set);
    expect(disposed).toHaveBeenCalledTimes(6);
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(meshes.every((mesh) => mesh.material === shared)).toBe(true);
    expect(set.slots).toHaveLength(0);
    disposeLeafTextures(set);
    expect(disposed).toHaveBeenCalledTimes(6);
  });

  it('creates nothing without a canvas or 2D context, and says nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const meshes = leafMeshes();
    const shared = meshes[0]!.material;
    const noContext = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(createLeafTextures(meshes, () => noContext)).toBeNull();
    expect(createLeafTextures(meshes, () => null)).toBeNull();
    const throwing = {
      width: 0,
      height: 0,
      getContext: () => {
        throw new Error('no');
      },
    } as unknown as HTMLCanvasElement;
    expect(createLeafTextures(meshes, () => throwing)).toBeNull();
    expect(meshes.every((mesh) => mesh.material === shared)).toBe(true);
    [error, warn, log].forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('releases the textures already made when a later canvas fails', () => {
    const meshes = leafMeshes();
    const shared = meshes[0]!.material;
    let made = 0;
    const set = createLeafTextures(meshes, () => (made++ < 2 ? fakeCanvas([], 1, 1) : null));
    expect(set).toBeNull();
    expect(meshes.every((mesh) => mesh.material === shared)).toBe(true);
  });
});

/** Texture coordinates of the vertices of one group of a geometry, with their positions. */
function groupVertices(geometry: THREE.BufferGeometry, materialIndex: number): { x: number; y: number; u: number; v: number }[] {
  const group = geometry.groups.find((candidate) => candidate.materialIndex === materialIndex)!;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const seen = new Set<number>();
  for (let i = group.start; i < group.start + group.count; i++) seen.add(index ? index.getX(i) : i);
  return [...seen].map((i) => ({ x: position.getX(i), y: position.getY(i), u: uv.getX(i), v: uv.getY(i) }));
}

/** Text is not mirrored or flipped when u grows with x and v with y (the canvas is uploaded with flipY). */
function expectUpright(vertices: { x: number; y: number; u: number; v: number }[]): void {
  for (const a of vertices) {
    for (const b of vertices) {
      if (a.x < b.x - 1e-9) expect(a.u).toBeLessThan(b.u);
      if (a.y < b.y - 1e-9) expect(a.v).toBeLessThan(b.v);
    }
  }
}

describe('text orientation on the front face', () => {
  it('is upright on the rigid leaf (material slot 4) and the texture flips once on upload', () => {
    expectUpright(groupVertices(assets.leaf, 4));
    const set = make(leafMeshes());
    expect(set.slots[0]!.texture.flipY).toBe(true);
  });

  it('is upright on the curled leaf (material slot 4) and keeps slots 4 and 5 for front and back', () => {
    const curl = createLeafCurlMesh();
    try {
      expect(curl.geometry.groups.map((group) => group.materialIndex)).toEqual([4, 5]);
      expectUpright(groupVertices(curl.geometry, 4));
    } finally {
      disposeLeafCurlMesh(curl);
    }
  });
});

describe('book look with textures', () => {
  it('keeps paper and ink at 7:1 or better and adds no light, shadow or mesh', () => {
    const linear = (hex: string): number => {
      const value = parseInt(hex.slice(1), 16);
      const channel = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
    };
    const [light, dark] = [linear(BOOK_LOOK.leafPaper), linear(BOOK_LOOK.leafInk)];
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(7);

    const model = createBookModel(assets);
    const meshes = model.leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
    const set = make(meshes);
    let meshCount = 0;
    model.root.traverse((object) => {
      expect(object).not.toBeInstanceOf(THREE.Light);
      expect(object.castShadow).toBe(false);
      if (object instanceof THREE.Mesh) meshCount += 1;
    });
    expect(meshCount).toBe(7);
    expect([model.parts.cover, model.parts.spine, model.parts.pageBlock, model.parts.pages]).toHaveLength(4);
    expect(set.slots.every((slot) => slot.front.color.getHexString() === 'ffffff')).toBe(true);
    // No amber: the blue channel of the front emissive is not below red.
    expect(set.slots.every((slot) => slot.front.emissive.b >= slot.front.emissive.r)).toBe(true);
  });
});

/** Draw calls the renderer makes for a book: one per mesh, or one per non-empty group for a material array. */
function drawCalls(root: THREE.Object3D): number {
  let calls = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh: THREE.Mesh = object;
    calls += Array.isArray(mesh.material) ? mesh.geometry.groups.filter((group) => group.count > 0).length : 1;
  });
  return calls;
}

describe('draw calls with the book open', () => {
  it('counts 12 before the textures, 27 with them and 23 while a leaf is curled', () => {
    const model = createBookModel(assets);
    const meshes = model.leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
    expect(drawCalls(model.root)).toBe(12);
    make(meshes);
    // Each leaf is a six-group box with a material array: 6 calls instead of 1, 15 more in all.
    expect(drawCalls(model.root)).toBe(27);
    const curl = createLeafCurlMesh();
    try {
      meshes[1]!.geometry = curl.geometry;
      expect(drawCalls(model.root)).toBe(23);
    } finally {
      meshes[1]!.geometry = assets.leaf;
      disposeLeafCurlMesh(curl);
    }
  });
});

describe('per-frame code', () => {
  it('has no useFrame in the texture modules, and the driver frame callback draws and allocates nothing', () => {
    expect(leafTexturesSource).not.toContain('useFrame');
    expect(layerSource).not.toContain('useFrame');
    const start = driverSource.indexOf('useFrame(');
    const callback = driverSource.slice(start, driverSource.indexOf('\n  });', start));
    for (const forbidden of ['fillText', 'createElement', 'Canvas', 'Texture', 'LeafTextures', 'drawDirty', 'openLeaf']) {
      expect(callback).not.toContain(forbidden);
    }
    expect(callback).not.toMatch(/\bnew\s/);
    expect(callback).not.toMatch(/=\s*[[{]/);
  });
});

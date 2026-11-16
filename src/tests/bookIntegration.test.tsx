import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import type { Project } from '../domain';
import BookSequenceDriver from '../book/BookSequenceDriver';
import { createBookAssets } from '../book/bookAssets';
import { registerBookHandle } from '../book/bookHandles';
import type { BookHandle } from '../book/bookHandles';
import { createBookModel } from '../book/bookModel';
import { leafCrossfadeState, leafTexturesInUse } from '../book/leafTextureLayer';
import { closeBook, endReading, getReadingProjectId, openBook, turnPage } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { canOpenBook } from '../interaction/uiMode';
import type { UiMode } from '../interaction/uiMode';
import { releasePointer, requestPointer } from '../interaction/pointerLock';
import { appStore } from '../store/appStore';

const fiber = vi.hoisted(() => ({
  frame: null as null | ((state: unknown, delta: number) => void),
  state: { camera: null as unknown, size: { width: 800, height: 600 } },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: typeof fiber.state) => unknown) => select(fiber.state),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    fiber.frame = callback;
  },
}));

vi.mock('../interaction/pointerLock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../interaction/pointerLock')>()),
  requestPointer: vi.fn(),
  releasePointer: vi.fn(),
}));

fiber.state.camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 100);

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;
const initialData = appStore.getState().data;

interface Rig {
  project: Project;
  handle: BookHandle;
  flat: THREE.BufferGeometry;
  sharedMaterial: THREE.Material | THREE.Material[];
  leafMesh: (j: number) => THREE.Mesh;
  unregister: () => void;
}

function rig(): Rig {
  const project = initialData.projects.find((p) => p.status === 'resting');
  if (!project) throw new Error('the demo data has no resting project');
  const model = createBookModel(createBookAssets());
  new THREE.Group().add(model.root);
  const handle: BookHandle = { id: project.id, root: model.root, parts: model.parts, leaves: model.leaves };
  const leafMesh = (j: number): THREE.Mesh => handle.leaves[j]!.children[0] as THREE.Mesh;
  const flat = leafMesh(0).geometry;
  return { project, handle, flat, sharedMaterial: leafMesh(0).material, leafMesh, unregister: registerBookHandle(handle) };
}

function fakeContext(): CanvasRenderingContext2D {
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
    fillText: () => undefined,
  };
  return context as unknown as CanvasRenderingContext2D;
}

function setReducedMotion(reducedMotion: boolean): void {
  appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, reducedMotion } } }));
}

/** Runs the frame callback until `done`, as the render loop would. */
function runFrames(done: () => boolean, limit = 400): void {
  for (let i = 0; i < limit && !done(); i++) fiber.frame!({}, 0.05);
  expect(done()).toBe(true);
}

function openToEnd(r: Rig): void {
  openBook(r.project.id, true);
  runFrames(() => readingMachine.phase() === 'open');
}

/** Starts a turn and draws one frame, so the leaf is mid-turn and bent. */
function startTurn(direction: 'next' | 'prev'): void {
  turnPage(direction);
  fiber.frame!({}, 0.05);
}

function turnToEnd(): void {
  turnPage('next');
  runFrames(() => readingMachine.pages.status === 'idle');
}

const disposed = {
  geometry: vi.spyOn(THREE.BufferGeometry.prototype, 'dispose'),
  texture: vi.spyOn(THREE.Texture.prototype, 'dispose'),
  material: vi.spyOn(THREE.Material.prototype, 'dispose'),
};
const setIndex = vi.spyOn(THREE.BufferGeometry.prototype, 'setIndex');

let current: Rig;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeContext as never);
  vi.mocked(requestPointer).mockClear();
  vi.mocked(releasePointer).mockClear();
  Object.values(disposed).forEach((spy) => spy.mockClear());
  current = rig();
  setIndex.mockClear();
  render(<BookSequenceDriver />);
});

afterEach(() => {
  endReading();
  readingMachine.resume();
  cleanup();
  current.unregister();
  appStore.setState({ data: initialData });
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore();
});

/** Nothing the open book made is left alive, and the shared leaf geometry and material are back. */
function expectCleanRest(r: Rig, slotCanvases: HTMLCanvasElement[]): void {
  expect(leafTexturesInUse()).toBeNull();
  expect(slotCanvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  for (let j = 0; j < r.handle.leaves.length; j++) {
    expect(r.leafMesh(j).geometry).toBe(r.flat);
    expect(r.leafMesh(j).material).toBe(r.sharedMaterial);
  }
  expect(disposed.geometry.mock.contexts).not.toContain(r.flat);
  expect(disposed.geometry).toHaveBeenCalledTimes(1);
  expect(disposed.texture).toHaveBeenCalledTimes(3);
  expect(disposed.material).toHaveBeenCalledTimes(3);
}

describe('book integration: curl and leaf text', () => {
  it('creates the curl geometry and leaf textures once on OPEN, swaps the leaf for a curled turn and restores it', () => {
    openToEnd(current);
    expect(setIndex).toHaveBeenCalledTimes(1);
    const set = leafTexturesInUse();
    expect(set).not.toBeNull();
    expect(set!.slots).toHaveLength(3);

    startTurn('next');
    const curl = current.leafMesh(0).geometry;
    expect(curl).not.toBe(current.flat);
    expect(current.leafMesh(1).geometry).toBe(current.flat);
    runFrames(() => readingMachine.pages.status === 'idle');
    expect(current.leafMesh(0).geometry).toBe(current.flat);
    expect(current.leafMesh(0).castShadow).toBe(false);

    startTurn('prev');
    expect(current.leafMesh(0).geometry).toBe(curl);
    runFrames(() => readingMachine.pages.status === 'idle');
    expect(current.leafMesh(0).geometry).toBe(current.flat);
    expect(setIndex).toHaveBeenCalledTimes(1);
    expect(leafTexturesInUse()).toBe(set);
  });

  it('leaves nothing undisposed after CLOSE', () => {
    openToEnd(current);
    turnToEnd();
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    closeBook();
    runFrames(() => readingMachine.phase() === 'closed');
    expectCleanRest(current, canvases);
  });

  it('leaves nothing undisposed after SKIP during the opening', () => {
    openBook(current.project.id, true);
    runFrames(() => readingMachine.phase() === 'approaching');
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    readingMachine.skip();
    expect(readingMachine.phase()).toBe('open');
    expect(readingMachine.progress.cover).toBe(1);
    readingMachine.close();
    readingMachine.skip();
    expect(readingMachine.phase()).toBe('closed');
    expectCleanRest(current, canvases);
  });

  it('SKIP during a curled turn finishes it without replaying and restores the flat leaf', () => {
    openToEnd(current);
    startTurn('next');
    const seen: number[] = [];
    const unsubscribe = readingMachine.subscribe(() => seen.push(readingMachine.pages.index));
    expect(current.leafMesh(0).geometry).not.toBe(current.flat);
    readingMachine.finishTurn();
    readingMachine.skip();
    unsubscribe();
    expect(readingMachine.phase()).toBe('open');
    expect(readingMachine.pages.index).toBe(1);
    expect(readingMachine.pages.status).toBe('idle');
    expect(current.leafMesh(0).geometry).toBe(current.flat);
    expect(seen.every((index) => index === 1)).toBe(true);
    // The overlay fades in over the texture; the texture waits for the opacity report.
    expect(leafCrossfadeState().overlay).toBe('fading');
    expect(leafTexturesInUse()!.shown).toBe(true);
  });

  it('removing the open project ends the reading: SKIP, CLOSE, pointer requested, nothing left alive', () => {
    openToEnd(current);
    startTurn('next');
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    expect(current.leafMesh(0).geometry).not.toBe(current.flat);
    vi.mocked(requestPointer).mockClear();

    appStore.setState((state) => ({
      data: { ...state.data, projects: state.data.projects.filter((p) => p.id !== current.project.id) },
    }));

    expect(readingMachine.phase()).toBe('closed');
    expect(readingMachine.inputLocked()).toBe(false);
    expect(readingMachine.uiMode()).toBe('exploring');
    expect(readingMachine.pages.index).toBe(0);
    expect(getReadingProjectId()).toBeNull();
    expect(requestPointer).toHaveBeenCalled();
    expectCleanRest(current, canvases);
  });

  it('a project that no longer rests also ends the reading', () => {
    openToEnd(current);
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    appStore.setState((state) => ({
      data: {
        ...state.data,
        projects: state.data.projects.map((p) => (p.id === current.project.id ? { ...p, status: 'resurrected' } : p)),
      },
    }));
    expect(readingMachine.phase()).toBe('closed');
    expectCleanRest(current, canvases);
  });

  it('removing the project during the opening also lands closed and clean', () => {
    openBook(current.project.id, true);
    runFrames(() => readingMachine.phase() === 'lifting', 1);
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    appStore.setState((state) => ({ data: { ...state.data, projects: [] } }));
    expect(readingMachine.phase()).toBe('closed');
    expectCleanRest(current, canvases);
  });

  it('a closed book owns no curl geometry and no textures', () => {
    for (let i = 0; i < 10; i++) fiber.frame!({}, 0.05);
    expect(setIndex).not.toHaveBeenCalled();
    expect(leafTexturesInUse()).toBeNull();
    expect(readingMachine.phase()).toBe('closed');
  });

  it('a fresh module state starts closed with nothing created', async () => {
    vi.resetModules();
    const machine = await import('../book/readingMachine');
    const layer = await import('../book/leafTextureLayer');
    expect(machine.readingMachine.phase()).toBe('closed');
    expect(machine.readingMachine.inputLocked()).toBe(false);
    expect(machine.readingMachine.uiMode()).toBe('exploring');
    expect(machine.readingMachine.pages.index).toBe(0);
    expect(layer.leafTexturesInUse()).toBeNull();
    expect(setIndex).not.toHaveBeenCalled();
  });
});

describe('book integration: pause', () => {
  it('freezes ticks, curl included, and restores the mode on resume', () => {
    openToEnd(current);
    startTurn('next');
    const curl = current.leafMesh(0).geometry;
    readingMachine.tick(0.05);
    readingMachine.pause();
    expect(readingMachine.uiMode()).toBe('paused');
    const { status, index } = readingMachine.pages;
    const angle = current.handle.leaves[0]!.rotation.y;
    for (let i = 0; i < 20; i++) fiber.frame!({}, 0.05);
    expect(readingMachine.pages.status).toBe(status);
    expect(readingMachine.pages.index).toBe(index);
    expect(current.handle.leaves[0]!.rotation.y).toBe(angle);
    expect(current.leafMesh(0).geometry).toBe(curl);
    readingMachine.turnPage('next');
    expect(readingMachine.pages.index).toBe(index);

    readingMachine.resume();
    expect(readingMachine.uiMode()).toBe('reading');
    runFrames(() => readingMachine.pages.status === 'idle');
    expect(current.leafMesh(0).geometry).toBe(current.flat);
  });

  it('leaves nothing undisposed when the reading ends while paused', () => {
    openToEnd(current);
    turnPage('next');
    const canvases = leafTexturesInUse()!.slots.map((slot) => slot.canvas);
    readingMachine.pause();
    appStore.setState((state) => ({ data: { ...state.data, projects: [] } }));
    expect(readingMachine.phase()).toBe('closed');
    expectCleanRest(current, canvases);
    readingMachine.resume();
    expect(readingMachine.uiMode()).toBe('exploring');
  });

  it('refuses OPEN while paused', () => {
    readingMachine.pause();
    openBook(current.project.id, true);
    expect(readingMachine.phase()).toBe('closed');
    expect(leafTexturesInUse()).toBeNull();
  });
});

describe('book integration: OPEN guard', () => {
  it.each<UiMode>(['burying', 'resurrecting', 'paused', 'openingGrave', 'reading', 'closingGrave'])(
    'is refused while the mode is %s',
    (mode) => {
      expect(canOpenBook({ ...GUARD, mode })).toBe(false);
      expect(readingMachine.open({ ...GUARD, mode })).toBe(false);
      expect(readingMachine.phase()).toBe('closed');
    },
  );
});

describe('book integration: whole flow with a mocked pointer', () => {
  it('OPEN to open, a page turn, CLOSE, back to closed with page 0 and the pointer requested', () => {
    openBook(current.project.id, true);
    expect(readingMachine.inputLocked()).toBe(true);
    runFrames(() => readingMachine.phase() === 'open');
    expect(releasePointer).toHaveBeenCalled();
    expect(readingMachine.uiMode()).toBe('reading');

    turnToEnd();
    expect(readingMachine.pages.index).toBe(1);

    vi.mocked(requestPointer).mockClear();
    closeBook();
    runFrames(() => readingMachine.phase() === 'closed');
    expect(readingMachine.pages.index).toBe(0);
    expect(readingMachine.inputLocked()).toBe(false);
    expect(readingMachine.uiMode()).toBe('exploring');
    expect(requestPointer).toHaveBeenCalledTimes(1);
  });
});

describe('book integration: reduced motion end to end', () => {
  afterEach(() => setReducedMotion(false));

  it('opens at once, turns without a curl or a fade, and leaves the overlay opaque at once', () => {
    setReducedMotion(true);
    const overlays: string[] = [];
    const curled: boolean[] = [];
    const unsubscribe = readingMachine.subscribe(() => {
      overlays.push(leafCrossfadeState().overlay);
      curled.push([0, 1, 2].some((j) => current.leafMesh(j).geometry !== current.flat));
    });
    openBook(current.project.id, true);
    expect(readingMachine.phase()).toBe('open');
    expect(leafCrossfadeState()).toEqual({ textureVisible: false, overlay: 'opaque' });

    turnPage('next');
    expect(readingMachine.pages.index).toBe(1);
    expect(readingMachine.pages.status).toBe('idle');
    expect(leafCrossfadeState()).toEqual({ textureVisible: false, overlay: 'opaque' });

    closeBook();
    unsubscribe();
    expect(readingMachine.phase()).toBe('closed');
    expect(overlays).not.toContain('fading');
    expect(curled).not.toContain(true);
    expect(current.leafMesh(0).geometry).toBe(current.flat);
    expect(leafTexturesInUse()).toBeNull();
  });
});

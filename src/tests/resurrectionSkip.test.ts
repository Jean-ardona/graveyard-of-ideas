import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import * as THREE from 'three';
import { createBookAssets } from '../book/bookAssets';
import type { BookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { createResurrectionRun } from '../cinematics/resurrectionRun';
import {
  BOOK_PARTS,
  createResurrectionEffects,
  createResurrectionProgress,
  createResurrectionState,
  finishResurrection,
} from '../cinematics/resurrectionTimeline';
import { attachResurrectionSkip, isLockLoss, isSkipResurrectionKey } from '../cinematics/resurrectionSkip';
import { exportData } from '../domain';
import { attachPointerTarget } from '../interaction/pointerLock';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { StorageLike } from '../store';
import { emptyData } from '../store/persistence';
import { toTombDescriptors } from '../world/tombLogic';
import type { TombDescriptor } from '../world/tombLogic';

const TOMB: TombDescriptor = { id: 'p1', slot: 0, shape: 'rounded', title: 'Moss', x: 4, z: -6, rotation: 0.5, lean: 0, label: 'Open Moss' };

let assets: BookAssets;
let handle: BookHandle;
let scene: THREE.Scene;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  assets = createBookAssets();
  const model = createBookModel(assets);
  handle = { id: TOMB.id, root: model.root, parts: model.parts, leaves: model.leaves };
  scene = new THREE.Scene();
  scene.add(model.root);
});

afterEach(() => {
  assets.dispose();
  vi.restoreAllMocks();
});

function start(instant = false) {
  return createResurrectionRun({ scene, tomb: TOMB, book: handle, quality: 'low', instant });
}

describe('skipping the resurrection', () => {
  it('Feature: graveyard-core, Property 78 (extended): a skip at any moment lands on the final-state function', () => {
    const state = createResurrectionState();
    const progress = createResurrectionProgress();
    const effects = createResurrectionEffects();
    finishResurrection(state, progress, effects);
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1, max: 1, noNaN: false }), { maxLength: 80 }), (dts) => {
        const run = start();
        for (const dt of dts) run.tick(dt);
        run.skip();
        expect(run.state).toEqual(state);
        expect(run.progress).toEqual(progress);
        expect(run.effects).toEqual(effects);
        expect(BOOK_PARTS.every((name) => !handle.parts[name].visible)).toBe(true);
        expect(run.assets.specter.visible).toBe(false);
        expect(run.assets.smokeMaterial.opacity).toBe(0);
        run.dispose();
        // Every later tick is still the end, and a second skip changes nothing.
        expect(run.tick(0.05)).toBe(true);
        run.skip();
      }),
      { numRuns: 100 },
    );
  });

  it('cleans up after a skip like after a natural end: scene, clones and shared materials', () => {
    const originals = BOOK_PARTS.flatMap((name) => {
      const found: THREE.Material[] = [];
      handle.parts[name].traverse((o) => {
        if (o instanceof THREE.Mesh) found.push(...[o.material as THREE.Material].flat());
      });
      return found;
    });
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const children = scene.children.length;

    const run = start();
    for (let i = 0; i < 20; i++) run.tick(0.05);
    expect(run.effects.done).toBe(false);
    run.skip();
    expect(run.effects.done).toBe(true);
    run.dispose();

    expect(scene.children).toHaveLength(children);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(3 + originals.length);
    expect(texture).toHaveBeenCalledTimes(2);
    const restored = BOOK_PARTS.flatMap((name) => {
      const found: THREE.Material[] = [];
      handle.parts[name].traverse((o) => {
        if (o instanceof THREE.Mesh) found.push(...[o.material as THREE.Material].flat());
      });
      return found;
    });
    expect(restored).toEqual(originals);
  });

  it('does nothing after dispose', () => {
    const run = start();
    run.dispose();
    run.skip();
    expect(run.effects.done).toBe(false);
  });

  it('routes Escape, Enter and Space to a skip and nothing else', () => {
    expect(['Escape', 'Enter', ' '].every(isSkipResurrectionKey)).toBe(true);
    expect(['a', 'e', 'Tab', 'ArrowLeft', 'Shift'].some(isSkipResurrectionKey)).toBe(false);
  });

  it('treats only locked to lost as a lock loss', () => {
    expect(isLockLoss('locked', 'lost')).toBe(true);
    expect(isLockLoss('released', 'lost')).toBe(false);
    expect(isLockLoss('locked', 'released')).toBe(false);
    expect(isLockLoss('idle', 'locked')).toBe(false);
  });

  it('skips once per key press outside text fields and detaches cleanly', () => {
    const onSkip = vi.fn();
    const detach = attachResurrectionSkip(onSkip);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true }));
    expect(onSkip).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    field.remove();

    detach();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('skips when a held pointer lock is lost', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const detachPointer = attachPointerTarget(canvas);
    const onSkip = vi.fn();
    const detach = attachResurrectionSkip(onSkip);
    let lockedElement: Element | null = canvas;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedElement });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(onSkip).not.toHaveBeenCalled();
    lockedElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(onSkip).toHaveBeenCalledTimes(1);
    detach();
    detachPointer();
    delete (document as unknown as Record<string, unknown>).pointerLockElement;
    canvas.remove();
  });
});

class MemoryStorage implements StorageLike {
  items = new Map<string, string>([[STORAGE_KEY, exportData({ ...emptyData(), seeded: true })]]);
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('reloading during the resurrection', () => {
  it('shows the saved final state with no tomb and no sequence', async () => {
    vi.resetModules();
    const [{ readingMachine }, session] = await Promise.all([
      import('../book/readingMachine'),
      import('../cinematics/resurrectionSession'),
    ]);
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    store.getState().commitBurial({ title: 'Moss', description: 'd' });
    store.getState().commitBurial({ title: 'Fern', description: 'd' });
    const target = store.getState().data.projects[0]!;
    readingMachine.open({ playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true });
    readingMachine.skip();
    expect(session.startResurrection(target.id, { nextAction: 'Sketch one screen' }, store)).toBe(true);
    expect(session.isResurrecting()).toBe(true);
    expect(session.getHeldTombs()).toHaveLength(1);

    // The page is reloaded mid-sequence: fresh modules, and the store is rebuilt from storage only.
    vi.resetModules();
    const reloaded = await import('../cinematics/resurrectionSession');
    const reloadedStore = createGraveyardStore(storage);
    const projects = reloadedStore.getState().data.projects;
    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p.id === target.id)).toMatchObject({ status: 'resurrected', nextAction: 'Sketch one screen' });
    expect(projects.find((p) => p.id === target.id)?.slot).toBeUndefined();
    expect(toTombDescriptors(projects).map((d) => d.id)).not.toContain(target.id);
    expect(reloaded.isResurrecting()).toBe(false);
    expect(reloaded.isResurrectionRunning()).toBe(false);
    expect(reloaded.getHeldTombs()).toHaveLength(0);
    expect(reloaded.currentUiMode()).toBe('exploring');
    expect(storage.items.get(STORAGE_KEY)).not.toMatch(/held|running/i);
  });
});

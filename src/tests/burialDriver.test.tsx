/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';

const rig = vi.hoisted(() => ({
  frame: null as ((state: unknown, delta: number) => void) | null,
  scene: null as unknown,
  camera: null as unknown,
  ticks: 0,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    rig.frame = callback;
  },
  useThree: (selector: (state: { scene: unknown; camera: unknown }) => unknown) =>
    selector({ scene: rig.scene, camera: rig.camera }),
}));

vi.mock('../cinematics/burialTimeline', async (importOriginal) => {
  const original = await importOriginal<typeof import('../cinematics/burialTimeline')>();
  return {
    ...original,
    tickBurial: (...args: Parameters<typeof original.tickBurial>) => {
      rig.ticks += 1;
      return original.tickBurial(...args);
    },
  };
});

import { createBookAssets } from '../book/bookAssets';
import { registerBookHandle } from '../book/bookHandles';
import { createBookModel } from '../book/bookModel';
import BurialDriver from '../cinematics/BurialDriver';
import { allocateSlot } from '../domain';
import { attachPointerTarget, getPointerMode } from '../interaction/pointerLock';
import { playerSession } from '../interaction/playerSession';
import { isRevealPending, resetRevealPending, revealPendingCount } from '../interaction/revealPending';
import { ritualMachine } from '../interaction/ritualMachine';
import { attachRitualSession, startRitual } from '../interaction/ritualSession';
import { appStore } from '../store/appStore';
import { COPY } from '../ui/copy';
import { EYE_HEIGHT, GRAVE_SLOTS } from '../world/config';
import { terrainHeight } from '../world/terrain';

const SOURCES = import.meta.glob<string>(['../cinematics/BurialDriver.tsx', '../cinematics/burialRun.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

let lockedElement: Element | null = null;
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedElement });
Object.defineProperty(document, 'exitPointerLock', {
  configurable: true,
  value: () => {
    lockedElement = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  },
});

interface FakePointer {
  request: ReturnType<typeof vi.fn>;
  detach: () => void;
}

/** A canvas whose pointer lock works like a browser's, or refuses every request. The player starts locked. */
function fakePointer(refuse = false): FakePointer {
  const target = document.createElement('div');
  const request = vi.fn(() => {
    if (refuse) throw new Error('refused');
    lockedElement = target;
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  Object.assign(target, { requestPointerLock: request });
  const detach = attachPointerTarget(target);
  lockedElement = target;
  document.dispatchEvent(new Event('pointerlockchange'));
  request.mockClear();
  return {
    request,
    detach: () => {
      detach();
      lockedElement = null;
    },
  };
}

let pointer: FakePointer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let detachSession: () => void;
let initialIds: Set<string>;

function frame(dt: number): void {
  rig.frame?.({}, dt);
}

function skipKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** Types a title and a description into a started ritual and seals the tomb. */
function typeAndSeal(): void {
  ritualMachine.send({ type: 'EDIT', text: 'Moon map' });
  ritualMachine.send({ type: 'NEXT' });
  ritualMachine.send({ type: 'EDIT', text: 'A map of the moon' });
  ritualMachine.send({ type: 'NEXT' });
  ritualMachine.send({ type: 'SEAL' });
}

/** Starts the ritual and seals it. Returns the committed project id. */
function commit(): string {
  expect(startRitual()).toBe(true);
  typeAndSeal();
  const id = ritualMachine.state.projectId;
  if (id === null) throw new Error('commit did not happen');
  return id;
}

function mountDriver(): ReturnType<typeof render> {
  rig.scene = scene;
  rig.camera = camera;
  return render(<BurialDriver />);
}

function resetLook(): void {
  playerSession.yaw = 0;
  playerSession.pitch = 0;
  camera.rotation.set(0, 0, 0);
}

function removeNewProjects(): void {
  for (const project of appStore.getState().data.projects) {
    if (!initialIds.has(project.id)) appStore.getState().remove(project.id);
  }
}

function runToEnd(): void {
  for (let i = 0; i < 40 && ritualMachine.phase() !== 'idle'; i += 1) frame(0.1);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  pointer = fakePointer();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  rig.ticks = 0;
  initialIds = new Set(appStore.getState().data.projects.map((project) => project.id));
  detachSession = attachRitualSession();
  resetLook();
});

afterEach(() => {
  cleanup();
  if (ritualMachine.phase() === 'writing') ritualMachine.send({ type: 'CANCEL' });
  if (ritualMachine.phase() === 'cinematic') ritualMachine.send({ type: 'DONE' });
  detachSession();
  removeNewProjects();
  appStore.getState().setCalmMode(false);
  resetRevealPending();
  pointer.detach();
  vi.restoreAllMocks();
});

/** Direction cosine between where the camera looks and the tomb of `slot`, seen from the player. */
function facingSlot(slot: number): number {
  const place = GRAVE_SLOTS[slot];
  if (place === undefined) throw new Error('no such slot');
  const eye = new THREE.Vector3(
    playerSession.x,
    terrainHeight(playerSession.x, playerSession.z) + EYE_HEIGHT,
    playerSession.z,
  );
  const toTomb = new THREE.Vector3(place.x, terrainHeight(place.x, place.z) + 0.2, place.z).sub(eye).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  return forward.dot(toTomb);
}

interface Landing {
  phase: string;
  flag: boolean;
  copies: number;
  status: string | undefined;
  slot: number | undefined;
  facing: boolean;
  sceneObjects: number;
  locked: boolean;
}

function landing(id: string, slot: number): Landing {
  const matches = appStore.getState().data.projects.filter((project) => project.id === id);
  return {
    phase: ritualMachine.phase(),
    flag: isRevealPending(id),
    copies: matches.length,
    status: matches[0]?.status,
    slot: matches[0]?.slot,
    facing: facingSlot(slot) > 0.98,
    sceneObjects: scene.children.length,
    locked: ritualMachine.inputLocked(),
  };
}

/** The one state every ending reaches: one resting project at its slot, facing it, flag cleared, input free. */
function finalLanding(slot: number): Landing {
  return { phase: 'idle', flag: false, copies: 1, status: 'resting', slot, facing: true, sceneObjects: 0, locked: false };
}

function freeSlot(): number {
  const slot = allocateSlot(appStore.getState().data.projects);
  if (slot === null) throw new Error('no free slot');
  return slot;
}

describe('burial driver', () => {
  it('runs no tick and adds nothing before COMMIT_OK', () => {
    mountDriver();
    [0, 0.016, Number.NaN, 5].forEach(frame);
    expect(rig.ticks).toBe(0);
    expect(startRitual()).toBe(true);
    [0.016, 0.1].forEach(frame);
    expect(rig.ticks).toBe(0);
    expect(scene.children).toHaveLength(0);
    typeAndSeal();
    expect(scene.children).toHaveLength(1);
    frame(0.016);
    expect(rig.ticks).toBe(1);
  });

  it('Feature: graveyard-core, Property 73: no timeline tick runs before COMMIT_OK, for any ticks, commit requests and dt', () => {
    const dtArb = fc.oneof(fc.double({ min: -1, max: 2, noNaN: true }), fc.constantFrom(0, Number.NaN, 0.016, 0.1, 9));
    const opArb = fc.oneof(
      { weight: 5, arbitrary: dtArb.map((dt) => ({ kind: 'tick' as const, dt })) },
      {
        weight: 3,
        arbitrary: fc
          .constantFrom('start', 'title', 'description', 'next', 'seal', 'cancel', 'next', 'seal')
          .map((kind) => ({ kind })),
      },
    );
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        resetLook();
        const before = appStore.getState().data.projects;
        const view = mountDriver();
        let everCommitted = false;
        for (const op of ops) {
          const running = ritualMachine.phase() === 'cinematic' && ritualMachine.state.committed;
          const ticks = rig.ticks;
          if ('dt' in op) {
            frame(op.dt);
            expect(rig.ticks - ticks).toBeLessThanOrEqual(running ? 1 : 0);
            continue;
          }
          if (op.kind === 'start') startRitual();
          else if (op.kind === 'title') ritualMachine.send({ type: 'EDIT', text: 'Moon map' });
          else if (op.kind === 'description') ritualMachine.send({ type: 'EDIT', text: 'A map of the moon' });
          else if (op.kind === 'next') ritualMachine.send({ type: 'NEXT' });
          else if (op.kind === 'seal') ritualMachine.send({ type: 'SEAL' });
          else ritualMachine.send({ type: 'CANCEL' });
          // Committing starts the run but never ticks it.
          expect(rig.ticks).toBe(ticks);
          if (ritualMachine.state.committed) everCommitted = true;
          if (!everCommitted) expect(appStore.getState().data.projects).toBe(before);
        }
        // Whatever is left ends: a page being written is cancelled, a running cinematic plays out.
        if (ritualMachine.phase() === 'writing') ritualMachine.send({ type: 'CANCEL' });
        runToEnd();
        view.unmount();
        expect(ritualMachine.phase()).toBe('idle');
        expect(revealPendingCount()).toBe(0);
        const slots = appStore
          .getState()
          .data.projects.filter((project) => project.status === 'resting')
          .map((project) => project.slot);
        expect(new Set(slots).size).toBe(slots.length);
        removeNewProjects();
        if (lockedElement === null) pointer.request();
      }),
      { numRuns: 100 },
    );
  });

  it('plays turn, appear and settle, then DONE: flag cleared, camera on the slot, walking back', () => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    expect(isRevealPending(id)).toBe(true);
    expect(ritualMachine.phase()).toBe('cinematic');
    expect(ritualMachine.inputLocked()).toBe(true);
    expect(scene.children).toHaveLength(1);
    for (let i = 0; i < 12; i += 1) frame(0.1);
    expect(isRevealPending(id)).toBe(true);
    runToEnd();
    expect(landing(id, slot)).toEqual(finalLanding(slot));
    expect(appStore.getState().data.projects.find((project) => project.id === id)?.slot).toBe(slot);
  });

  it.each([['Escape'], ['Enter'], [' ']])('skips with %j to the same final state as the natural end', (key) => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    frame(0.1);
    expect(ritualMachine.phase()).toBe('cinematic');
    skipKey(key);
    expect(landing(id, slot)).toEqual(finalLanding(slot));
  });

  it('skips when the pointer lock is lost', () => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    expect(getPointerMode()).toBe('locked');
    document.exitPointerLock();
    expect(landing(id, slot)).toEqual(finalLanding(slot));
  });

  it('ignores the key that sealed the page and skips on a later key', () => {
    mountDriver();
    expect(startRitual()).toBe(true);
    ritualMachine.send({ type: 'EDIT', text: 'Moon map' });
    ritualMachine.send({ type: 'NEXT' });
    ritualMachine.send({ type: 'EDIT', text: 'A map of the moon' });
    const seal = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') ritualMachine.send({ type: 'SEAL' });
    };
    window.addEventListener('keydown', seal);
    skipKey('Enter');
    window.removeEventListener('keydown', seal);
    expect(ritualMachine.phase()).toBe('cinematic');
    skipKey('Enter');
    expect(ritualMachine.phase()).toBe('idle');
  });

  it('Feature: graveyard-core, Property 74: any tick history and any skip end in the one final state', () => {
    const dtArb = fc.oneof(fc.double({ min: -1, max: 1, noNaN: true }), fc.constantFrom(0, Number.NaN, 0.016, 0.1, 9));
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 40 }), fc.constantFrom('Escape', 'Enter', ' ', 'lock'), (history, how) => {
        resetLook();
        const before = appStore.getState().data.projects;
        const view = mountDriver();
        const slot = freeSlot();
        const id = commit();
        const after = appStore.getState().data.projects;
        expect(after).toHaveLength(before.length + 1);
        expect(after.slice(0, before.length)).toEqual(before);
        for (const dt of history) {
          frame(dt);
          expect(appStore.getState().data.projects).toBe(after);
        }
        if (how === 'lock') document.exitPointerLock();
        else skipKey(how);
        expect(landing(id, slot)).toEqual(finalLanding(slot));
        view.unmount();
        // A reload starts with no flag and an idle ritual.
        expect(revealPendingCount()).toBe(0);
        removeNewProjects();
        if (lockedElement === null) pointer.request();
      }),
      { numRuns: 100 },
    );
  });

  it('lands on the final state in one frame with calm mode: no glow left, flag cleared', () => {
    appStore.getState().setCalmMode(true);
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    frame(0.016);
    expect(rig.ticks).toBe(1);
    expect(landing(id, slot)).toEqual(finalLanding(slot));
  });

  it('asks for the pointer again after the end, and a refusal falls to "Click to resume"', () => {
    pointer.detach();
    pointer = fakePointer(true);
    mountDriver();
    commit();
    expect(pointer.request).toHaveBeenCalledTimes(1);
    runToEnd();
    expect(pointer.request).toHaveBeenCalledTimes(2);
    expect(getPointerMode()).toBe('lost');
    expect(COPY.prompts.resume).toBe('Click to resume');
  });

  it("keeps the book hidden while the flag is set, reveals the tomb's own book and restores its materials", () => {
    const assets = createBookAssets();
    const model = createBookModel(assets);
    mountDriver();
    const id = commit();
    const materialsOf = (): THREE.Material[] => {
      const found: THREE.Material[] = [];
      model.root.traverse((object) => {
        if (object instanceof THREE.Mesh) found.push(...[object.material].flat());
      });
      return found;
    };
    const originals = materialsOf();
    model.root.visible = false;
    const unregister = registerBookHandle({ id, root: model.root, parts: model.parts, leaves: model.leaves });
    frame(0.1);
    expect(model.root.visible).toBe(false);
    for (let i = 0; i < 14; i += 1) frame(0.1);
    expect(model.root.visible).toBe(true);
    expect(isRevealPending(id)).toBe(true);
    runToEnd();
    expect(materialsOf()).toEqual(originals);
    expect(model.root.visible).toBe(true);
    expect(isRevealPending(id)).toBe(false);
    unregister();
    assets.dispose();
  });

  it.each([
    ['a full run', (): void => runToEnd()],
    ['a skip', (): void => skipKey('Escape')],
    ['an unmount', (): void => cleanup()],
  ])('disposes the glow sprite material and texture exactly once after %s', (_name, end) => {
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
    mountDriver();
    const id = commit();
    frame(0.1);
    expect(scene.children).toHaveLength(1);
    end();
    expect(scene.children).toHaveLength(0);
    expect(isRevealPending(id)).toBe(false);
    expect(ritualMachine.phase()).toBe('idle');
    cleanup();
    expect(material).toHaveBeenCalledTimes(1);
    expect(texture).toHaveBeenCalledTimes(1);
  });
});

describe('burial driver sources', () => {
  it('allocates nothing inside the frame callback or the per-frame write', () => {
    const driver = Object.entries(SOURCES).find(([file]) => file.endsWith('/BurialDriver.tsx'))?.[1] ?? '';
    const body = /useFrame\(\(_, delta\) => \{([\s\S]*?)\r?\n  \}\);/.exec(driver)?.[1] ?? '';
    expect(body).not.toBe('');
    expect(body).not.toMatch(/\bnew\b|\[|\{|\.map\(|\.filter\(|\.slice\(|\.clone\(|createElement|fillText/);
    const run = Object.entries(SOURCES).find(([file]) => file.endsWith('/burialRun.ts'))?.[1] ?? '';
    const write = /function write\(\): void \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  write\(\);/.exec(run)?.[1] ?? '';
    expect(write).not.toBe('');
    expect(write).not.toMatch(/\bnew\b|=\s*\{|=\s*\[|\.map\(|\.filter\(|\.slice\(|\.clone\(|createElement|fillText/);
  });

  it('is mounted in the app, and the interim DONE seam is gone from the ritual session', () => {
    const app = Object.values(import.meta.glob<string>('../App.tsx', { query: '?raw', import: 'default', eager: true }))[0] ?? '';
    expect(app).toMatch(/<BurialDriver \/>/);
    const session =
      Object.values(
        import.meta.glob<string>('../interaction/ritualSession.ts', { query: '?raw', import: 'default', eager: true }),
      )[0] ?? '';
    expect(session).not.toMatch(/INTERIM SEAM/);
    expect(session).not.toMatch(/type: 'DONE'/);
  });
});

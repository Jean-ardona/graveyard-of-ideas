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
import { BOOK_REST_FOOTPRINT, createBookModel } from '../book/bookModel';
import BurialDriver from '../cinematics/BurialDriver';
import { HOLD_DISTANCE } from '../cinematics/burialTimings';
import { allocateSlot } from '../domain';
import { isCameraClaimed, releaseCamera } from '../interaction/cameraOverride';
import { attachPointerTarget, getPointerMode } from '../interaction/pointerLock';
import { playerSession } from '../interaction/playerSession';
import { isRevealPending, resetRevealPending, revealPendingCount } from '../interaction/revealPending';
import { ritualMachine } from '../interaction/ritualMachine';
import { attachRitualSession, startRitual } from '../interaction/ritualSession';
import { appStore } from '../store/appStore';
import { COPY } from '../ui/copy';
import { GRAVE_SLOTS } from '../world/config';
import { PLINTH } from '../world/tombAssets';

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

/** The pose the player has when each test starts: where the camera is and which way it looks. */
const start = { position: new THREE.Vector3(3, 1.7, -2), yaw: 0, pitch: 0 };

function resetLook(): void {
  playerSession.yaw = 0;
  playerSession.pitch = 0;
  camera.position.copy(start.position);
  camera.rotation.set(0, 0, 0);
}

function removeNewProjects(): void {
  for (const project of appStore.getState().data.projects) {
    if (!initialIds.has(project.id)) appStore.getState().remove(project.id);
  }
}

function runToEnd(): void {
  for (let i = 0; i < 60 && ritualMachine.phase() !== 'idle'; i += 1) frame(0.1);
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
  releaseCamera();
  removeNewProjects();
  appStore.getState().setCalmMode(false);
  resetRevealPending();
  pointer.detach();
  vi.restoreAllMocks();
});

/** True when the camera shows exactly the pose the player had when the cinematic started. */
function atPlayerPose(): boolean {
  return (
    camera.position.x === start.position.x &&
    camera.position.y === start.position.y &&
    camera.position.z === start.position.z &&
    camera.rotation.x === start.pitch &&
    camera.rotation.y === start.yaw
  );
}

/** Horizontal distance from the camera to the book point of `slot`. */
function distanceToSlab(slot: number): number {
  const place = GRAVE_SLOTS[slot];
  if (place === undefined) throw new Error('no such slot');
  const front = PLINTH.bookZ - BOOK_REST_FOOTPRINT.length / 2;
  const x = place.x + Math.sin(place.rotation) * front;
  const z = place.z + Math.cos(place.rotation) * front;
  return Math.hypot(camera.position.x - x, camera.position.z - z);
}

interface Landing {
  phase: string;
  flag: boolean;
  copies: number;
  status: string | undefined;
  slot: number | undefined;
  atPlayer: boolean;
  claimed: boolean;
  sceneObjects: number;
  locked: boolean;
}

function landing(id: string): Landing {
  const matches = appStore.getState().data.projects.filter((project) => project.id === id);
  return {
    phase: ritualMachine.phase(),
    flag: isRevealPending(id),
    copies: matches.length,
    status: matches[0]?.status,
    slot: matches[0]?.slot,
    atPlayer: atPlayerPose(),
    claimed: isCameraClaimed(),
    sceneObjects: scene.children.length,
    locked: ritualMachine.inputLocked(),
  };
}

/** The one state every ending reaches: one resting project at its slot, camera at the player's pose and released, flag cleared, input free. */
function finalLanding(slot: number): Landing {
  return {
    phase: 'idle',
    flag: false,
    copies: 1,
    status: 'resting',
    slot,
    atPlayer: true,
    claimed: false,
    sceneObjects: 0,
    locked: false,
  };
}

/** Plays whole frames of 0.1 s until `seconds` have passed. */
function playSeconds(seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) frame(0.1);
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

  it('claims the camera, dollies to the hold spot, rests there, returns and releases it: flag cleared, walking back', () => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    expect(isRevealPending(id)).toBe(true);
    expect(ritualMachine.phase()).toBe('cinematic');
    expect(ritualMachine.inputLocked()).toBe(true);
    expect(scene.children).toHaveLength(1);
    expect(isCameraClaimed()).toBe(true);
    expect(atPlayerPose()).toBe(true);

    playSeconds(1.0);
    expect(atPlayerPose()).toBe(false);
    playSeconds(1.6);
    // Inside the hold: 3 m from the slab, camera still claimed, flag still set.
    expect(distanceToSlab(slot)).toBeCloseTo(HOLD_DISTANCE, 4);
    expect(isCameraClaimed()).toBe(true);
    expect(isRevealPending(id)).toBe(true);
    runToEnd();
    expect(landing(id)).toEqual(finalLanding(slot));
    expect(appStore.getState().data.projects.find((project) => project.id === id)?.slot).toBe(slot);
  });

  it('never writes the position, yaw or pitch of the player, whatever ends the run', () => {
    for (const end of [(): void => runToEnd(), (): void => skipKey('Escape'), (): void => cleanup()]) {
      resetLook();
      const view = mountDriver();
      playerSession.x = 4;
      playerSession.z = -6;
      playerSession.yaw = 0.7;
      playerSession.pitch = -0.2;
      const id = commit();
      playSeconds(2.5);
      expect(playerSession).toEqual({ x: 4, z: -6, yaw: 0.7, pitch: -0.2 });
      end();
      expect(playerSession).toEqual({ x: 4, z: -6, yaw: 0.7, pitch: -0.2 });
      expect(isRevealPending(id)).toBe(false);
      view.unmount();
      removeNewProjects();
      if (lockedElement === null) pointer.request();
    }
  });

  it.each([['Escape'], ['Enter'], [' ']])('skips with %j to the same final state as the natural end', (key) => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    playSeconds(2.0);
    expect(isCameraClaimed()).toBe(true);
    expect(ritualMachine.phase()).toBe('cinematic');
    skipKey(key);
    expect(landing(id)).toEqual(finalLanding(slot));
  });

  it('skips when the pointer lock is lost', () => {
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    expect(getPointerMode()).toBe('locked');
    document.exitPointerLock();
    expect(landing(id)).toEqual(finalLanding(slot));
  });

  it('releases the camera on unmount, in the middle of the hold', () => {
    const view = mountDriver();
    const id = commit();
    playSeconds(2.5);
    expect(isCameraClaimed()).toBe(true);
    view.unmount();
    expect(isCameraClaimed()).toBe(false);
    expect(atPlayerPose()).toBe(true);
    expect(isRevealPending(id)).toBe(false);
    expect(ritualMachine.phase()).toBe('idle');
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
        expect(landing(id)).toEqual(finalLanding(slot));
        view.unmount();
        // A reload starts with no flag and an idle ritual.
        expect(revealPendingCount()).toBe(0);
        removeNewProjects();
        if (lockedElement === null) pointer.request();
      }),
      { numRuns: 100 },
    );
  });

  it('lands on the final state in one frame with calm mode: camera never claimed, no glow left, flag cleared', () => {
    appStore.getState().setCalmMode(true);
    mountDriver();
    const slot = freeSlot();
    const id = commit();
    expect(isCameraClaimed()).toBe(false);
    expect(atPlayerPose()).toBe(true);
    frame(0.016);
    expect(rig.ticks).toBe(1);
    expect(landing(id)).toEqual(finalLanding(slot));
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
    // The book stays hidden during the dolly and shows once the hold starts.
    playSeconds(1.5);
    expect(model.root.visible).toBe(false);
    playSeconds(0.8);
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

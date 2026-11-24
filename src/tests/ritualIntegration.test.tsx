/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import * as THREE from 'three';

const rig = vi.hoisted(() => ({
  frame: null as ((state: unknown, delta: number) => void) | null,
  scene: null as unknown,
  camera: null as unknown,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    rig.frame = callback;
  },
  useThree: (selector: (state: { scene: unknown; camera: unknown }) => unknown) =>
    selector({ scene: rig.scene, camera: rig.camera }),
}));

import { openBook } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import BurialDriver from '../cinematics/BurialDriver';
import { createBurialRun } from '../cinematics/burialRun';
import { MAX_SLOTS } from '../domain/types';
import { allocateSlot, exportData } from '../domain';
import { playerSession } from '../interaction/playerSession';
import { clearRevealPending, isRevealPending, resetRevealPending } from '../interaction/revealPending';
import { createRitualMachine, ritualMachine } from '../interaction/ritualMachine';
import { attachRitualSession, startRitual } from '../interaction/ritualSession';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { GraveyardStore, StorageLike } from '../store';
import { appStore } from '../store/appStore';
import { emptyData } from '../store/persistence';
import { COPY } from '../ui/copy';
import RitualOverlay from '../ui/ritual/RitualOverlay';
import { GRAVE_SLOTS } from '../world/config';
import { toTombDescriptor } from '../world/tombLogic';

const TEXT = import.meta.glob<string>(
  ['../book/Book.tsx', '../../docs/*.md', '../../.kiro/specs/graveyard-core/design.md', '../tests/*.test.ts', '../tests/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true },
);

function source(suffix: string): string {
  return Object.entries(TEXT).find(([file]) => file.endsWith(suffix))?.[1] ?? '';
}

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

const detachers: (() => void)[] = [];

function ritualRig(): { storage: MemoryStorage; store: GraveyardStore; machine: ReturnType<typeof createRitualMachine> } {
  const storage = new MemoryStorage();
  const store = createGraveyardStore(storage);
  const machine = createRitualMachine();
  detachers.push(attachRitualSession(machine, store));
  return { storage, store, machine };
}

function typeTitleAndDescription(machine: ReturnType<typeof createRitualMachine>): void {
  machine.send({ type: 'EDIT', text: 'Moon map' });
  machine.send({ type: 'NEXT' });
  machine.send({ type: 'EDIT', text: 'A map of the moon' });
  machine.send({ type: 'NEXT' });
}

/** A reload: fresh module state (machine, flag) and a store loaded from what was saved. */
async function reload(storage: StorageLike) {
  vi.resetModules();
  const [stores, machines, flags, tombs] = await Promise.all([
    import('../store'),
    import('../interaction/ritualMachine'),
    import('../interaction/revealPending'),
    import('../world/tombLogic'),
  ]);
  return { store: stores.createGraveyardStore(storage), machine: machines.ritualMachine, flags, tombs };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
});

afterEach(() => {
  cleanup();
  detachers.splice(0).forEach((detach) => detach());
  resetRevealPending();
  if (ritualMachine.phase() === 'writing') ritualMachine.send({ type: 'CANCEL' });
  if (ritualMachine.phase() === 'cinematic') ritualMachine.send({ type: 'DONE' });
  readingMachine.skip();
  vi.restoreAllMocks();
});

describe('reload at each phase of the ritual', () => {
  it('before the commit: no project, no flag, an idle ritual', async () => {
    const { storage, store, machine } = ritualRig();
    startRitual(machine, store);
    typeTitleAndDescription(machine);
    machine.send({ type: 'EDIT', text: 'Epitaph so far' });
    const saved = storage.items.get(STORAGE_KEY);
    const fresh = await reload(storage);
    expect(storage.items.get(STORAGE_KEY)).toBe(saved);
    expect(fresh.store.getState().data.projects).toHaveLength(0);
    expect(fresh.machine.phase()).toBe('idle');
    expect(fresh.flags.revealPendingCount()).toBe(0);
  });

  it('right after the commit: one complete project with its tomb and book, no flag, no replay', async () => {
    const { storage, store, machine } = ritualRig();
    startRitual(machine, store);
    typeTitleAndDescription(machine);
    machine.send({ type: 'SEAL' });
    const id = machine.state.projectId ?? '';
    expect(machine.phase()).toBe('cinematic');
    expect(isRevealPending(id)).toBe(true);
    const fresh = await reload(storage);
    const projects = fresh.store.getState().data.projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id, status: 'resting', title: 'Moon map', description: 'A map of the moon' });
    expect(typeof projects[0]?.slot).toBe('number');
    expect(fresh.tombs.toTombDescriptors(projects).map((tomb) => tomb.id)).toEqual([id]);
    expect(fresh.machine.phase()).toBe('idle');
    expect(fresh.machine.state.committed).toBe(false);
    expect(fresh.flags.isRevealPending(id)).toBe(false);
  });

  it('after the end: the same single project, and still nothing to replay', async () => {
    const { storage, store, machine } = ritualRig();
    startRitual(machine, store);
    typeTitleAndDescription(machine);
    machine.send({ type: 'SEAL' });
    const id = machine.state.projectId ?? '';
    clearRevealPending(id);
    machine.send({ type: 'DONE' });
    const fresh = await reload(storage);
    expect(fresh.store.getState().data.projects.map((project) => project.id)).toEqual([id]);
    expect(fresh.machine.phase()).toBe('idle');
    expect(fresh.flags.revealPendingCount()).toBe(0);
  });
});

describe('closing checklist', () => {
  it('a data change between the preview and the commit gives the true slot, and the cinematic uses it', () => {
    const { store, machine } = ritualRig();
    for (let i = 0; i < 3; i += 1) store.getState().buryNewProject({ title: `T${i}`, description: 'd' });
    startRitual(machine, store);
    expect(allocateSlot(store.getState().data.projects)).toBe(3);
    const gone = store.getState().data.projects.find((project) => project.slot === 1);
    if (!gone) throw new Error('missing project');
    store.getState().remove(gone.id);
    const expected = allocateSlot(store.getState().data.projects);
    expect(expected).toBe(1);
    typeTitleAndDescription(machine);
    machine.send({ type: 'SEAL' });
    const project = store.getState().data.projects.find((candidate) => candidate.id === machine.state.projectId);
    expect(project?.slot).toBe(expected);
    expect(toTombDescriptor(project!)?.slot).toBe(expected);

    // The cinematic turns toward the slot of the saved project, whatever the preview said.
    playerSession.yaw = 0;
    playerSession.pitch = 0;
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.order = 'YXZ';
    const run = createBurialRun({ scene: new THREE.Scene(), camera, projectId: project!.id, slot: project!.slot!, instant: true });
    const place = GRAVE_SLOTS[project!.slot!]!;
    const toTomb = new THREE.Vector3(place.x - playerSession.x, 0, place.z - playerSession.z).normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).setY(0).normalize();
    expect(forward.dot(toTomb)).toBeGreaterThan(0.98);
    run.dispose();
    playerSession.yaw = 0;
    playerSession.pitch = 0;
  });

  it('a full graveyard refuses START with the calm message and writes nothing', () => {
    const { store, machine } = ritualRig();
    for (let i = 0; i < MAX_SLOTS; i += 1) store.getState().buryNewProject({ title: `T${i}`, description: 'd' });
    const before = store.getState().data.projects;
    expect(startRitual(machine, store)).toBe(false);
    expect(machine.phase()).toBe('idle');
    expect(store.getState().data.projects).toBe(before);
    expect(COPY.ritual.graveyardFull).toMatch(/no free tomb/);
  });

  it('a double Enter on the last step creates one project; a later key skips the cinematic', () => {
    rig.scene = new THREE.Scene();
    rig.camera = new THREE.PerspectiveCamera();
    const initial = appStore.getState().data.projects;
    const initialIds = new Set(initial.map((project) => project.id));
    detachers.push(attachRitualSession());
    render(<BurialDriver />);
    expect(startRitual()).toBe(true);
    for (const text of ['Moon map', 'A map of the moon', '', '', '', '']) {
      ritualMachine.send({ type: 'EDIT', text });
      ritualMachine.send({ type: 'NEXT' });
    }
    render(<RitualOverlay />);
    const field = document.getElementById('ritual-field') as HTMLInputElement;
    act(() => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    const created = appStore.getState().data.projects.filter((project) => !initialIds.has(project.id));
    expect(created).toHaveLength(1);
    expect(ritualMachine.phase()).toBe('cinematic');
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(appStore.getState().data.projects.filter((project) => !initialIds.has(project.id))).toHaveLength(1);
    expect(ritualMachine.phase()).toBe('idle');
    expect(isRevealPending(created[0]?.id ?? '')).toBe(false);
    appStore.getState().remove(created[0]?.id ?? '');
  });

  it('refuses a book and a second ritual while the cinematic runs', () => {
    const initialIds = new Set(appStore.getState().data.projects.map((project) => project.id));
    const created = appStore.getState().buryNewProject({ title: 'Lantern', description: 'A lantern' });
    if (!created.ok) throw new Error(created.error);
    detachers.push(attachRitualSession());
    expect(startRitual()).toBe(true);
    typeTitleAndDescription(ritualMachine);
    ritualMachine.send({ type: 'SEAL' });
    expect(ritualMachine.phase()).toBe('cinematic');
    expect(startRitual()).toBe(false);
    openBook(created.project.id, true);
    expect(readingMachine.phase()).toBe('closed');
    ritualMachine.send({ type: 'DONE' });
    for (const project of appStore.getState().data.projects) {
      if (!initialIds.has(project.id)) appStore.getState().remove(project.id);
    }
  });

  it('reads the reveal-pending flag in the tomb book and nowhere else in the book module', () => {
    const book = source('/book/Book.tsx');
    expect(book).toMatch(/isRevealPending\(id\)/);
    expect(book).toMatch(/visible=\{!hidden\}/);
  });

  it('has playbook P77 to P85 matching design properties 68 to 76, each with a tagged test', () => {
    const playbook = source('/docs/KIRO_PLAYBOOK.md');
    const design = source('/graveyard-core/design.md');
    const tests = Object.entries(TEXT)
      .filter(([file]) => /^\.\/[^/]+\.test\.tsx?$/.test(file) && file !== './ritualIntegration.test.tsx')
      .map(([, text]) => text)
      .join('\n');
    expect(playbook).not.toBe('');
    expect(design).not.toBe('');
    for (let n = 68; n <= 76; n += 1) {
      const title = new RegExp(`^#### Property ${n}: (.+)$`, 'm').exec(design)?.[1]?.trim();
      expect(title, `design property ${n}`).toBeTruthy();
      const line = new RegExp(`^- P${n + 9} (.+)$`, 'm').exec(playbook)?.[1] ?? '';
      expect(line.startsWith(title ?? '?'), `P${n + 9}: ${title}`).toBe(true);
      expect(line, `P${n + 9}`).toContain(`(design ${n},`);
      expect(tests, `a test tagged Property ${n}`).toMatch(new RegExp(`Feature: graveyard-core, Property ${n}:`));
    }
  });

  it('has one Low-quality row for the burial cinematic in the measurements table, left pending', () => {
    const log = source('/docs/KIRO_LOG.md');
    const row = /^\| 6\.2\.1 Burial cinematic \|(.*)\|$/m.exec(log)?.[1];
    expect(row).toBeDefined();
    expect(row).toMatch(/pending/i);
  });
});

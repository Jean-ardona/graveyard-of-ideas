/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { closeBook, openBook } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { RITUAL_STEPS, exportData } from '../domain';
import { MAX_SLOTS } from '../domain/types';
import { canWalk } from '../interaction/inputLock';
import { attachPointerTarget, getPointerMode } from '../interaction/pointerLock';
import { isRevealPending, resetRevealPending } from '../interaction/revealPending';
import { createRitualMachine, ritualMachine } from '../interaction/ritualMachine';
import type { RitualMachine } from '../interaction/ritualMachine';
import { NOTICE_MS, attachRitualSession, startRitual, useRitualNotice } from '../interaction/ritualSession';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { GraveyardStore, StorageLike } from '../store';
import { appStore } from '../store/appStore';
import { emptyData } from '../store/persistence';
import { COPY } from '../ui/copy';
import RitualOverlay from '../ui/ritual/RitualOverlay';

const APP = Object.values(import.meta.glob<string>('../App.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string;

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

interface Rig {
  machine: RitualMachine;
  store: GraveyardStore;
  storage: MemoryStorage;
}

const detachers: (() => void)[] = [];

function rig(): Rig {
  const storage = new MemoryStorage();
  const store = createGraveyardStore(storage);
  const machine = createRitualMachine();
  detachers.push(attachRitualSession(machine, store));
  return { machine, store, storage };
}

function type(machine: RitualMachine, texts: readonly string[]): void {
  texts.forEach((text) => {
    machine.send({ type: 'EDIT', text });
    machine.send({ type: 'NEXT' });
  });
}

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

/**
 * A canvas whose pointer lock works like a browser's: the lock is taken at once and the lock event fires.
 * With `refuse` every request throws, as when a browser denies the lock. The player starts out walking.
 */
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

const FULL_DRAFT = ['Moon map', 'A map of the moon', 'Reach it', 'No time', 'Here lies a map', 'Notes', 'https://example.com'];

let pointer: FakePointer;

beforeEach(() => {
  pointer = fakePointer();
});

afterEach(() => {
  cleanup();
  resetRevealPending();
  detachers.splice(0).forEach((detach) => detach());
  ritualMachine.send({ type: 'CANCEL' });
  closeBook();
  readingMachine.skip();
  pointer.detach();
  vi.useRealTimers();
});

describe('starting and cancelling', () => {
  it('START locks input and releases the pointer; walking does nothing', () => {
    const { machine, store } = rig();
    expect(startRitual(machine, store)).toBe(true);
    expect(machine.phase()).toBe('writing');
    expect(machine.inputLocked()).toBe(true);
    expect(machine.uiMode()).toBe('burying');
    expect(getPointerMode()).toBe('released');
    expect(canWalk(true, machine.inputLocked(), 'locked')).toBe(false);
  });

  it('cancel at any step leaves the projects reference-identical and gives input back', () => {
    for (let step = 0; step < RITUAL_STEPS.length; step += 1) {
      const { machine, store } = rig();
      const before = store.getState().data.projects;
      expect(startRitual(machine, store)).toBe(true);
      type(machine, FULL_DRAFT.slice(0, step));
      expect(machine.state.step).toBe(step);
      machine.send({ type: 'CANCEL' });
      expect(machine.phase()).toBe('idle');
      expect(machine.inputLocked()).toBe(false);
      expect(getPointerMode()).toBe('locked');
      expect(store.getState().data.projects).toBe(before);
      expect(machine.state.draft.title).toBe('');
    }
  });

  it('asks for the pointer on cancel, and a refusal falls to "Click to resume"', () => {
    const { machine, store } = rig();
    startRitual(machine, store);
    expect(pointer.request).not.toHaveBeenCalled();
    machine.send({ type: 'CANCEL' });
    expect(pointer.request).toHaveBeenCalledTimes(1);

    pointer.detach();
    pointer = fakePointer(true);
    startRitual(machine, store);
    machine.send({ type: 'CANCEL' });
    expect(getPointerMode()).toBe('lost');
    expect(COPY.prompts.resume).toBe('Click to resume');
  });

  it('refuses with the calm message when no tomb is free, and starts nothing', () => {
    vi.useFakeTimers();
    const { machine, store } = rig();
    for (let i = 0; i < MAX_SLOTS; i += 1) store.getState().buryNewProject({ title: `T${i}`, description: 'd' });
    function Probe() {
      return <p>{useRitualNotice() ?? 'none'}</p>;
    }
    render(<Probe />);
    act(() => {
      expect(startRitual(machine, store)).toBe(false);
    });
    expect(machine.phase()).toBe('idle');
    expect(getPointerMode()).toBe('locked');
    expect(screen.getByText(COPY.ritual.graveyardFull)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(NOTICE_MS + 10);
    });
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('refuses a book while the ritual runs, and the ritual while a book is open', () => {
    const created = appStore.getState().buryNewProject({ title: 'Lantern', description: 'A lantern that learns' });
    if (!created.ok) throw new Error(created.error);
    detachers.push(attachRitualSession());
    expect(startRitual()).toBe(true);
    openBook(created.project.id, true);
    expect(readingMachine.phase()).toBe('closed');
    ritualMachine.send({ type: 'CANCEL' });

    openBook(created.project.id, true);
    expect(readingMachine.phase()).not.toBe('closed');
    expect(startRitual()).toBe(false);
    expect(ritualMachine.phase()).toBe('idle');
  });
});

describe('committing', () => {
  it('the last NEXT saves exactly one resting project before any other event, then ends the ritual', () => {
    const { machine, store, storage } = rig();
    startRitual(machine, store);
    type(machine, FULL_DRAFT);
    const projects = store.getState().data.projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ status: 'resting', slot: 0, title: 'Moon map', epitaph: 'Here lies a map' });
    expect(storage.items.get(STORAGE_KEY)).toContain('Moon map');
    // No interim DONE: the ritual stays in its cinematic phase, with the book hidden, until the driver ends it.
    expect(machine.phase()).toBe('cinematic');
    expect(machine.state).toMatchObject({ committed: true, projectId: projects[0]?.id });
    expect(isRevealPending(projects[0]?.id ?? '')).toBe(true);
    machine.send({ type: 'DONE' });
    expect(machine.phase()).toBe('idle');
  });

  it('Seal the tomb after title and description saves one project, and the pointer is requested at once', () => {
    const { machine, store } = rig();
    startRitual(machine, store);
    type(machine, ['Moon map', 'A map of the moon']);
    machine.send({ type: 'SEAL' });
    expect(store.getState().data.projects).toHaveLength(1);
    expect(pointer.request).toHaveBeenCalledTimes(1);
    expect(getPointerMode()).toBe('locked');
    expect(machine.phase()).toBe('cinematic');
    expect(machine.inputLocked()).toBe(true);
  });

  it('a double Enter on the last step creates one project', () => {
    const { machine, store } = rig();
    startRitual(machine, store);
    type(machine, FULL_DRAFT.slice(0, 6));
    machine.send({ type: 'NEXT' });
    machine.send({ type: 'NEXT' });
    expect(store.getState().data.projects).toHaveLength(1);
  });

  it('a double Enter through the overlay creates one project', () => {
    const { machine, store } = rig();
    startRitual(machine, store);
    type(machine, FULL_DRAFT.slice(0, 6));
    render(<RitualOverlay machine={machine} />);
    const field = document.getElementById('ritual-field') as HTMLInputElement;
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.getState().data.projects).toHaveLength(1);
  });

  it('a failed commit returns to the same step with the draft kept and touches neither pointer nor store', () => {
    const { machine, store } = rig();
    startRitual(machine, store);
    type(machine, ['Moon map', 'A map of the moon', 'Goal']);
    for (let i = 0; i < MAX_SLOTS; i += 1) store.getState().buryNewProject({ title: `T${i}`, description: 'd' });
    const projects = store.getState().data.projects;
    machine.send({ type: 'SEAL' });
    expect(machine.phase()).toBe('writing');
    expect(machine.state).toMatchObject({ step: 3, error: 'graveyard_full', committed: false });
    expect(machine.state.draft.title).toBe('Moon map');
    expect(store.getState().data.projects).toBe(projects);
    expect(pointer.request).not.toHaveBeenCalled();
    expect(getPointerMode()).toBe('released');
  });
});

describe('app wiring', () => {
  it('locks input while the ritual runs, mounts the overlay and no longer mounts a panel', () => {
    expect(APP).toMatch(/inputLocked = useReadingPhase\(\) !== 'closed' \|\| ritualPhase !== 'idle'/);
    expect(APP).toMatch(/<RitualOverlay \/>/);
    expect(APP).toMatch(/attachRitualSession\(\)/);
    expect(APP).not.toMatch(/Grimoire/);
  });
});

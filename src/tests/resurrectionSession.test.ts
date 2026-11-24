import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readingMachine } from '../book/readingMachine';
import {
  currentUiMode,
  endResurrection,
  getHeldTombs,
  isResurrecting,
  isResurrectionRunning,
  startResurrection,
  subscribeResurrection,
} from '../cinematics/resurrectionSession';
import { exportData } from '../domain';
import { canOpenBook } from '../interaction/uiMode';
import { createRitualMachine } from '../interaction/ritualMachine';
import { startRitual } from '../interaction/ritualSession';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { GraveyardStore, StorageLike } from '../store';
import { emptyData } from '../store/persistence';
import { toTombDescriptors, withHeldTombs } from '../world/tombLogic';

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

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

function storeWith(count: number): GraveyardStore {
  const store = createGraveyardStore(new MemoryStorage());
  for (let i = 0; i < count; i++) store.getState().commitBurial({ title: `Idea ${i}`, description: 'd' });
  return store;
}

function openBookFor(): void {
  readingMachine.open(GUARD);
  readingMachine.skip();
}

beforeEach(openBookFor);

afterEach(() => {
  endResurrection();
  readingMachine.close();
  readingMachine.finishTurn();
  readingMachine.skip();
});

const INPUT = { nextAction: 'Sketch one screen' };

describe('resurrection session', () => {
  it('saves status Resurrected before the sequence may start, keeping the project once', () => {
    const store = storeWith(3);
    const target = store.getState().data.projects[1]!;
    const seenWhileRunning: string[] = [];
    const unsubscribe = subscribeResurrection(() => {
      if (isResurrectionRunning()) {
        seenWhileRunning.push(store.getState().data.projects.find((p) => p.id === target.id)!.status);
      }
    });
    expect(startResurrection(target.id, INPUT, store)).toBe(true);
    unsubscribe();
    // The first moment anyone could start playing, the data already says Resurrected.
    expect(seenWhileRunning).toEqual(['resurrected']);
    const projects = store.getState().data.projects;
    expect(projects).toHaveLength(3);
    const saved = projects.find((p) => p.id === target.id)!;
    expect(saved).toMatchObject({ status: 'resurrected', nextAction: INPUT.nextAction, title: target.title });
    expect(saved.slot).toBeUndefined();
    expect(saved.history.some((entry) => entry.kind === 'resurrected')).toBe(true);
  });

  it('keeps the tomb at its slot until the sequence ends, then releases it', () => {
    const store = storeWith(2);
    const target = store.getState().data.projects[0]!;
    const before = toTombDescriptors(store.getState().data.projects);
    expect(startResurrection(target.id, INPUT, store)).toBe(true);
    const resting = toTombDescriptors(store.getState().data.projects);
    expect(resting.map((d) => d.id)).not.toContain(target.id);
    const drawn = withHeldTombs(resting, getHeldTombs());
    expect(drawn.map((d) => d.id)).toEqual(before.map((d) => d.id));
    expect(drawn.find((d) => d.id === target.id)).toEqual(before.find((d) => d.id === target.id));
    expect(currentUiMode()).toBe('resurrecting');

    endResurrection();
    expect(isResurrecting()).toBe(false);
    expect(isResurrectionRunning()).toBe(false);
    expect(withHeldTombs(resting, getHeldTombs()).map((d) => d.id)).not.toContain(target.id);
    expect(currentUiMode()).toBe('reading');
  });

  it('refuses without a next action and leaves the store and the tomb alone', () => {
    const store = storeWith(1);
    const data = store.getState().data;
    expect(startResurrection(data.projects[0]!.id, { nextAction: '   ' }, store)).toBe(false);
    expect(store.getState().data).toBe(data);
    expect(isResurrecting()).toBe(false);
    expect(getHeldTombs()).toHaveLength(0);
  });

  it('blocks a book from opening and the burial ritual from starting while it runs', () => {
    const store = storeWith(2);
    expect(startResurrection(store.getState().data.projects[0]!.id, INPUT, store)).toBe(true);
    const mode = currentUiMode();
    expect(canOpenBook({ ...GUARD, mode })).toBe(false);
    const machine = createRitualMachine();
    expect(startRitual(machine, store)).toBe(false);
    expect(machine.phase()).toBe('idle');
  });

  it('Feature: graveyard-core, Property 80: Save first, one resurrection at a time, and the tomb is released at the end', () => {
    type Op = { kind: 'start'; index: number; blank: boolean } | { kind: 'end' } | { kind: 'close' } | { kind: 'open' };
    const opArb: fc.Arbitrary<Op> = fc.oneof(
      { weight: 5, arbitrary: fc.record({ kind: fc.constant('start' as const), index: fc.nat({ max: 5 }), blank: fc.boolean() }) },
      { weight: 3, arbitrary: fc.constant<Op>({ kind: 'end' }) },
      { weight: 1, arbitrary: fc.constant<Op>({ kind: 'close' }) },
      { weight: 1, arbitrary: fc.constant<Op>({ kind: 'open' }) },
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.array(opArb, { maxLength: 30 }), (count, ops) => {
        endResurrection();
        readingMachine.close();
        readingMachine.finishTurn();
        readingMachine.skip();
        openBookFor();
        const store = storeWith(count);
        const ids = store.getState().data.projects.map((p) => p.id);
        const observedWhenRunning: boolean[] = [];
        const unsubscribe = subscribeResurrection(() => {
          if (!isResurrectionRunning()) return;
          const held = getHeldTombs()[0];
          const project = store.getState().data.projects.find((p) => p.id === held?.id);
          observedWhenRunning.push(project?.status === 'resurrected');
        });
        for (const op of ops) {
          const before = store.getState().data.projects;
          const wasResurrecting = isResurrecting();
          const mode = currentUiMode();
          if (op.kind === 'start') {
            const id = ids[op.index % ids.length]!;
            const accepted = startResurrection(id, op.blank ? { nextAction: ' ' } : INPUT, store);
            const wasResting = before.find((p) => p.id === id)?.status === 'resting';
            // Accepted only from the open book, alone, for a resting project and a real next action.
            expect(accepted).toBe(!wasResurrecting && mode === 'reading' && wasResting && !op.blank);
            if (!accepted) expect(store.getState().data.projects).toBe(before);
          } else if (op.kind === 'end') endResurrection();
          else if (op.kind === 'close') {
            endResurrection();
            readingMachine.close();
            readingMachine.finishTurn();
            readingMachine.skip();
          } else if (readingMachine.phase() === 'closed') openBookFor();

          // At most one tomb is held, and a project is never duplicated or lost.
          expect(getHeldTombs().length).toBeLessThanOrEqual(1);
          const now = store.getState().data.projects;
          expect(now.map((p) => p.id)).toEqual(ids);
          expect(isResurrecting()).toBe(getHeldTombs().length === 1);
          if (!isResurrecting()) expect(isResurrectionRunning()).toBe(false);
        }
        unsubscribe();
        // Every time the sequence could run, the save was already there.
        expect(observedWhenRunning.every(Boolean)).toBe(true);
        endResurrection();
        expect(getHeldTombs()).toHaveLength(0);
        expect(isResurrectionRunning()).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

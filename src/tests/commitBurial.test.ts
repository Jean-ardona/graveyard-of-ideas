import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { RITUAL_STEPS, allocateSlot, exportData } from '../domain';
import { MAX_SLOTS } from '../domain/types';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualAction } from '../interaction/ritualMachine';
import { attachRitualSession, startRitual } from '../interaction/ritualSession';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { GraveyardStore, StorageLike } from '../store';
import { emptyData } from '../store/persistence';

class CountingStorage implements StorageLike {
  items = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function emptyStorage(): CountingStorage {
  const storage = new CountingStorage();
  storage.items.set(STORAGE_KEY, exportData({ ...emptyData(), seeded: true }));
  return storage;
}

function fill(store: GraveyardStore, count: number): void {
  for (let i = 0; i < count; i += 1) store.getState().buryNewProject({ title: `T${i}`, description: 'd' });
}

describe('commitBurial', () => {
  it('writes the project and flushes persistence before it returns', () => {
    const storage = emptyStorage();
    const store = createGraveyardStore(storage);
    const before = storage.writes;
    const result = store.getState().commitBurial({ title: 'Moon map', description: 'A map of the moon' });
    if (!result.ok) throw new Error(result.error);
    expect(storage.writes).toBe(before + 1);
    const saved = JSON.parse(storage.items.get(STORAGE_KEY) ?? '{}') as { projects: { id: string }[] };
    expect(saved.projects.map((project) => project.id)).toEqual([result.project.id]);
    expect(result.project).toMatchObject({ status: 'resting', slot: 0, title: 'Moon map' });
    expect(store.getState().data.projects).toEqual([result.project]);
    expect(store.getState().saveError).toBeNull();
  });

  it('takes the slot from the same list it writes to', () => {
    const store = createGraveyardStore(emptyStorage());
    fill(store, 3);
    const removed = store.getState().data.projects[1];
    if (!removed) throw new Error('missing project');
    store.getState().remove(removed.id);
    const expected = allocateSlot(store.getState().data.projects);
    const result = store.getState().commitBurial({ title: 'New', description: 'd' });
    if (!result.ok) throw new Error(result.error);
    expect(result.project.slot).toBe(expected);
  });

  it('keeps the work in memory and reports the error when the save fails', () => {
    const storage = emptyStorage();
    const store = createGraveyardStore(storage);
    storage.setItem = () => {
      throw new Error('denied');
    };
    const result = store.getState().commitBurial({ title: 'A', description: 'd' });
    expect(result.ok).toBe(true);
    expect(store.getState().data.projects).toHaveLength(1);
    expect(store.getState().saveError).toBe('unavailable');
  });

  it('leaves the store and the storage untouched on graveyard_full or invalid input', () => {
    const storage = emptyStorage();
    const store = createGraveyardStore(storage);
    expect(store.getState().commitBurial({ title: ' ', description: 'd' })).toEqual({ ok: false, error: 'invalid_title' });
    fill(store, MAX_SLOTS);
    const data = store.getState().data;
    const writes = storage.writes;
    expect(store.getState().commitBurial({ title: 'One more', description: 'd' })).toEqual({
      ok: false,
      error: 'graveyard_full',
    });
    expect(store.getState().data).toBe(data);
    expect(storage.writes).toBe(writes);
  });
});

const LAST = RITUAL_STEPS.length - 1;
const textArb = fc.constantFrom('', '  ', 'Moon map', 'x'.repeat(5000), 'javascript:alert(1)', 'https://example.com', '墓');
const actionArb: fc.Arbitrary<RitualAction | 'START'> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<'START'>('START') },
  { weight: 4, arbitrary: textArb.map((text): RitualAction => ({ type: 'EDIT', text })) },
  { weight: 5, arbitrary: fc.constant<RitualAction>({ type: 'NEXT' }) },
  { weight: 2, arbitrary: fc.constant<RitualAction>({ type: 'SEAL' }) },
  { weight: 1, arbitrary: fc.constantFrom<RitualAction>({ type: 'BACK' }, { type: 'SKIP_STEP' }, { type: 'CANCEL' }) },
  { weight: 1, arbitrary: fc.constantFrom<RitualAction>({ type: 'DONE' }, { type: 'SKIP_CINEMATIC' }) },
  { weight: 1, arbitrary: fc.constant<RitualAction>({ type: 'COMMIT_OK', projectId: 'forged' }) },
);

describe('commitBurial in the ritual', () => {
  it('Feature: graveyard-core, Property 73: The commit runs at most once per ritual and never leaves half a project', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SLOTS }), fc.array(actionArb, { maxLength: 60 }), (initial, actions) => {
        const store = createGraveyardStore(emptyStorage());
        fill(store, initial);
        const startList = store.getState().data.projects;
        const original = store.getState().commitBurial;
        const spy = vi.fn(original);
        store.setState({ commitBurial: spy });
        const machine = createRitualMachine();
        const detach = attachRitualSession(machine, store);
        let accepted = 0;
        let commitsThisRitual = 0;
        for (const action of actions) {
          const before = store.getState().data.projects;
          const calls = spy.mock.calls.length;
          if (action === 'START') {
            if (startRitual(machine, store)) {
              accepted += 1;
              commitsThisRitual = 0;
            }
          } else {
            machine.send(action);
          }
          const made = spy.mock.calls.length - calls;
          commitsThisRitual += made;
          expect(commitsThisRitual).toBeLessThanOrEqual(1);
          const after = store.getState().data.projects;
          if (made === 0) expect(after).toBe(before);
          else if (after !== before) {
            expect(after).toHaveLength(before.length + 1);
            expect(after.slice(0, before.length)).toEqual(before);
          }
        }
        detach();
        const finalList = store.getState().data.projects;
        expect(finalList.length - startList.length).toBeLessThanOrEqual(accepted);
        const slots = finalList.filter((project) => project.status === 'resting').map((project) => project.slot);
        expect(new Set(slots).size).toBe(slots.length);
        const ids = finalList.map((project) => project.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const project of finalList.slice(startList.length)) {
          expect(project.status).toBe('resting');
          expect(project.slot).toBeTypeOf('number');
          expect(project.title.trim()).not.toBe('');
          expect(project.description.trim()).not.toBe('');
        }
        expect(machine.state.step).toBeLessThanOrEqual(LAST);
      }),
      { numRuns: 100 },
    );
  });
});

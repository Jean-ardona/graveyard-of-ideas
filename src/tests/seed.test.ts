import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEMO_PROJECTS, exportData, importData, seedDemoProjects } from '../domain';
import { STORAGE_KEY, createGraveyardStore, type StorageLike } from '../store';
import { emptyData } from '../store/persistence';

class MemoryStorage implements StorageLike {
  items = new Map<string, string>();
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

const NOW = '2026-11-01T00:00:00.000Z';

describe('seedDemoProjects', () => {
  const seeded = seedDemoProjects(emptyData(), NOW);

  it('creates three resting projects in distinct slots and sets the flag', () => {
    expect(seeded.seeded).toBe(true);
    expect(seeded.projects).toHaveLength(3);
    expect(seeded.projects.every((p) => p.status === 'resting')).toBe(true);
    expect(new Set(seeded.projects.map((p) => p.slot)).size).toBe(3);
  });

  it('fills the four book parts and an epitaph, with no links', () => {
    for (const project of seeded.projects) {
      expect(project.description).not.toBe('');
      expect(project.abandonReason).toBeTruthy();
      expect(project.notes).not.toBe('');
      expect(project.reducedVersion).toBeTruthy();
      expect(project.epitaph).toBeTruthy();
      expect(project.links).toEqual([]);
    }
  });

  it('uses a different abandonment reason for each project', () => {
    expect(new Set(seeded.projects.map((p) => p.abandonReason)).size).toBe(3);
  });

  it('produces data that survives an export and import round trip', () => {
    const result = importData(exportData(seeded, NOW));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(seeded);
  });

  it('returns already seeded data unchanged', () => {
    const data = { ...emptyData(), seeded: true };
    expect(seedDemoProjects(data, NOW)).toBe(data);
  });
});

describe('seeding on load', () => {
  it('seeds and saves when nothing is stored', () => {
    const storage = new MemoryStorage();
    const state = createGraveyardStore(storage).getState();
    expect(state.data.projects.map((p) => p.title)).toEqual(DEMO_PROJECTS.map((p) => p.title));
    expect(state.data.seeded).toBe(true);
    expect(importData(storage.items.get(STORAGE_KEY)).ok).toBe(true);
  });

  it('seeds again when stored data was reset to unseeded', () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, exportData(emptyData()));
    expect(createGraveyardStore(storage).getState().data.projects).toHaveLength(3);
  });

  it('never seeds when valid stored data has seeded = true', () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, exportData({ ...emptyData(), seeded: true }));
    expect(createGraveyardStore(storage).getState().data.projects).toEqual([]);
  });

  it('does not seed over corrupted data and marks the data as seeded', () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, '{not json');
    const state = createGraveyardStore(storage).getState();
    expect(state.data.projects).toEqual([]);
    expect(state.data.seeded).toBe(true);
  });

  it('keeps demo projects in memory when storage is unavailable', () => {
    const state = createGraveyardStore(null).getState();
    expect(state.data.projects).toEqual([]);
    expect(state.warning).not.toBeNull();
  });
});

describe('P6: seed once', () => {
  it('after any sequence of deletions, loading never recreates the demo projects', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 5 }), { maxLength: 12 }), fc.integer({ min: 1, max: 3 }), (picks, reloads) => {
        const storage = new MemoryStorage();
        let store = createGraveyardStore(storage);
        for (const pick of picks) {
          const victim = store.getState().data.projects[pick % 3];
          if (victim) store.getState().remove(victim.id);
        }
        const remaining = store.getState().data.projects.map((p) => p.id);
        storage.items.set(STORAGE_KEY, store.getState().exportJson());

        for (let i = 0; i < reloads; i++) {
          store = createGraveyardStore(storage);
          expect(store.getState().data.seeded).toBe(true);
          expect(store.getState().data.projects.map((p) => p.id)).toEqual(remaining);
        }
      }),
    );
  });

  it('stays empty after deleting every project', () => {
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    for (const project of store.getState().data.projects) store.getState().remove(project.id);
    storage.items.set(STORAGE_KEY, store.getState().exportJson());
    expect(createGraveyardStore(storage).getState().data.projects).toEqual([]);
  });
});

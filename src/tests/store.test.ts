import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportData } from '../domain';
import {
  BACKUP_KEY,
  STORAGE_KEY,
  createGraveyardStore,
  startAutosave,
  type GraveyardStore,
  type StorageLike,
} from '../store';

class MemoryStorage implements StorageLike {
  items = new Map<string, string>();
  failWith: Error | null = null;

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWith) throw this.failWith;
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const quotaError = () => new DOMException('full', 'QuotaExceededError');

function bury(store: GraveyardStore, title: string) {
  return store.getState().buryNewProject({ title, description: 'd' });
}

function seededStorage(titles: string[]): MemoryStorage {
  const storage = new MemoryStorage();
  const store = createGraveyardStore(storage);
  titles.forEach((title) => bury(store, title));
  storage.items.set(STORAGE_KEY, store.getState().exportJson());
  return storage;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('load', () => {
  it('starts empty without warning when nothing is stored', () => {
    const state = createGraveyardStore(new MemoryStorage()).getState();
    expect(state.data.projects).toEqual([]);
    expect(state.warning).toBeNull();
    expect(state.saveError).toBeNull();
  });

  it('restores previously saved data', () => {
    const state = createGraveyardStore(seededStorage(['A', 'B'])).getState();
    expect(state.data.projects.map((p) => p.title)).toEqual(['A', 'B']);
  });

  it('keeps a backup, starts empty and warns on corrupted data', () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, '{not json');
    const state = createGraveyardStore(storage).getState();
    expect(state.data.projects).toEqual([]);
    expect(state.warning).not.toBeNull();
    expect(storage.items.get(BACKUP_KEY)).toBe('{not json');
  });

  it('treats schema-invalid data as corrupted', () => {
    const storage = new MemoryStorage();
    const invalid = JSON.stringify({ schemaVersion: 1, projects: 'nope' });
    storage.items.set(STORAGE_KEY, invalid);
    const state = createGraveyardStore(storage).getState();
    expect(state.warning).not.toBeNull();
    expect(storage.items.get(BACKUP_KEY)).toBe(invalid);
  });

  it('starts empty with an error when storage is unavailable', () => {
    const state = createGraveyardStore(null).getState();
    expect(state.saveError).toBe('unavailable');
    expect(state.warning).not.toBeNull();
  });
});

describe('autosave', () => {
  it('saves once after the debounce delay', () => {
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    const autosave = startAutosave(store, storage, 500);
    bury(store, 'A');
    bury(store, 'B');
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(createGraveyardStore(storage).getState().data.projects).toHaveLength(2);
    autosave.dispose();
  });

  it('flushes immediately when the page is hidden', () => {
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    const autosave = startAutosave(store, storage, 500);
    bury(store, 'A');
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.items.has(STORAGE_KEY)).toBe(true);
    autosave.dispose();
  });

  it('keeps data in memory and reports quota errors, then recovers', () => {
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    const autosave = startAutosave(store, storage, 500);
    storage.failWith = quotaError();
    bury(store, 'A');
    autosave.flush();
    expect(store.getState().saveError).toBe('quota_exceeded');
    expect(store.getState().data.projects).toHaveLength(1);

    storage.failWith = null;
    bury(store, 'B');
    autosave.flush();
    expect(store.getState().saveError).toBeNull();
    expect(createGraveyardStore(storage).getState().data.projects).toHaveLength(2);
    autosave.dispose();
  });

  it('keeps data in memory when storage is unavailable', () => {
    const store = createGraveyardStore(null);
    const autosave = startAutosave(store, null, 500);
    bury(store, 'A');
    autosave.flush();
    expect(store.getState().saveError).toBe('unavailable');
    expect(store.getState().data.projects).toHaveLength(1);
    autosave.dispose();
  });

  it('classifies a generic storage failure as unavailable', () => {
    const storage = new MemoryStorage();
    const store = createGraveyardStore(storage);
    const autosave = startAutosave(store, storage, 500);
    storage.failWith = new Error('denied');
    bury(store, 'A');
    autosave.flush();
    expect(store.getState().saveError).toBe('unavailable');
    autosave.dispose();
  });
});

describe('import and export', () => {
  it('round-trips through export, prepareImport and confirmReplace', () => {
    const source = createGraveyardStore(new MemoryStorage());
    bury(source, 'A');
    const target = createGraveyardStore(new MemoryStorage());

    const prepared = target.getState().prepareImport(source.getState().exportJson());
    expect(prepared).toEqual({ ok: true, projectCount: 1 });
    expect(target.getState().data.projects).toHaveLength(0);

    expect(target.getState().confirmReplace()).toBe(true);
    expect(target.getState().data.projects.map((p) => p.title)).toEqual(['A']);
    expect(target.getState().pendingImport).toBeNull();
  });

  it('never replaces current data when the import fails', () => {
    const store = createGraveyardStore(new MemoryStorage());
    bury(store, 'Keep');
    const before = store.getState().data;

    for (const bad of ['{nope', '[]', '{"schemaVersion":99}', '{"__proto__":{}}']) {
      expect(store.getState().prepareImport(bad).ok).toBe(false);
      expect(store.getState().pendingImport).toBeNull();
      expect(store.getState().confirmReplace()).toBe(false);
      expect(store.getState().data).toBe(before);
    }
  });

  it('a failed import discards an earlier pending import', () => {
    const source = createGraveyardStore(new MemoryStorage());
    bury(source, 'Other');
    const store = createGraveyardStore(new MemoryStorage());
    bury(store, 'Keep');

    store.getState().prepareImport(source.getState().exportJson());
    store.getState().prepareImport('{nope');
    expect(store.getState().confirmReplace()).toBe(false);
    expect(store.getState().data.projects.map((p) => p.title)).toEqual(['Keep']);
  });

  it('cancelImport leaves the data untouched', () => {
    const store = createGraveyardStore(new MemoryStorage());
    bury(store, 'Keep');
    store.getState().prepareImport(exportData(createGraveyardStore(new MemoryStorage()).getState().data));
    store.getState().cancelImport();
    expect(store.getState().confirmReplace()).toBe(false);
    expect(store.getState().data.projects).toHaveLength(1);
  });
});

describe('domain actions', () => {
  it('changes data only on success', () => {
    const store = createGraveyardStore(new MemoryStorage());
    expect(store.getState().buryNewProject({ title: ' ', description: 'd' }).ok).toBe(false);
    expect(store.getState().data.projects).toHaveLength(0);

    const created = bury(store, 'A');
    if (!created.ok) throw new Error('expected success');
    const id = created.project.id;

    expect(store.getState().resurrect(id, { nextAction: '' }).ok).toBe(false);
    expect(store.getState().data.projects[0]?.status).toBe('resting');
    expect(store.getState().resurrect(id, { nextAction: 'Start' }).ok).toBe(true);
    expect(store.getState().data.projects[0]?.status).toBe('resurrected');
    expect(store.getState().honor(id, {}).ok).toBe(true);
    expect(store.getState().remove(id).ok).toBe(true);
    expect(store.getState().data.projects).toHaveLength(0);
  });
});

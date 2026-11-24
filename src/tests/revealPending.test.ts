/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { exportData } from '../domain';
import {
  clearRevealPending,
  isRevealPending,
  markRevealPending,
  resetRevealPending,
  revealPendingCount,
  subscribeRevealPending,
} from '../interaction/revealPending';
import { createGraveyardStore, STORAGE_KEY } from '../store';
import type { StorageLike } from '../store';
import { emptyData } from '../store/persistence';

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

afterEach(() => resetRevealPending());

describe('reveal-pending flag', () => {
  it('is set per project id, cleared per id, and clearing an unknown id does nothing', () => {
    markRevealPending('a');
    markRevealPending('b');
    expect(isRevealPending('a')).toBe(true);
    expect(isRevealPending('c')).toBe(false);
    clearRevealPending('a');
    clearRevealPending('nope');
    expect(isRevealPending('a')).toBe(false);
    expect(isRevealPending('b')).toBe(true);
    expect(revealPendingCount()).toBe(1);
  });

  it('tells subscribers only about real changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRevealPending(listener);
    markRevealPending('a');
    markRevealPending('a');
    clearRevealPending('zzz');
    clearRevealPending('a');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    markRevealPending('a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('Feature: graveyard-core, Property 74: the flag is UI-only, so the saved payload is the same with it set or cleared', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 6 }), (ids) => {
        const storage = new MemoryStorage();
        const store = createGraveyardStore(storage);
        const created = store.getState().commitBurial({ title: 'Moon map', description: 'A map' });
        if (!created.ok) throw new Error(created.error);
        const cleared = storage.items.get(STORAGE_KEY);
        const exported = JSON.stringify(store.getState().data);
        ids.forEach(markRevealPending);
        markRevealPending(created.project.id);
        expect(storage.items.get(STORAGE_KEY)).toBe(cleared);
        expect(JSON.stringify(store.getState().data)).toBe(exported);
        expect(JSON.stringify(store.getState().data)).not.toContain('reveal');
        resetRevealPending();
        expect(revealPendingCount()).toBe(0);
        expect(JSON.stringify(store.getState().data)).toBe(exported);
      }),
      { numRuns: 100 },
    );
  });

  it('is never part of the persisted data type or the store', () => {
    const files = import.meta.glob<string>(['../domain/*.ts', '../store/*.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const [file, source] of Object.entries(files)) expect(source, file).not.toMatch(/revealPending|RevealPending/);
  });
});

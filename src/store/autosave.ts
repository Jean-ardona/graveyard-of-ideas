import type { GraveyardStore } from './graveyardStore';
import { saveData } from './persistence';
import type { StorageLike } from './persistence';

export const AUTOSAVE_DELAY_MS = 500;

export interface Autosave {
  /** Writes any unsaved change immediately. */
  flush: () => void;
  /** Flushes, then stops listening. */
  dispose: () => void;
}

/**
 * Saves the store data after a quiet period and again when the page is hidden.
 * A failed save keeps the in-memory data and reports the error through the store.
 */
export function startAutosave(
  store: GraveyardStore,
  storage: StorageLike | null,
  delayMs: number = AUTOSAVE_DELAY_MS,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    dirty = false;
    store.getState().setSaveError(saveData(storage, store.getState().data));
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.data === previous.data) return;
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush();
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    flush,
    dispose: () => {
      flush();
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

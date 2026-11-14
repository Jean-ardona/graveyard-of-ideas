import { useStore } from 'zustand';
import { startAutosave } from './autosave';
import { createGraveyardStore } from './graveyardStore';
import type { GraveyardState } from './graveyardStore';
import { browserStorage } from './persistence';

const storage = browserStorage();

/** The one store the running app reads and writes; saved automatically. */
export const appStore = createGraveyardStore(storage);
startAutosave(appStore, storage);

/** React hook over the app store. */
export function useAppStore<T>(selector: (state: GraveyardState) => T): T {
  return useStore(appStore, selector);
}

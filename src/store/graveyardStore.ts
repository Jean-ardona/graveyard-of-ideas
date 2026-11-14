import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import {
  buryNewProject,
  exportData,
  honor,
  importData,
  QUALITY_LEVELS,
  remove,
  restAgain,
  resurrect,
  seedDemoProjects,
} from '../domain';
import type { AppData, ImportError, Project, QualityLevel } from '../domain';
import { loadData, saveData } from './persistence';
import type { LoadResult, StorageError, StorageLike } from './persistence';

export type PrepareImportResult =
  | { ok: true; projectCount: number }
  | { ok: false; error: ImportError };

type Mutation = { ok: true; projects: Project[] } | { ok: false };

export interface GraveyardState {
  data: AppData;
  /** Human-readable notice about the last load (for example corrupted data), or null. */
  warning: string | null;
  /** Last storage failure; the in-memory data is kept either way. */
  saveError: StorageError | null;
  /** Validated import waiting for the user to confirm the replacement. */
  pendingImport: AppData | null;

  buryNewProject: (...args: DomainArgs<typeof buryNewProject>) => ReturnType<typeof buryNewProject>;
  resurrect: (id: string, input: Parameters<typeof resurrect>[1]) => ReturnType<typeof resurrect>;
  restAgain: (id: string) => ReturnType<typeof restAgain>;
  honor: (id: string, input: Parameters<typeof honor>[1]) => ReturnType<typeof honor>;
  remove: (id: string) => ReturnType<typeof remove>;

  exportJson: () => string;
  prepareImport: (json: string) => PrepareImportResult;
  confirmReplace: () => boolean;
  cancelImport: () => void;

  /** Changes the saved quality level. Unknown values and no-op changes are ignored. */
  setQuality: (quality: QualityLevel) => void;

  dismissWarning: () => void;
  setSaveError: (error: StorageError | null) => void;
}

type DomainArgs<F extends (...args: never[]) => unknown> = Parameters<F> extends [infer Input, unknown, ...infer Rest]
  ? [Input, ...Rest]
  : never;

export type GraveyardStore = StoreApi<GraveyardState>;

/**
 * Loads the saved data and seeds the demo projects on a first launch (missing or reset data)
 * and saves them at once. Data that failed to load is never seeded and counts as seeded,
 * so the demo projects cannot appear later next to what the user had before.
 */
function startData(storage: StorageLike | null): LoadResult {
  const loaded = loadData(storage);
  if (loaded.warning !== null) return { ...loaded, data: { ...loaded.data, seeded: true } };
  if (loaded.data.seeded) return loaded;

  const data = seedDemoProjects(loaded.data);
  return { ...loaded, data, error: saveData(storage, data) };
}

/** Creates the store, loading (and validating) whatever the storage holds. */
export function createGraveyardStore(storage: StorageLike | null): GraveyardStore {
  const loaded = startData(storage);

  return createStore<GraveyardState>()((set, get) => {
    /** Applies a domain result: only a successful one changes the data. */
    function commit<R extends Mutation>(result: R): R {
      if (result.ok) set({ data: { ...get().data, projects: result.projects } });
      return result;
    }

    return {
      data: loaded.data,
      warning: loaded.warning,
      saveError: loaded.error,
      pendingImport: null,

      buryNewProject: (input, opts) => commit(buryNewProject(input, get().data.projects, opts)),
      resurrect: (id, input) => commit(resurrect(id, input, get().data.projects)),
      restAgain: (id) => commit(restAgain(id, get().data.projects)),
      honor: (id, input) => commit(honor(id, input, get().data.projects)),
      remove: (id) => commit(remove(id, get().data.projects)),

      exportJson: () => exportData(get().data),

      prepareImport: (json) => {
        const result = importData(json);
        if (!result.ok) {
          set({ pendingImport: null });
          return result;
        }
        set({ pendingImport: result.data });
        return { ok: true, projectCount: result.data.projects.length };
      },
      confirmReplace: () => {
        const pending = get().pendingImport;
        if (!pending) return false;
        set({ data: pending, pendingImport: null });
        return true;
      },
      cancelImport: () => set({ pendingImport: null }),

      setQuality: (quality) => {
        const { data } = get();
        if (!QUALITY_LEVELS.includes(quality) || data.prefs.quality === quality) return;
        set({ data: { ...data, prefs: { ...data.prefs, quality } } });
      },

      dismissWarning: () => set({ warning: null }),
      setSaveError: (error) => set({ saveError: error }),
    };
  });
}

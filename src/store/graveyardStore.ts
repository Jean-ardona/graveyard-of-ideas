import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { buryNewProject, exportData, honor, importData, remove, restAgain, resurrect } from '../domain';
import type { AppData, ImportError, Project } from '../domain';
import { loadData } from './persistence';
import type { StorageError, StorageLike } from './persistence';

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

  dismissWarning: () => void;
  setSaveError: (error: StorageError | null) => void;
}

type DomainArgs<F extends (...args: never[]) => unknown> = Parameters<F> extends [infer Input, unknown, ...infer Rest]
  ? [Input, ...Rest]
  : never;

export type GraveyardStore = StoreApi<GraveyardState>;

/** Creates the store, loading (and validating) whatever the storage holds. */
export function createGraveyardStore(storage: StorageLike | null): GraveyardStore {
  const loaded = loadData(storage);

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

      dismissWarning: () => set({ warning: null }),
      setSaveError: (error) => set({ saveError: error }),
    };
  });
}

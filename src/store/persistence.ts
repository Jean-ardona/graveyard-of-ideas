import { CURRENT_SCHEMA_VERSION, exportData, importData } from '../domain';
import type { AppData } from '../domain';

/** Minimal storage surface, satisfied by window.localStorage and by in-memory fakes. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'graveyard-of-ideas:data';
export const BACKUP_KEY = 'graveyard-of-ideas:backup';

export const CORRUPTED_WARNING =
  'Your saved data could not be read. A copy was kept aside and the graveyard starts empty.';
export const UNREADABLE_WARNING = 'Saved data could not be read from this browser. Starting empty.';

export type StorageError = 'quota_exceeded' | 'unavailable';

export type LoadResult = { data: AppData; warning: string | null; error: StorageError | null };

export function emptyData(): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projects: [],
    seeded: false,
    prefs: { quality: 'low', reducedMotion: false },
  };
}

/** Returns window.localStorage, or null when the browser denies access to it. */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function classify(error: unknown): StorageError {
  const quota =
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014);
  return quota ? 'quota_exceeded' : 'unavailable';
}

function keepBackup(storage: StorageLike, raw: string): void {
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Nothing else can be done: the raw value stays under the main key until the next save.
  }
}

/**
 * Reads and validates the saved data through importData. Never throws.
 * Invalid data is copied to BACKUP_KEY and the result is empty data plus a warning.
 */
export function loadData(storage: StorageLike | null): LoadResult {
  let raw: string | null;
  try {
    if (!storage) return { data: emptyData(), warning: UNREADABLE_WARNING, error: 'unavailable' };
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyData(), warning: UNREADABLE_WARNING, error: 'unavailable' };
  }
  if (raw === null) return { data: emptyData(), warning: null, error: null };

  const result = importData(raw);
  if (result.ok) return { data: result.data, warning: null, error: null };

  if (storage) keepBackup(storage, raw);
  return { data: emptyData(), warning: CORRUPTED_WARNING, error: null };
}

/** Writes the data as versioned JSON. Returns null on success or the kind of failure. */
export function saveData(storage: StorageLike | null, data: AppData): StorageError | null {
  if (!storage) return 'unavailable';
  try {
    storage.setItem(STORAGE_KEY, exportData(data));
    return null;
  } catch (error) {
    return classify(error);
  }
}

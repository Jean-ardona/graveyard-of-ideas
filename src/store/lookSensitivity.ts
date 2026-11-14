import type { StorageLike } from './persistence';

export const LOOK_SENSITIVITY_KEY = 'graveyard-of-ideas:look-sensitivity';
/** Radians of turn per pixel of mouse movement. */
export const DEFAULT_LOOK_SENSITIVITY = 0.0022;
export const MIN_LOOK_SENSITIVITY = 0.0003;
export const MAX_LOOK_SENSITIVITY = 0.02;

export function isValidLookSensitivity(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_LOOK_SENSITIVITY && value <= MAX_LOOK_SENSITIVITY;
}

/** Turns a stored string into a usable sensitivity, falling back to the default. */
export function parseLookSensitivity(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_LOOK_SENSITIVITY;
  const value = Number(raw);
  return isValidLookSensitivity(value) ? value : DEFAULT_LOOK_SENSITIVITY;
}

/** Reads the saved sensitivity. Never throws. */
export function loadLookSensitivity(storage: StorageLike | null): number {
  try {
    return parseLookSensitivity(storage ? storage.getItem(LOOK_SENSITIVITY_KEY) : null);
  } catch {
    return DEFAULT_LOOK_SENSITIVITY;
  }
}

/** Saves a valid sensitivity. Returns false when the value is invalid or storage fails. */
export function saveLookSensitivity(storage: StorageLike | null, value: number): boolean {
  if (!storage || !isValidLookSensitivity(value)) return false;
  try {
    storage.setItem(LOOK_SENSITIVITY_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

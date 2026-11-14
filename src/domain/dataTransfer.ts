import type { AppData } from './types';
import { CURRENT_SCHEMA_VERSION, DANGEROUS_KEYS, MAX_IMPORT_CHARS } from './schema';
import { isRecord, parseAppData } from './validation';

export type ImportError =
  | 'too_large'
  | 'invalid_json'
  | 'dangerous_key'
  | 'unsupported_version'
  | 'invalid_schema';

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: ImportError };

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migration hook: MIGRATIONS.get(n) upgrades a version n payload to version n + 1. */
const MIGRATIONS = new Map<number, Migration>();

/** Serializes the data as versioned JSON. Does not mutate its input. */
export function exportData(data: AppData, now: string = new Date().toISOString()): string {
  return JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now,
    projects: data.projects,
    seeded: data.seeded,
    prefs: data.prefs,
  });
}

function parseJson(json: string): { value: unknown } | { error: ImportError } {
  const scan = { dangerous: false };
  let value: unknown;
  try {
    value = JSON.parse(json, (key, parsed) => {
      if (DANGEROUS_KEYS.has(key)) scan.dangerous = true;
      return parsed;
    });
  } catch {
    return { error: 'invalid_json' };
  }
  return scan.dangerous ? { error: 'dangerous_key' } : { value };
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> | ImportError {
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return 'invalid_schema';
  if (version > CURRENT_SCHEMA_VERSION) return 'unsupported_version';

  let migrated = raw;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS.get(v);
    if (!step) return 'unsupported_version';
    migrated = step(migrated);
  }
  return migrated;
}

/**
 * Validates and migrates imported JSON. Never throws and never returns partial
 * data: the result is either a fully valid AppData or an error code.
 */
export function importData(json: unknown): ImportResult {
  if (typeof json !== 'string') return { ok: false, error: 'invalid_json' };
  if (json.length > MAX_IMPORT_CHARS) return { ok: false, error: 'too_large' };

  const parsed = parseJson(json);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  if (!isRecord(parsed.value)) return { ok: false, error: 'invalid_schema' };

  const migrated = migrate(parsed.value);
  if (typeof migrated === 'string') return { ok: false, error: migrated };

  const data = parseAppData(migrated);
  return data ? { ok: true, data } : { ok: false, error: 'invalid_schema' };
}

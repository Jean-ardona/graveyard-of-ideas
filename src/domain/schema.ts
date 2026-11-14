/** Version written by exportData and required (after migration) by importData. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Largest accepted import payload, in characters (about 5 MB of text). */
export const MAX_IMPORT_CHARS = 5 * 1024 * 1024;

/** Keys that could be used for prototype pollution; any payload containing one is rejected. */
export const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Maximum lengths and counts accepted for each field. */
export const LIMITS = {
  projects: 500,
  id: 100,
  title: 200,
  description: 5000,
  field: 2000,
  notes: 10000,
  links: 50,
  link: 2000,
  history: 200,
  historyText: 2000,
  timestamp: 40,
} as const;

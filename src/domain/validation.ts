import { MAX_SLOTS } from './types';
import type { AppData, HistoryEntry, Project, Status } from './types';
import { CURRENT_SCHEMA_VERSION, LIMITS } from './schema';
import { isSafeLink } from './links';

const INVALID = Symbol('invalid');
type Checked<T> = T | typeof INVALID;

const STATUSES: readonly Status[] = ['resting', 'resurrected', 'accomplished'];
const HISTORY_KINDS: readonly HistoryEntry['kind'][] = [
  'created',
  'buried',
  'resurrected',
  'rested',
  'honored',
  'action-done',
  'note',
];
const QUALITIES: readonly AppData['prefs']['quality'][] = ['low', 'medium', 'high'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, min = 0): Checked<string> {
  return typeof value === 'string' && value.length >= min && value.length <= max ? value : INVALID;
}

function nonBlankText(value: unknown, max: number): Checked<string> {
  const checked = text(value, max, 1);
  return checked !== INVALID && checked.trim() !== '' ? checked : INVALID;
}

function optionalText(value: unknown, max: number): Checked<string | undefined> {
  return value === undefined ? undefined : text(value, max);
}

/** Accepts only safe http(s) links (see isSafeLink). */
function webLink(value: unknown): Checked<string> {
  return isSafeLink(value) ? value : INVALID;
}

/** Like webLink, but an absent or empty value means "no link". */
function optionalWebLink(value: unknown): Checked<string | undefined> {
  if (value === undefined) return undefined;
  return value === '' ? '' : webLink(value);
}

function timestamp(value: unknown): Checked<string> {
  const checked = text(value, LIMITS.timestamp, 1);
  return checked !== INVALID && !Number.isNaN(Date.parse(checked)) ? checked : INVALID;
}

function optionalTimestamp(value: unknown): Checked<string | undefined> {
  return value === undefined ? undefined : timestamp(value);
}

function optionalSlot(value: unknown): Checked<number | undefined> {
  if (value === undefined) return undefined;
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_SLOTS
    ? (value as number)
    : INVALID;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): Checked<T> {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : INVALID;
}

function list<T>(value: unknown, max: number, parseItem: (item: unknown) => Checked<T>): Checked<T[]> {
  if (!Array.isArray(value) || value.length > max) return INVALID;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parseItem(item);
    if (parsed === INVALID) return INVALID;
    items.push(parsed);
  }
  return items;
}

/** Copy of the object without keys whose value is undefined. */
function compact<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;
}

function parseHistoryEntry(raw: unknown): Checked<HistoryEntry> {
  if (!isRecord(raw)) return INVALID;
  const fields = {
    at: timestamp(raw.at),
    kind: oneOf(raw.kind, HISTORY_KINDS),
    text: optionalText(raw.text, LIMITS.historyText),
  };
  if (Object.values(fields).includes(INVALID)) return INVALID;
  return compact(fields) as unknown as HistoryEntry;
}

function isChronological(history: HistoryEntry[]): boolean {
  return history.every((entry, i) => i === 0 || Date.parse(history[i - 1]!.at) <= Date.parse(entry.at));
}

function parseProject(raw: unknown): Checked<Project> {
  if (!isRecord(raw)) return INVALID;
  const fields = {
    id: text(raw.id, LIMITS.id, 1),
    title: nonBlankText(raw.title, LIMITS.title),
    description: nonBlankText(raw.description, LIMITS.description),
    goal: optionalText(raw.goal, LIMITS.field),
    abandonReason: optionalText(raw.abandonReason, LIMITS.field),
    epitaph: optionalText(raw.epitaph, LIMITS.field),
    notes: text(raw.notes, LIMITS.notes),
    links: list(raw.links, LIMITS.links, webLink),
    status: oneOf(raw.status, STATUSES),
    slot: optionalSlot(raw.slot),
    reducedVersion: optionalText(raw.reducedVersion, LIMITS.field),
    nextAction: optionalText(raw.nextAction, LIMITS.field),
    result: optionalText(raw.result, LIMITS.field),
    resultLink: optionalWebLink(raw.resultLink),
    history: list(raw.history, LIMITS.history, parseHistoryEntry),
    createdAt: timestamp(raw.createdAt),
    updatedAt: timestamp(raw.updatedAt),
    buriedAt: optionalTimestamp(raw.buriedAt),
    resurrectedAt: optionalTimestamp(raw.resurrectedAt),
  };
  if (Object.values(fields).includes(INVALID)) return INVALID;

  const project = compact(fields) as unknown as Project;
  const isResting = project.status === 'resting';
  if (isResting !== (project.slot !== undefined)) return INVALID;
  if (!isChronological(project.history)) return INVALID;
  return project;
}

function hasUniqueValues(values: unknown[]): boolean {
  return new Set(values).size === values.length;
}

function parsePrefs(raw: unknown): Checked<AppData['prefs']> {
  if (!isRecord(raw)) return INVALID;
  const quality = oneOf(raw.quality, QUALITIES);
  if (quality === INVALID || typeof raw.reducedMotion !== 'boolean') return INVALID;
  return { quality, reducedMotion: raw.reducedMotion };
}

/**
 * Strictly validates an already-migrated payload and returns a fresh AppData,
 * or null when anything is wrong. Unknown keys are dropped; nothing is mutated.
 */
export function parseAppData(raw: Record<string, unknown>): AppData | null {
  const projects = list(raw.projects, LIMITS.projects, parseProject);
  const prefs = parsePrefs(raw.prefs);
  if (projects === INVALID || prefs === INVALID || typeof raw.seeded !== 'boolean') return null;

  const resting = projects.filter((project) => project.status === 'resting');
  const hasUniqueIds = hasUniqueValues(projects.map((project) => project.id));
  const hasUniqueSlots = hasUniqueValues(resting.map((project) => project.slot));
  if (!hasUniqueIds || !hasUniqueSlots || resting.length > MAX_SLOTS) return null;

  return { schemaVersion: CURRENT_SCHEMA_VERSION, projects, seeded: raw.seeded, prefs };
}

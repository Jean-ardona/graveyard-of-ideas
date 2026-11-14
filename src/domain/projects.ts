import { Project } from './types';
import { allocateSlot } from './slots';
import { isSafeLink, invalidLink } from './links';
import type { InvalidLinkFailure } from './links';
import { LIMITS } from './schema';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ProjectInput {
  title: string;
  description: string;
  goal?: string;
  abandonReason?: string;
  epitaph?: string;
  notes?: string;
  links?: string[];
}

/** Injectable options — used by tests to make time and id deterministic. */
export interface ProjectCreateOptions {
  now?: string;  // ISO timestamp override
  id?: string;   // UUID override
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type BuryNewProjectResult =
  | { ok: true; project: Project; projects: Project[] }
  | { ok: false; error: 'invalid_title' | 'invalid_description' | 'graveyard_full' }
  | InvalidLinkFailure;

// ---------------------------------------------------------------------------
// Internal factory — not exported from index.ts
// ---------------------------------------------------------------------------

/**
 * Builds a fully-buried Project in a single step.
 * Internal: callers outside this module must use buryNewProject().
 */
function createBuriedProject(
  input: ProjectInput,
  slot: number,
  opts: ProjectCreateOptions = {},
): Project {
  const now = opts.now ?? new Date().toISOString();
  const id = opts.id ?? crypto.randomUUID();
  return {
    id,
    title: input.title.trim(),
    description: input.description.trim(),
    goal: input.goal,
    abandonReason: input.abandonReason,
    epitaph: input.epitaph,
    notes: input.notes ?? '',
    links: (input.links ?? []).map((link) => link.trim()),
    status: 'resting',
    slot,
    history: [
      { at: now, kind: 'created' },
      { at: now, kind: 'buried' },
    ],
    createdAt: now,
    updatedAt: now,
    buriedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates input, allocates a free grave slot, and creates a resting project
 * atomically. The input is never persisted on failure.
 *
 * Returns:
 *   { ok: true,  project, projects } — new project appended to a new array
 *   { ok: false, error }             — 'invalid_title' | 'invalid_description' | 'graveyard_full'
 *   { ok: false, error: 'invalid_link', message } — any link is not a safe http(s) URL; the whole input is rejected
 */
export function buryNewProject(
  input: ProjectInput,
  projects: Project[],
  opts: ProjectCreateOptions = {},
): BuryNewProjectResult {
  if (!input.title || input.title.trim() === '') {
    return { ok: false, error: 'invalid_title' };
  }
  if (!input.description || input.description.trim() === '') {
    return { ok: false, error: 'invalid_description' };
  }

  const links = input.links ?? [];
  if (links.length > LIMITS.links || !links.every(isSafeLink)) {
    return invalidLink;
  }

  const slot = allocateSlot(projects);
  if (slot === null) {
    return { ok: false, error: 'graveyard_full' };
  }

  const project = createBuriedProject(input, slot, opts);
  return { ok: true, project, projects: [...projects, project] };
}

// ---------------------------------------------------------------------------
// Lower-level helpers (used internally by resurrect / restAgain in task 2.2)
// ---------------------------------------------------------------------------

/**
 * Assigns a free grave slot to an existing project (e.g. for restAgain).
 * Pure: does not mutate the input project.
 */
export type ReburyResult =
  | { ok: true; project: Project }
  | { ok: false; error: 'graveyard_full' };

export function rebury(
  project: Project,
  projects: Project[],
  opts: ProjectCreateOptions = {},
): ReburyResult {
  const slot = allocateSlot(projects);
  if (slot === null) {
    return { ok: false, error: 'graveyard_full' };
  }
  const now = opts.now ?? new Date().toISOString();
  return {
    ok: true,
    project: {
      ...project,
      slot,
      status: 'resting',
      buriedAt: now,
      updatedAt: now,
      history: [...project.history, { at: now, kind: 'buried' }],
    },
  };
}

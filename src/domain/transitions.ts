import { Project } from './types';
import { rebury } from './projects';
import type { ProjectCreateOptions } from './projects';

// ---------------------------------------------------------------------------
// Input and result types
// ---------------------------------------------------------------------------

export interface ResurrectInput {
  nextAction: string;
  reducedVersion?: string;
}

export interface HonorInput {
  result?: string;
  resultLink?: string;
}

export type TransitionOptions = Pick<ProjectCreateOptions, 'now'>;

export type TransitionResult<E extends string> =
  | { ok: true; project: Project; projects: Project[] }
  | { ok: false; error: E | 'not_found' | 'invalid_transition' };

export type ResurrectResult = TransitionResult<'invalid_next_action'>;
export type RestAgainResult = TransitionResult<'graveyard_full'>;
export type HonorResult = TransitionResult<never>;

export type RemoveResult =
  | { ok: true; projects: Project[] }
  | { ok: false; error: 'not_found' };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function replaceProject(projects: Project[], updated: Project): Project[] {
  return projects.map((p) => (p.id === updated.id ? updated : p));
}

/** Copy of the project without its slot (only resting projects own a slot). */
function withoutSlot(project: Project): Project {
  const { slot: _slot, ...rest } = project;
  return rest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resting -> Resurrected. Requires a non-empty next action (after trimming).
 * Clears the slot and appends a 'resurrected' history entry.
 */
export function resurrect(
  id: string,
  input: ResurrectInput,
  projects: Project[],
  opts: TransitionOptions = {},
): ResurrectResult {
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, error: 'not_found' };
  if (project.status !== 'resting') return { ok: false, error: 'invalid_transition' };

  const nextAction = (input.nextAction ?? '').trim();
  if (nextAction === '') return { ok: false, error: 'invalid_next_action' };

  const now = opts.now ?? new Date().toISOString();
  const reducedVersion = input.reducedVersion?.trim();
  const updated: Project = {
    ...withoutSlot(project),
    status: 'resurrected',
    nextAction,
    reducedVersion: reducedVersion ? reducedVersion : project.reducedVersion,
    resurrectedAt: now,
    updatedAt: now,
    history: [...project.history, { at: now, kind: 'resurrected', text: nextAction }],
  };
  return { ok: true, project: updated, projects: replaceProject(projects, updated) };
}

/**
 * Resurrected -> Resting. Allocates a free slot; fails when the graveyard is full.
 */
export function restAgain(
  id: string,
  projects: Project[],
  opts: TransitionOptions = {},
): RestAgainResult {
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, error: 'not_found' };
  if (project.status !== 'resurrected') return { ok: false, error: 'invalid_transition' };

  const now = opts.now ?? new Date().toISOString();
  const buried = rebury(project, projects, { now });
  if (!buried.ok) return buried;

  const updated: Project = {
    ...buried.project,
    history: [...buried.project.history, { at: now, kind: 'rested' }],
  };
  return { ok: true, project: updated, projects: replaceProject(projects, updated) };
}

/**
 * Resurrected -> Accomplished. Clears the slot; result and link are optional.
 */
export function honor(
  id: string,
  input: HonorInput,
  projects: Project[],
  opts: TransitionOptions = {},
): HonorResult {
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, error: 'not_found' };
  if (project.status !== 'resurrected') return { ok: false, error: 'invalid_transition' };

  const now = opts.now ?? new Date().toISOString();
  const updated: Project = {
    ...withoutSlot(project),
    status: 'accomplished',
    result: input.result?.trim() || undefined,
    resultLink: input.resultLink?.trim() || undefined,
    updatedAt: now,
    history: [...project.history, { at: now, kind: 'honored', text: input.result?.trim() || undefined }],
  };
  return { ok: true, project: updated, projects: replaceProject(projects, updated) };
}

/**
 * Deletes a project from any status; its slot becomes free because the
 * project is no longer in the list.
 */
export function remove(id: string, projects: Project[]): RemoveResult {
  if (!projects.some((p) => p.id === id)) return { ok: false, error: 'not_found' };
  return { ok: true, projects: projects.filter((p) => p.id !== id) };
}

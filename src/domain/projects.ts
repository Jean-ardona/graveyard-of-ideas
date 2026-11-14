import { Project } from './types';
import { allocateSlot } from './slots';

export interface CreateProjectInput {
  title: string;
  description: string;
  goal?: string;
  abandonReason?: string;
  epitaph?: string;
  notes?: string;
  links?: string[];
}

/**
 * Builds a new Project shell. Status is 'resting' (burial is the only entry point).
 * No slot is assigned here — call bury() to assign one.
 */
export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    goal: input.goal,
    abandonReason: input.abandonReason,
    epitaph: input.epitaph,
    notes: input.notes ?? '',
    links: input.links ?? [],
    status: 'resting',
    history: [{ at: now, kind: 'created' }],
    createdAt: now,
    updatedAt: now,
  };
}

export type BuryResult =
  | { ok: true; project: Project }
  | { ok: false; error: 'no_free_slot' };

/**
 * Assigns a free grave slot to a project, records burial timestamp and history entry.
 * Pure: does not mutate the input project.
 * Returns { ok: false, error: 'no_free_slot' } when all 12 slots are taken.
 */
export function bury(project: Project, projects: Project[]): BuryResult {
  const slot = allocateSlot(projects);
  if (slot === null) {
    return { ok: false, error: 'no_free_slot' };
  }

  const now = new Date().toISOString();
  const updated: Project = {
    ...project,
    slot,
    status: 'resting',
    buriedAt: now,
    updatedAt: now,
    history: [...project.history, { at: now, kind: 'buried' }],
  };

  return { ok: true, project: updated };
}

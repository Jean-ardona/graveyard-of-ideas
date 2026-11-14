import type { Project } from './types';
import { LIMITS } from './schema';
import type { TransitionOptions } from './transitions';

/** Text fields a person can rewrite in a book. Title, status, slot and history are not among them. */
export const EDITABLE_FIELDS = [
  'description',
  'goal',
  'abandonReason',
  'epitaph',
  'notes',
  'reducedVersion',
  'nextAction',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type ProjectEdit = Partial<Record<EditableField, string>>;

export type EditProjectResult =
  | { ok: true; project: Project; projects: Project[] }
  | { ok: false; error: 'not_found' | 'invalid_description' | 'too_long' };

/** Longest accepted text for each field; the same limits the import validation enforces. */
export function maxLengthOf(field: EditableField): number {
  if (field === 'description') return LIMITS.description;
  if (field === 'notes') return LIMITS.notes;
  return LIMITS.field;
}

function isChange(project: Project, field: EditableField, value: string): boolean {
  const current = project[field] ?? '';
  return current !== value;
}

/**
 * Rewrites text fields of a project. The description must stay non-blank and every text must
 * respect its limit; otherwise nothing changes. An empty optional field is removed. When no
 * field actually changes, the same `projects` array is returned and `updatedAt` stays as it was.
 */
export function editProject(
  id: string,
  edit: ProjectEdit,
  projects: Project[],
  opts: TransitionOptions = {},
): EditProjectResult {
  const project = projects.find((p) => p.id === id);
  if (!project) return { ok: false, error: 'not_found' };

  const changes = EDITABLE_FIELDS.flatMap((field) => {
    const value = edit[field];
    return typeof value === 'string' && isChange(project, field, value) ? [[field, value] as const] : [];
  });

  for (const [field, value] of changes) {
    if (field === 'description' && value.trim() === '') return { ok: false, error: 'invalid_description' };
    if (value.length > maxLengthOf(field)) return { ok: false, error: 'too_long' };
  }
  if (changes.length === 0) return { ok: true, project, projects };

  const updated: Project = { ...project, updatedAt: opts.now ?? new Date().toISOString() };
  for (const [field, value] of changes) {
    if (field === 'description' || field === 'notes') updated[field] = value;
    else if (value === '') delete updated[field];
    else updated[field] = value;
  }
  return { ok: true, project: updated, projects: projects.map((p) => (p.id === id ? updated : p)) };
}

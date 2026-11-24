import type { Project } from '../domain';

/** The date shown for a project: the moment that put it in its current status, when known. */
export function projectDate(project: Project): string {
  switch (project.status) {
    case 'resting':
      return project.buriedAt ?? project.createdAt;
    case 'resurrected':
      return project.resurrectedAt ?? project.updatedAt;
    case 'accomplished':
      return project.updatedAt;
  }
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long' });

/** A date for display, or an empty string when the saved value is not a date. */
export function formatProjectDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

import type { Project } from '../domain';
import { COPY, projectRow } from '../ui/copy';
import { Button } from '../ui/kit';
import { formatProjectDate, projectDate } from './projectDate';

const STATUS_LABEL = {
  resting: COPY.grimoire.resting,
  resurrected: COPY.grimoire.resurrected,
  accomplished: COPY.grimoire.accomplished,
} as const;

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

/** Read-only view of one project. Editing comes with the manage task. */
export default function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const rows: readonly (readonly [string, string | undefined])[] = [
    [COPY.grimoire.detailStatus, projectRow(STATUS_LABEL[project.status], formatProjectDate(projectDate(project)))],
    [COPY.book.idea, project.description],
    [COPY.grimoire.detailGoal, project.goal],
    [COPY.book.whyItRests, project.abandonReason],
    [COPY.book.nextAction, project.nextAction],
    [COPY.grimoire.detailNotes, project.notes],
  ];
  return (
    <article className="grimoire-detail">
      <h3>{project.title}</h3>
      <dl>
        {rows
          .filter(([, value]) => value !== undefined && value.trim() !== '')
          .map(([label, value]) => (
            <div key={label} className="grimoire-detail-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <Button onClick={onBack}>{COPY.grimoire.back}</Button>
    </article>
  );
}

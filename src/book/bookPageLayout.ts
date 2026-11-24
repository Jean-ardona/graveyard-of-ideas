import type { EditableField, Project } from '../domain';
import { COPY, buriedOn } from '../ui/copy';

export interface PageField {
  field: EditableField;
  label: string;
  value: string;
  multiline: boolean;
}

export interface ResurrectButton {
  label: string;
  disabled: boolean;
}

/** What one page shows. The overlay renders it; nothing here touches the DOM. */
export interface PageDescriptor {
  title?: string;
  subtitle?: string;
  fields: PageField[];
  resurrectButton?: ResurrectButton;
}

export type PageProject = Pick<
  Project,
  'title' | 'buriedAt' | 'abandonReason' | 'description' | 'nextAction' | 'reducedVersion'
>;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long' });

function buriedLine(buriedAt: string | undefined): string | undefined {
  if (!buriedAt) return undefined;
  const date = new Date(buriedAt);
  return Number.isNaN(date.getTime()) ? undefined : buriedOn(dateFormat.format(date));
}

/**
 * The three pages of a book: title and date, reason and idea, next action with the optional
 * smaller version and the resurrection button. Goal, epitaph and notes stay in the grimoire.
 */
export function layoutPages(
  project: PageProject,
  hasResurrectHandler: boolean,
): [PageDescriptor, PageDescriptor, PageDescriptor] {
  return [
    { title: project.title, subtitle: buriedLine(project.buriedAt), fields: [] },
    {
      fields: [
        { field: 'abandonReason', label: COPY.book.whyItRests, value: project.abandonReason ?? '', multiline: true },
        { field: 'description', label: COPY.book.idea, value: project.description, multiline: true },
      ],
    },
    {
      fields: [
        { field: 'nextAction', label: COPY.book.nextAction, value: project.nextAction ?? '', multiline: false },
        {
          field: 'reducedVersion',
          label: COPY.book.smallerVersion,
          value: project.reducedVersion ?? '',
          multiline: true,
        },
      ],
      resurrectButton: { label: COPY.book.resurrect, disabled: !hasResurrectHandler },
    },
  ];
}

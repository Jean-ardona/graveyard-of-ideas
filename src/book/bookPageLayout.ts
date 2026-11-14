import type { EditableField, Project } from '../domain';

export interface PageField {
  field: EditableField;
  label: string;
  value: string;
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

type PageProject = Pick<Project, 'title' | 'buriedAt' | 'abandonReason' | 'description' | 'nextAction'>;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long' });

function buriedLine(buriedAt: string | undefined): string | undefined {
  if (!buriedAt) return undefined;
  const date = new Date(buriedAt);
  return Number.isNaN(date.getTime()) ? undefined : `Buried on ${dateFormat.format(date)}`;
}

/** The three pages of a book: title and date, reason and idea, next action and resurrection. */
export function layoutPages(
  project: PageProject,
  hasResurrectHandler: boolean,
): [PageDescriptor, PageDescriptor, PageDescriptor] {
  return [
    { title: project.title, subtitle: buriedLine(project.buriedAt), fields: [] },
    {
      fields: [
        { field: 'abandonReason', label: 'Why it rests', value: project.abandonReason ?? '' },
        { field: 'description', label: 'The idea in one line', value: project.description },
      ],
    },
    {
      fields: [{ field: 'nextAction', label: 'Realistic next action', value: project.nextAction ?? '' }],
      resurrectButton: { label: 'Resurrect this project', disabled: !hasResurrectHandler },
    },
  ];
}

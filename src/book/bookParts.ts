import type { EditableField } from '../domain';

/** The four parts of a book and the project fields written in each. Pure data. */

export type BookPartId = 'ambition' | 'abandonment' | 'remains' | 'secondChance';

export interface BookFieldSpec {
  field: EditableField;
  label: string;
  multiline: boolean;
}

export interface BookPartSpec {
  id: BookPartId;
  title: string;
  fields: readonly BookFieldSpec[];
}

export const BOOK_PARTS: readonly BookPartSpec[] = [
  {
    id: 'ambition',
    title: 'Ambition',
    fields: [
      { field: 'description', label: 'What it was meant to be', multiline: true },
      { field: 'goal', label: 'The goal', multiline: false },
    ],
  },
  {
    id: 'abandonment',
    title: 'Abandonment',
    fields: [
      { field: 'abandonReason', label: 'Why it stopped', multiline: true },
      { field: 'epitaph', label: 'Epitaph', multiline: false },
    ],
  },
  {
    id: 'remains',
    title: 'Remains',
    fields: [{ field: 'notes', label: 'What is left: notes, pieces, lessons', multiline: true }],
  },
  {
    id: 'secondChance',
    title: 'Second chance',
    fields: [
      { field: 'reducedVersion', label: 'A smaller version', multiline: true },
      { field: 'nextAction', label: 'The first step back', multiline: false },
    ],
  },
];

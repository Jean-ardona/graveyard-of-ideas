import type { ProjectInput } from './projects';
import { isSafeLink } from './links';
import { LIMITS } from './schema';

export type RitualStepId = 'title' | 'description' | 'goal' | 'abandonReason' | 'epitaph' | 'notes' | 'links';

export type RitualStepKind = 'line' | 'multiline';

export interface RitualStep {
  readonly id: RitualStepId;
  readonly required: boolean;
  readonly kind: RitualStepKind;
}

/** The pages of the burial ritual, in order. Only the first two are required (Requirement 3.5). */
export const RITUAL_STEPS: readonly RitualStep[] = [
  { id: 'title', required: true, kind: 'line' },
  { id: 'description', required: true, kind: 'multiline' },
  { id: 'goal', required: false, kind: 'multiline' },
  { id: 'abandonReason', required: false, kind: 'multiline' },
  { id: 'epitaph', required: false, kind: 'line' },
  { id: 'notes', required: false, kind: 'multiline' },
  { id: 'links', required: false, kind: 'multiline' },
];

export type RitualStepError = 'invalid_title' | 'invalid_description' | 'too_long' | 'invalid_link';

/** What the person has typed so far. `links` is raw text, one link per line. */
export type RitualDraft = Record<RitualStepId, string>;

export function emptyDraft(): RitualDraft {
  return { title: '', description: '', goal: '', abandonReason: '', epitaph: '', notes: '', links: '' };
}

const MAX_LENGTH: Record<Exclude<RitualStepId, 'links'>, number> = {
  title: LIMITS.title,
  description: LIMITS.description,
  goal: LIMITS.field,
  abandonReason: LIMITS.field,
  epitaph: LIMITS.field,
  notes: LIMITS.notes,
};

/** Non-blank lines of a text, trimmed. */
function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Checks one page. Returns null when the text is acceptable, otherwise an error code.
 * Never accepts something `buryNewProject` would refuse (except a full graveyard, which is not a text problem).
 */
export function validateStep(id: RitualStepId, text: string): RitualStepError | null {
  if (id === 'links') {
    const lines = linesOf(text);
    return lines.length <= LIMITS.links && lines.every(isSafeLink) ? null : 'invalid_link';
  }
  const trimmed = text.trim();
  if (id === 'title' && trimmed === '') return 'invalid_title';
  if (id === 'description' && trimmed === '') return 'invalid_description';
  return trimmed.length > MAX_LENGTH[id] ? 'too_long' : null;
}

/** Index of the first step whose text is not acceptable, or null when every step passes. */
export function firstInvalidStep(draft: RitualDraft): number | null {
  const index = RITUAL_STEPS.findIndex((step) => validateStep(step.id, draft[step.id]) !== null);
  return index === -1 ? null : index;
}

/** The tomb can be sealed when title and description are filled and every typed field is valid. */
export function canSeal(draft: RitualDraft): boolean {
  return firstInvalidStep(draft) === null;
}

/** Builds the input of `buryNewProject`: trimmed text, empty optional fields left out, links split per line. */
export function draftToInput(draft: RitualDraft): ProjectInput {
  const optional = (text: string): string | undefined => (text.trim() === '' ? undefined : text.trim());
  const links = linesOf(draft.links);
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    goal: optional(draft.goal),
    abandonReason: optional(draft.abandonReason),
    epitaph: optional(draft.epitaph),
    notes: optional(draft.notes),
    links: links.length === 0 ? undefined : links,
  };
}

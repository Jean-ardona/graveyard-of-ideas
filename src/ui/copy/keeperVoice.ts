import type {
  BuryNewProjectResult,
  EditProjectResult,
  HonorResult,
  ImportError,
  RemoveResult,
  ReburyResult,
  RestAgainResult,
  ResurrectResult,
} from '../../domain';
import type { StorageError } from '../../store/persistence';

/**
 * The keeper's voice: the only module with user-facing strings. Short, calm, slightly poetic.
 * No exclamation marks, no blame, no counters of time away, no streaks.
 */

type ErrorOf<R> = R extends { ok: false; error: infer E } ? E : never;

/** Every error code the domain can return. */
type ResultOf =
  | BuryNewProjectResult
  | ResurrectResult
  | RestAgainResult
  | HonorResult
  | RemoveResult
  | EditProjectResult
  | ReburyResult;

export type DomainErrorCode = ErrorOf<ResultOf> | ImportError;

export type StorageErrorCode = StorageError;

const ERRORS: Record<DomainErrorCode | StorageErrorCode, string> = {
  invalid_title: 'Every idea needs a title.',
  invalid_description: 'Say a few words about the idea first.',
  graveyard_full: 'The graveyard has no free tomb right now.',
  invalid_link: 'Links must be valid http or https addresses.',
  not_found: 'That book is no longer here.',
  invalid_transition: 'That cannot be done from where this idea rests.',
  invalid_next_action: 'Name one small next step to wake the idea.',
  too_long: 'That is more than a page can hold.',
  too_large: 'That file is larger than the graveyard can take.',
  invalid_json: 'That file could not be read.',
  dangerous_key: 'That file holds something the graveyard will not accept.',
  unsupported_version: 'That file comes from a newer graveyard.',
  invalid_schema: 'That file does not look like a graveyard.',
  quota_exceeded: 'This browser has no room left to save. Your work stays open for now.',
  unavailable: 'This browser cannot save right now. Your work stays open for now.',
};

export const COPY = {
  menu: { calmMode: 'Calm mode' },
  prompts: {
    key: 'E — ',
    resume: 'Click to resume',
    enterHut: "Enter the keeper's hut",
  },
  grimoire: {
    back: 'Back to the list',
    resting: 'Resting',
    resurrected: 'Resurrected',
    accomplished: 'Accomplished',
    detailStatus: 'Where it stands',
    detailGoal: 'The goal',
    detailNotes: 'What remains',
  },
  hints: {
    controls: [
      'Move with WASD, ZQSD or the arrow keys. Hold Shift to sprint.',
      'Click to look around with the mouse. Press Esc to free the cursor.',
    ],
  },
  book: {
    close: 'Close the book',
    resurrect: 'Resurrect this project',
    whyItRests: 'Why it rests',
    idea: 'The idea in one line',
    nextAction: 'Realistic next action',
    smallerVersion: 'A smaller version (optional)',
    descriptionEmpty: 'The first page cannot be left empty. Your last saved words are kept.',
  },
  resurrection: {
    dialog: 'Wake this idea',
    intro: 'Here is where it starts again.',
    nextActionLabel: 'The first step',
    reducedLabel: 'The smaller version',
    reducedEncouragement:
      'A smaller version makes the first step lighter. Add one on this page, or go on without it.',
    confirm: 'Resurrect',
    back: 'Not yet',
  },
  ritual: {
    prompt: 'E - Write a new project',
    /** The prompt without its key hint: the interaction prompt adds "E" itself. */
    promptLabel: 'Write a new project',
    dialog: 'Write a new project',
    steps: {
      title: { title: 'The name', label: 'What is it called?', hint: 'A short name for the idea.' },
      description: {
        title: 'The idea',
        label: 'What is the idea?',
        hint: 'A few words about what it was meant to be. Shift+Enter adds a line.',
      },
      goal: { title: 'The goal', label: 'What did it hope to reach?', hint: 'Optional. A sentence is enough.' },
      abandonReason: {
        title: 'Why it rests',
        label: 'Why does it rest?',
        hint: 'Optional. Not knowing the reason is fine.',
      },
      epitaph: { title: 'The epitaph', label: 'One line for the stone', hint: 'Optional. It will be carved on the tomb.' },
      notes: { title: 'The notes', label: 'What should be remembered?', hint: 'Optional. Anything that helps a later restart.' },
      links: { title: 'The links', label: 'Links, one per line', hint: 'Optional. Only http and https addresses. They stay as plain text.' },
    },
    back: 'Back',
    skip: 'Skip',
    cancel: 'Cancel',
    next: 'Next',
    seal: 'Seal the tomb',
    skipHint: 'Optional pages can be skipped. Ctrl+Enter seals the tomb from any page.',
    /** Shown while the burial cinematic plays. */
    cinematicHint: 'Escape, Enter or Space skips this.',
    graveyardFull: 'The graveyard has no free tomb right now. Nothing was written.',
  },
  screens: {
    noWebgl: 'WebGL is not available in this browser.',
    noWebglHelp:
      'Try enabling hardware acceleration in your browser settings, or use a different browser. All project data is still accessible below.',
    contextLost: 'The WebGL context was lost.',
    contextLostHelp:
      'This can happen if the GPU driver reset or the tab was backgrounded too long. Reload the page to restore the scene.',
    reload: 'Reload',
  },
  errors: ERRORS,
} as const;

/** Prompt text for a tomb; the prompt adds the key hint. */
export function openPrompt(name: string): string {
  return `Open ${name}`;
}

/** First-page line with the burial date, already formatted. */
export function buriedOn(date: string): string {
  return `Buried on ${date}`;
}

/** Project detail row: the title, then its date when there is one. */
export function projectRow(title: string, date: string): string {
  return date === '' ? title : `${title}, ${date}`;
}

/** Caption under a page, for example "Page 2 of 3". */
export function pageCaptionText(page: number, total: number): string {
  return `Page ${page} of ${total}`;
}

/** Calm note after the quality was lowered automatically. */
export function qualityLowered(level: string): string {
  return `Quality lowered to ${level} to keep the night smooth.`;
}

/** Developer overlay line. */
export function statsLine(fps: number, calls: number, level: string): string {
  return `${fps} fps, ${calls} draws, ${level} (F2)`;
}

export function errorMessage(code: DomainErrorCode | StorageErrorCode): string {
  return ERRORS[code];
}

/** Words and shapes the voice never uses: blame, pressure, time-away counters and streaks. */
export const BANNED_PATTERNS: readonly RegExp[] = [
  /\b(failed|failure|forgot|forgotten|lazy|wasted|overdue|neglected|abandoned you)\b/i,
  /\btoo late\b/i,
  /\bgive up\b/i,
  /\byou (should|must|have to|need to)\b/i,
  /\bstreaks?\b/i,
  /\b\d+\s*(days?|weeks?|months?|years?)\b/i,
  /\b(ago|since you)\b/i,
];

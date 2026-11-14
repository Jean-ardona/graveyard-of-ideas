import type { BookPhase } from '../book/bookSequence';

export type UiMode =
  | 'exploring'
  | 'openingGrave'
  | 'reading'
  | 'closingGrave'
  | 'burying'
  | 'resurrecting'
  | 'paused';

/** UI mode shown for a book phase. The book machine is the only writer of the three grave modes. */
export function uiModeForPhase(phase: BookPhase): UiMode {
  switch (phase) {
    case 'closed':
      return 'exploring';
    case 'open':
      return 'reading';
    case 'closing':
      return 'closingGrave';
    default:
      return 'openingGrave';
  }
}

/** A new major cinematic may start only while the player is exploring. */
export function canStartCinematic(mode: UiMode): boolean {
  return mode === 'exploring';
}

export interface OpenGuardInput {
  mode: UiMode;
  pointerAllowsMovement: boolean;
  projectResting: boolean;
}

/** Whether OPEN is accepted: exploring, the pointer allows movement, and the project rests. */
export function canOpenBook(input: OpenGuardInput): boolean {
  return canStartCinematic(input.mode) && input.pointerAllowsMovement && input.projectResting;
}

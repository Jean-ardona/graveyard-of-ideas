import type { BookPhase } from '../book/bookSequence';
import type { RitualPhase } from './ritualMachine';

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

/** UI mode shown for a ritual phase. The ritual machine is the only writer of `burying`. */
export function uiModeForRitualPhase(phase: RitualPhase): UiMode {
  return phase === 'idle' ? 'exploring' : 'burying';
}

/** A new major cinematic may start only while the player is exploring. */
export function canStartCinematic(mode: UiMode): boolean {
  return mode === 'exploring';
}

export interface RitualGuardInput {
  mode: UiMode;
  pointerAllowsMovement: boolean;
  /** `allocateSlot` returned a free slot. */
  slotFree: boolean;
  bookOpen: boolean;
}

/** The burial ritual starts only while exploring, free to walk, with a free tomb and no book open. */
export function canStartRitual(input: RitualGuardInput): boolean {
  return canStartCinematic(input.mode) && input.pointerAllowsMovement && input.slotFree && !input.bookOpen;
}

export interface ResurrectionGuardInput {
  mode: UiMode;
  /** The burial ritual phase. */
  ritualPhase: RitualPhase;
  projectResting: boolean;
  /** Another resurrection is already running. */
  resurrecting: boolean;
}

/** A resurrection starts from the open book (`reading`), alone: no ritual, no other resurrection, a resting project. */
export function canStartResurrection(input: ResurrectionGuardInput): boolean {
  return input.mode === 'reading' && input.ritualPhase === 'idle' && input.projectResting && !input.resurrecting;
}

export interface OpenGuardInput {
  mode: UiMode;
  pointerAllowsMovement: boolean;
  projectResting: boolean;
  /** The player stands on the book's side of the tomb. */
  playerInFront: boolean;
  /** The burial ritual phase: a book cannot open while it is not `idle`. */
  ritualPhase?: RitualPhase;
}

/**
 * Whether OPEN is accepted: exploring, the pointer allows movement, the project rests,
 * the player is in front of the tomb and no burial ritual runs.
 */
export function canOpenBook(input: OpenGuardInput): boolean {
  return (
    (input.ritualPhase ?? 'idle') === 'idle' &&
    canStartCinematic(input.mode) &&
    input.pointerAllowsMovement &&
    input.projectResting &&
    input.playerInFront
  );
}

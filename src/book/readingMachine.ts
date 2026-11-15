import { canOpenBook, uiModeForPhase } from '../interaction/uiMode';
import type { OpenGuardInput, UiMode } from '../interaction/uiMode';
import {
  applySequenceEvent,
  clampDelta,
  createSequenceProgress,
  createSequenceState,
  tickSequence,
  writeProgress,
} from './bookSequence';
import type { BookPhase, SequenceProgress, SequenceState } from './bookSequence';
import {
  beginDrag,
  cancelDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  isIdle,
  resetPageTurn,
  settleNow,
  tickPageTurn,
  turnByKey,
} from './pageTurn';
import type { PageTurnState, TurnDirection } from './pageTurn';

export interface ReadingMachine {
  /** Mutable records, created once. Read them each frame; never replace them. */
  readonly sequence: SequenceState;
  readonly progress: SequenceProgress;
  readonly pages: PageTurnState;
  /** Starts the opening sequence if the guard passes. Returns whether it was accepted. */
  open(guard: OpenGuardInput): boolean;
  close(): void;
  skip(): void;
  tick(dt: number): void;
  /** Page events work only while the book is open. */
  beginDrag(): void;
  dragTo(dxPx: number, pageWidthPx: number): void;
  endDrag(): void;
  cancelDrag(): void;
  turnPage(direction: TurnDirection): void;
  /** Ends a settling turn at once (reduced motion). A close that was waiting for the pages then goes ahead. */
  finishTurn(): void;
  /** Derived selectors. */
  phase(): BookPhase;
  uiMode(): UiMode;
  pointerLockReleased(): boolean;
  inputLocked(): boolean;
  /** Calls `listener` after a discrete change (phase, page status or page index). */
  subscribe(listener: () => void): () => void;
  /** Grows with every discrete change; a snapshot for `useSyncExternalStore`. */
  version(): number;
}

export function createReadingMachine(): ReadingMachine {
  const sequence = createSequenceState();
  const progress = createSequenceProgress();
  const pages = createPageTurnState();
  const listeners = new Set<() => void>();
  let version = 0;
  let seenPhase = sequence.phase;
  let seenStatus = pages.status;
  let seenIndex = pages.index;

  /** Runs after every mutation: keeps the invariants, derives progress and reports discrete changes. */
  function settled(): void {
    if (sequence.phase === 'closed') resetPageTurn(pages);
    writeProgress(sequence.t, progress);
    if (sequence.phase === seenPhase && pages.status === seenStatus && pages.index === seenIndex) return;
    seenPhase = sequence.phase;
    seenStatus = pages.status;
    seenIndex = pages.index;
    version += 1;
    listeners.forEach((listener) => listener());
  }

  function whileOpen(change: () => void): void {
    if (sequence.phase !== 'open') return;
    change();
    settled();
  }

  return {
    sequence,
    progress,
    pages,
    open(guard) {
      if (sequence.phase !== 'closed' || !canOpenBook(guard)) return false;
      applySequenceEvent(sequence, 'OPEN', true);
      settled();
      return true;
    },
    close() {
      applySequenceEvent(sequence, 'CLOSE', isIdle(pages));
      settled();
    },
    skip() {
      applySequenceEvent(sequence, 'SKIP', isIdle(pages));
      settled();
    },
    tick(dt) {
      const step = clampDelta(dt);
      if (sequence.phase === 'open') tickPageTurn(pages, step);
      tickSequence(sequence, step, isIdle(pages));
      settled();
    },
    beginDrag: () => whileOpen(() => beginDrag(pages)),
    dragTo: (dxPx, pageWidthPx) => whileOpen(() => dragTo(pages, dxPx, pageWidthPx)),
    endDrag: () => whileOpen(() => endDrag(pages)),
    cancelDrag: () => whileOpen(() => cancelDrag(pages)),
    turnPage: (direction) => whileOpen(() => turnByKey(pages, direction)),
    finishTurn: () =>
      whileOpen(() => {
        settleNow(pages);
        tickSequence(sequence, 0, isIdle(pages));
      }),
    phase: () => sequence.phase,
    uiMode: () => uiModeForPhase(sequence.phase),
    pointerLockReleased: () => sequence.phase === 'open',
    inputLocked: () => sequence.phase !== 'closed',
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

/** The one machine of the app. */
export const readingMachine = createReadingMachine();

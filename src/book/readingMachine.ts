import { canOpenBook, uiModeForPhase } from '../interaction/uiMode';
import type { OpenGuardInput, UiMode } from '../interaction/uiMode';
import {
  applySequenceEvent,
  clampDelta,
  createSequenceProgress,
  createSequenceState,
  startClosingFromCover,
  tickSequence,
  writeProgress,
} from './bookSequence';
import type { BookPhase, SequenceProgress, SequenceState } from './bookSequence';
import { coverOpenFraction } from './coverScrub';
import {
  beginDrag,
  cancelDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  isIdle,
  resetPageTurn,
  settleNow,
  takeCloseRequest,
  tickPageTurn,
  turnByKey,
} from './pageTurn';
import type { DragSide, PageTurnState, TurnDirection } from './pageTurn';

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
  beginDrag(side?: DragSide): void;
  dragTo(dxPx: number, pageWidthPx: number): void;
  /** Releases the drag. A closing gesture past the threshold closes the book. */
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
  let seenTurning = pages.direction !== null;
  let seenCloseDrag = pages.closeDrag;

  /** Runs after every mutation: keeps the invariants, derives progress and reports discrete changes. */
  function settled(): void {
    if (sequence.phase === 'closed') resetPageTurn(pages);
    writeProgress(sequence.t, progress);
    const turning = pages.direction !== null;
    const unchanged =
      sequence.phase === seenPhase && pages.status === seenStatus && pages.index === seenIndex && turning === seenTurning &&
      pages.closeDrag === seenCloseDrag;
    if (unchanged) return;
    seenCloseDrag = pages.closeDrag;
    seenPhase = sequence.phase;
    seenStatus = pages.status;
    seenIndex = pages.index;
    seenTurning = turning;
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
    beginDrag: (side = 'right') => whileOpen(() => beginDrag(pages, side)),
    dragTo: (dxPx, pageWidthPx) => whileOpen(() => dragTo(pages, dxPx, pageWidthPx)),
    endDrag: () =>
      whileOpen(() => {
        const scrubbed = coverOpenFraction(pages);
        endDrag(pages);
        // A closing gesture past the threshold leaves the pages idle: the close starts at once, from
        // the scrubbed cover angle. Below it the cover settles back to open.
        if (takeCloseRequest(pages)) startClosingFromCover(sequence, scrubbed);
      }),
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

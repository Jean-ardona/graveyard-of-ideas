import { AUTO_TURN_SECONDS, PAGE_TURN } from './bookTimings';

/** One page per leaf. */
export const PAGE_COUNT = 3;
/**
 * The end position: every leaf turned, the inside of the back board showing on the right. It comes
 * after the last page (index `PAGE_COUNT - 1`), so `index` runs from 0 to `END_INDEX`.
 */
export const END_INDEX = PAGE_COUNT;

export type TurnDirection = 'next' | 'prev';
export type TurnStatus = 'idle' | 'dragging' | 'settling';
/** The page a drag starts on: the right page turns forward, the left page turns back. */
export type DragSide = 'left' | 'right';
/** What a drag from a side does: turn a page, or close the book when there is no page to turn. */
export type ZoneAction = TurnDirection | 'close';

export interface PageTurnState {
  index: number;
  status: TurnStatus;
  direction: TurnDirection | null;
  /** Completion of the turn (or of the closing gesture) in progress, 0..1. */
  progress: number;
  settleTarget: 0 | 1;
  /** The side the current drag started on; null when no drag is active. */
  side: DragSide | null;
  /** The drag in progress is a closing gesture: no leaf moves, only `progress` follows the pointer. */
  closeDrag: boolean;
  /** Set by a released closing gesture; the reading machine takes it and dispatches CLOSE. */
  closeRequested: boolean;
  /** The settling turn is an automatic one (a close from the last page): it takes `AUTO_TURN_SECONDS`. */
  autoTurn: boolean;
}

export function createPageTurnState(): PageTurnState {
  return {
    index: 0,
    status: 'idle',
    direction: null,
    progress: 0,
    settleTarget: 0,
    side: null,
    closeDrag: false,
    closeRequested: false,
    autoTurn: false,
  };
}

/** Back to page 0, at rest. */
export function resetPageTurn(state: PageTurnState): void {
  state.index = 0;
  rest(state);
  state.closeRequested = false;
}

export function isIdle(state: PageTurnState): boolean {
  return state.status === 'idle';
}

function canTurn(state: PageTurnState, direction: TurnDirection): boolean {
  return direction === 'next' ? state.index < END_INDEX : state.index > 0;
}

/**
 * What dragging from `side` does at position `index`. The right page turns forward (the last page
 * turns into the end position) and, in the end position, closes the book with the back board. The
 * left page turns back and, on the first page, closes the book.
 */
export function zoneAction(index: number, side: DragSide): ZoneAction {
  if (side === 'right') return index < END_INDEX ? 'next' : 'close';
  return index > 0 ? 'prev' : 'close';
}

/** Starts a drag on a side. Only a page at rest can be dragged. */
export function beginDrag(state: PageTurnState, side: DragSide = 'right'): void {
  if (state.status !== 'idle') return;
  state.status = 'dragging';
  state.side = side;
  state.direction = null;
  state.closeDrag = false;
  state.progress = 0;
}

/**
 * Follows the pointer. `dxPx` is the horizontal distance from the drag start (negative is left).
 * Only the direction that belongs to the starting side counts: leftward from the right page,
 * rightward from the left page. The other way does nothing. Once the dead zone is passed in the
 * right way the action (turn or close) is chosen and stays locked for the rest of the drag.
 */
export function dragTo(state: PageTurnState, dxPx: number, pageWidthPx: number): void {
  if (state.status !== 'dragging' || state.side === null || Number.isNaN(dxPx)) return;
  const along = state.side === 'right' ? -dxPx : dxPx;
  if (state.direction === null && !state.closeDrag) {
    if (along < PAGE_TURN.deadzonePx) return;
    const action = zoneAction(state.index, state.side);
    if (action === 'close') state.closeDrag = true;
    else state.direction = action;
  }
  const full = pageWidthPx * PAGE_TURN.fullTurnRatio;
  state.progress = full > 0 ? Math.min(Math.max(along / full, 0), 1) : 0;
}

function settle(state: PageTurnState, target: 0 | 1): void {
  state.status = 'settling';
  state.settleTarget = target;
}

function rest(state: PageTurnState): void {
  state.status = 'idle';
  state.direction = null;
  state.progress = 0;
  state.settleTarget = 0;
  state.side = null;
  state.closeDrag = false;
  state.autoTurn = false;
}

/**
 * Releases the drag: at least the commit threshold completes the turn, less returns the page.
 * A closing gesture past the threshold requests the close and rests at once (the reading machine
 * has read the progress by then); below it the gesture settles back to 0, like a returned page.
 */
export function endDrag(state: PageTurnState): void {
  if (state.status !== 'dragging') return;
  if (state.closeDrag) {
    if (state.progress >= PAGE_TURN.commitThreshold) {
      rest(state);
      state.closeRequested = true;
    } else settleBack(state);
  } else if (state.direction === null) rest(state);
  else settle(state, state.progress >= PAGE_TURN.commitThreshold ? 1 : 0);
}

/** Returns whether a closing gesture was released past the threshold, and forgets it. */
export function takeCloseRequest(state: PageTurnState): boolean {
  const requested = state.closeRequested;
  state.closeRequested = false;
  return requested;
}

/** A closing gesture that did not commit returns to 0; with nothing to return it just rests. */
function settleBack(state: PageTurnState): void {
  if (state.progress > 0) settle(state, 0);
  else rest(state);
}

/** Abandons the drag; the page (or the cover) always returns and no close is requested. */
export function cancelDrag(state: PageTurnState): void {
  if (state.status !== 'dragging') return;
  if (state.closeDrag) settleBack(state);
  else if (state.direction === null) rest(state);
  else settle(state, 0);
}

/** Turns one page by keyboard. Works only on a page at rest and only where a page exists. */
export function turnByKey(state: PageTurnState, direction: TurnDirection): void {
  if (state.status !== 'idle' || !canTurn(state, direction)) return;
  state.direction = direction;
  state.progress = 0;
  settle(state, 1);
}

/**
 * Turns the last page into the end position by itself, with the short automatic duration. Works
 * only on the last page at rest. Returns whether the turn started.
 */
export function autoTurnLastPage(state: PageTurnState): boolean {
  if (state.status !== 'idle' || state.index !== PAGE_COUNT - 1) return false;
  turnByKey(state, 'next');
  state.autoTurn = true;
  return true;
}

/** Ends a settling turn at its target: a completed turn changes the page, a returned one does not. */
function arrive(state: PageTurnState, direction: TurnDirection): void {
  if (state.settleTarget === 1) state.index += direction === 'next' ? 1 : -1;
  rest(state);
}

/** Moves a settling turn toward its target and finishes it on arrival. */
export function tickPageTurn(state: PageTurnState, dt: number): void {
  if (state.status !== 'settling' || (state.direction === null && !state.closeDrag)) return;
  const step = Math.max(dt, 0) / (state.autoTurn ? AUTO_TURN_SECONDS : PAGE_TURN.settleSeconds);
  const target = state.settleTarget;
  state.progress = target === 1 ? Math.min(state.progress + step, 1) : Math.max(state.progress - step, 0);
  if (state.progress !== target) return;
  if (state.direction === null) rest(state);
  else arrive(state, state.direction);
}

/** Finishes a settling turn (or a returning closing gesture) at once, for reduced motion. Does nothing in any other status. */
export function settleNow(state: PageTurnState): void {
  if (state.status !== 'settling') return;
  if (state.direction !== null) arrive(state, state.direction);
  else if (state.closeDrag) rest(state);
}

const HALF_TURN = Math.PI;

/** Angle in radians of leaf `j` about the spine, from 0 (right side) to pi (left side). */
export function leafAngle(state: PageTurnState, j: number): number {
  const { index, direction, progress } = state;
  if (direction === 'next' && j === index) return progress * HALF_TURN;
  if (direction === 'prev' && j === index - 1) return (1 - progress) * HALF_TURN;
  return j < index ? HALF_TURN : 0;
}

/**
 * The leaf in the middle of a turn: the only one whose angle lies strictly between 0 and pi.
 * `null` when the pages are idle or no leaf is between its two resting sides.
 */
export function turningLeafIndex(state: PageTurnState): number | null {
  if (state.status === 'idle' || state.direction === null) return null;
  const j = state.direction === 'next' ? state.index : state.index - 1;
  const angle = leafAngle(state, j);
  return angle > 0 && angle < HALF_TURN ? j : null;
}

/** Leaf angle as drawn: turned leaves fold back with the cover. */
export function renderedLeafAngle(state: PageTurnState, j: number, cover: number): number {
  return leafAngle(state, j) * cover;
}

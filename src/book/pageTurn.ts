import { PAGE_TURN } from './bookTimings';

/** One page per leaf; the last leaf never turns forward. */
export const PAGE_COUNT = 3;

export type TurnDirection = 'next' | 'prev';
export type TurnStatus = 'idle' | 'dragging' | 'settling';

export interface PageTurnState {
  index: number;
  status: TurnStatus;
  direction: TurnDirection | null;
  /** Completion of the turn in progress, 0..1. */
  progress: number;
  settleTarget: 0 | 1;
}

export function createPageTurnState(): PageTurnState {
  return { index: 0, status: 'idle', direction: null, progress: 0, settleTarget: 0 };
}

/** Back to page 0, at rest. */
export function resetPageTurn(state: PageTurnState): void {
  state.index = 0;
  state.status = 'idle';
  state.direction = null;
  state.progress = 0;
  state.settleTarget = 0;
}

export function isIdle(state: PageTurnState): boolean {
  return state.status === 'idle';
}

function canTurn(state: PageTurnState, direction: TurnDirection): boolean {
  return direction === 'next' ? state.index < PAGE_COUNT - 1 : state.index > 0;
}

/** Starts a drag. Only a page at rest can be dragged. */
export function beginDrag(state: PageTurnState): void {
  if (state.status !== 'idle') return;
  state.status = 'dragging';
  state.direction = null;
  state.progress = 0;
}

/**
 * Follows the pointer. `dxPx` is the horizontal distance from the drag start (negative is left).
 * The direction is chosen once the dead zone is passed and stays locked for the rest of the drag.
 */
export function dragTo(state: PageTurnState, dxPx: number, pageWidthPx: number): void {
  if (state.status !== 'dragging') return;
  if (state.direction === null) {
    if (Math.abs(dxPx) < PAGE_TURN.deadzonePx) return;
    const direction: TurnDirection = dxPx < 0 ? 'next' : 'prev';
    if (!canTurn(state, direction)) return;
    state.direction = direction;
  }
  const along = state.direction === 'next' ? -dxPx : dxPx;
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
}

/** Releases the drag: at least the commit threshold completes the turn, less returns the page. */
export function endDrag(state: PageTurnState): void {
  if (state.status !== 'dragging') return;
  if (state.direction === null) rest(state);
  else settle(state, state.progress >= PAGE_TURN.commitThreshold ? 1 : 0);
}

/** Abandons the drag; the page always returns. */
export function cancelDrag(state: PageTurnState): void {
  if (state.status !== 'dragging') return;
  if (state.direction === null) rest(state);
  else settle(state, 0);
}

/** Turns one page by keyboard. Works only on a page at rest and only where a page exists. */
export function turnByKey(state: PageTurnState, direction: TurnDirection): void {
  if (state.status !== 'idle' || !canTurn(state, direction)) return;
  state.direction = direction;
  state.progress = 0;
  settle(state, 1);
}

/** Moves a settling turn toward its target and finishes it on arrival. */
export function tickPageTurn(state: PageTurnState, dt: number): void {
  if (state.status !== 'settling' || state.direction === null) return;
  const step = Math.max(dt, 0) / PAGE_TURN.settleSeconds;
  const target = state.settleTarget;
  state.progress = target === 1 ? Math.min(state.progress + step, 1) : Math.max(state.progress - step, 0);
  if (state.progress !== target) return;
  if (target === 1) state.index += state.direction === 'next' ? 1 : -1;
  rest(state);
}

const HALF_TURN = Math.PI;

/** Angle in radians of leaf `j` about the spine, from 0 (right side) to pi (left side). */
export function leafAngle(state: PageTurnState, j: number): number {
  const { index, direction, progress } = state;
  if (direction === 'next' && j === index) return progress * HALF_TURN;
  if (direction === 'prev' && j === index - 1) return (1 - progress) * HALF_TURN;
  return j < index ? HALF_TURN : 0;
}

/** Leaf angle as drawn: turned leaves fold back with the cover. */
export function renderedLeafAngle(state: PageTurnState, j: number, cover: number): number {
  return leafAngle(state, j) * cover;
}

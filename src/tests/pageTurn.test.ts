import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  PAGE_COUNT,
  beginDrag,
  cancelDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  isIdle,
  leafAngle,
  renderedLeafAngle,
  tickPageTurn,
  turnByKey,
  turningLeafIndex,
} from '../book/pageTurn';
import type { DragSide, PageTurnState, TurnDirection } from '../book/pageTurn';
import { MAX_FRAME_DELTA, PAGE_TURN } from '../book/bookTimings';

const RUNS = { numRuns: 200 };
const WIDTH = 400;

const dtArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0, max: MAX_FRAME_DELTA, noNaN: true }),
  fc.double({ min: MAX_FRAME_DELTA, max: 5, noNaN: true }),
);
const pageArb = fc.integer({ min: 0, max: PAGE_COUNT - 1 });
const directionArb = fc.constantFrom<TurnDirection>('next', 'prev');

type Op =
  | { kind: 'begin' | 'end' | 'cancel' }
  | { kind: 'drag'; dx: number; width: number }
  | { kind: 'key'; direction: TurnDirection }
  | { kind: 'tick'; dt: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom<Op>({ kind: 'begin' }, { kind: 'end' }, { kind: 'cancel' }),
  fc.record({ kind: fc.constant('drag' as const), dx: fc.integer({ min: -900, max: 900 }), width: fc.integer({ min: 0, max: 900 }) }),
  directionArb.map((direction) => ({ kind: 'key' as const, direction })),
  dtArb.map((dt) => ({ kind: 'tick' as const, dt })),
);

function apply(state: PageTurnState, op: Op): void {
  switch (op.kind) {
    case 'begin':
      beginDrag(state);
      break;
    case 'end':
      endDrag(state);
      break;
    case 'cancel':
      cancelDrag(state);
      break;
    case 'drag':
      dragTo(state, op.dx, op.width);
      break;
    case 'key':
      turnByKey(state, op.direction);
      break;
    case 'tick':
      tickPageTurn(state, op.dt);
      break;
  }
}

/** The page a drag must start on to turn in direction. */
function sideOf(direction: TurnDirection): DragSide {
  return direction === 'next' ? 'right' : 'left';
}

function stateAt(index: number): PageTurnState {
  const state = createPageTurnState();
  state.index = index;
  return state;
}

function settleFully(state: PageTurnState): void {
  for (let i = 0; i < 10; i++) tickPageTurn(state, MAX_FRAME_DELTA);
}

/** Drags `distance` px in `direction`, releases and settles. Returns the progress at release. */
function dragAndRelease(state: PageTurnState, direction: TurnDirection, distance: number): number {
  beginDrag(state, sideOf(direction));
  dragTo(state, direction === 'next' ? -distance : distance, WIDTH);
  const progress = state.progress;
  endDrag(state);
  settleFully(state);
  return progress;
}

function leafAngles(state: PageTurnState): number[] {
  return Array.from({ length: PAGE_COUNT }, (_, j) => leafAngle(state, j));
}

describe('page turn properties', () => {
  it('Feature: graveyard-core, Property 9: Page model invariants', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 80 }), (ops) => {
        const state = createPageTurnState();
        for (const op of ops) {
          apply(state, op);
          expect(state.index).toBeGreaterThanOrEqual(0);
          expect(state.index).toBeLessThanOrEqual(PAGE_COUNT - 1);
          expect(state.progress).toBeGreaterThanOrEqual(0);
          expect(state.progress).toBeLessThanOrEqual(1);
          const angles = leafAngles(state);
          for (const angle of angles) {
            expect(angle).toBeGreaterThanOrEqual(0);
            expect(angle).toBeLessThanOrEqual(Math.PI);
          }
          if (isIdle(state)) {
            expect(state.progress).toBe(0);
            expect(state.direction).toBeNull();
            for (let j = 1; j < PAGE_COUNT; j++) {
              expect(leafAngle(state, j)).toBeLessThanOrEqual(leafAngle(state, j - 1));
            }
          }
          if (state.direction === 'next') expect(state.index).toBeLessThan(PAGE_COUNT - 1);
          if (state.direction === 'prev') expect(state.index).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 10: The 50 percent rule', () => {
    fc.assert(
      fc.property(pageArb, directionArb, fc.integer({ min: 0, max: 600 }), (index, direction, distance) => {
        const step = direction === 'next' ? 1 : -1;
        fc.pre(index + step >= 0 && index + step < PAGE_COUNT);

        const released = stateAt(index);
        const progress = dragAndRelease(released, direction, distance);
        const completes = distance >= PAGE_TURN.deadzonePx && progress >= PAGE_TURN.commitThreshold;
        expect(released.index).toBe(completes ? index + step : index);
        expect(isIdle(released)).toBe(true);

        const cancelled = stateAt(index);
        beginDrag(cancelled, sideOf(direction));
        dragTo(cancelled, direction === 'next' ? -distance : distance, WIDTH);
        cancelDrag(cancelled);
        settleFully(cancelled);
        expect(cancelled.index).toBe(index);
        expect(isIdle(cancelled)).toBe(true);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 11: Keyboard turning', () => {
    fc.assert(
      fc.property(pageArb, directionArb, (index, direction) => {
        const step = direction === 'next' ? 1 : -1;
        const exists = index + step >= 0 && index + step < PAGE_COUNT;

        const keyed = stateAt(index);
        turnByKey(keyed, direction);
        settleFully(keyed);
        expect(keyed.index).toBe(exists ? index + step : index);
        expect(isIdle(keyed)).toBe(true);

        if (exists) {
          const dragged = stateAt(index);
          dragAndRelease(dragged, direction, WIDTH * PAGE_TURN.fullTurnRatio);
          expect(dragged.index).toBe(keyed.index);
        }

        if (index < PAGE_COUNT - 1) {
          const round = stateAt(index);
          turnByKey(round, 'next');
          settleFully(round);
          turnByKey(round, 'prev');
          settleFully(round);
          expect(round.index).toBe(index);
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 13: Rendered leaf angle follows the cover', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), fc.integer({ min: 0, max: PAGE_COUNT - 1 }), (ops, j) => {
        const state = createPageTurnState();
        for (const op of ops) apply(state, op);
        expect(renderedLeafAngle(state, j, 0)).toBe(0);
        expect(renderedLeafAngle(state, j, 1)).toBe(leafAngle(state, j));
      }),
      RUNS,
    );
  });
});

describe('page turn examples', () => {
  it('completes a turn at exactly 50 percent and returns just below', () => {
    const full = WIDTH * PAGE_TURN.fullTurnRatio;
    const exact = stateAt(0);
    expect(dragAndRelease(exact, 'next', full * 0.5)).toBe(0.5);
    expect(exact.index).toBe(1);

    const short = stateAt(0);
    dragAndRelease(short, 'next', full * 0.49);
    expect(short.index).toBe(0);
  });

  it('ignores a drag toward a missing page and keeps the page at the ends', () => {
    const first = stateAt(0);
    dragAndRelease(first, 'prev', 300);
    expect(first.index).toBe(0);
    turnByKey(first, 'prev');
    expect(isIdle(first)).toBe(true);

    const last = stateAt(PAGE_COUNT - 1);
    dragAndRelease(last, 'next', 300);
    turnByKey(last, 'next');
    expect(last.index).toBe(PAGE_COUNT - 1);
    expect(isIdle(last)).toBe(true);
  });

  it('stays at rest inside the dead zone', () => {
    const state = stateAt(1);
    beginDrag(state);
    dragTo(state, -(PAGE_TURN.deadzonePx - 1), WIDTH);
    expect(state.direction).toBeNull();
    endDrag(state);
    expect(isIdle(state)).toBe(true);
  });

  it('locks the direction for the rest of the drag', () => {
    const state = stateAt(1);
    beginDrag(state);
    dragTo(state, -100, WIDTH);
    dragTo(state, 100, WIDTH);
    expect(state.direction).toBe('next');
    expect(state.progress).toBe(0);
  });

  it('ignores a key press while a turn is in progress', () => {
    const state = stateAt(0);
    turnByKey(state, 'next');
    turnByKey(state, 'next');
    settleFully(state);
    expect(state.index).toBe(1);
  });

  it('settles a partial turn in proportion to its progress', () => {
    const state = stateAt(0);
    beginDrag(state);
    dragTo(state, -WIDTH * PAGE_TURN.fullTurnRatio * 0.9, WIDTH);
    endDrag(state);
    tickPageTurn(state, PAGE_TURN.settleSeconds * 0.1 + 1e-9);
    expect(state.index).toBe(1);
  });

  it('moves the turning leaf with the drag and folds turned leaves back', () => {
    const state = stateAt(1);
    beginDrag(state);
    dragTo(state, -WIDTH * PAGE_TURN.fullTurnRatio * 0.5, WIDTH);
    expect(leafAngle(state, 0)).toBe(Math.PI);
    expect(leafAngle(state, 1)).toBeCloseTo(Math.PI / 2);
    expect(leafAngle(state, 2)).toBe(0);
    expect(renderedLeafAngle(state, 0, 0.5)).toBeCloseTo(Math.PI / 2);
  });
});

describe('turningLeafIndex', () => {
  it('is null at rest and before the dead zone is passed', () => {
    const state = stateAt(1);
    expect(turningLeafIndex(state)).toBeNull();
    beginDrag(state);
    dragTo(state, -(PAGE_TURN.deadzonePx - 1), WIDTH);
    expect(turningLeafIndex(state)).toBeNull();
  });

  it('is the leaf of the current page going forward and the one before it going back', () => {
    const forward = stateAt(1);
    beginDrag(forward);
    dragTo(forward, -WIDTH * PAGE_TURN.fullTurnRatio * 0.5, WIDTH);
    expect(turningLeafIndex(forward)).toBe(1);

    const backward = stateAt(2);
    beginDrag(backward, 'left');
    dragTo(backward, WIDTH * PAGE_TURN.fullTurnRatio * 0.25, WIDTH);
    expect(turningLeafIndex(backward)).toBe(1);
  });

  it('is null for a keyboard turn that has not moved yet, and again once it lands', () => {
    const state = stateAt(0);
    turnByKey(state, 'next');
    expect(turningLeafIndex(state)).toBeNull();
    tickPageTurn(state, PAGE_TURN.settleSeconds / 2);
    expect(turningLeafIndex(state)).toBe(0);
    settleFully(state);
    expect(turningLeafIndex(state)).toBeNull();
  });
});

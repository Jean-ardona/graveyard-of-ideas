import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  PAGE_COUNT,
  beginDrag,
  cancelDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  leafAngle,
  takeCloseRequest,
  tickPageTurn,
  turnByKey,
  turningLeafIndex,
  zoneAction,
} from '../book/pageTurn';
import type { DragSide, PageTurnState } from '../book/pageTurn';
import { createReadingMachine } from '../book/readingMachine';
import { MAX_FRAME_DELTA, PAGE_TURN } from '../book/bookTimings';

const RUNS = { numRuns: 200 };
const WIDTH = 400;
/** Distance in px of a full turn. */
const FULL = WIDTH * PAGE_TURN.fullTurnRatio;

const sideArb = fc.constantFrom<DragSide>('left', 'right');
const pageArb = fc.integer({ min: 0, max: PAGE_COUNT - 1 });

function stateAt(index: number): PageTurnState {
  const state = createPageTurnState();
  state.index = index;
  return state;
}

function settleFully(state: PageTurnState): void {
  for (let i = 0; i < 10; i++) tickPageTurn(state, MAX_FRAME_DELTA);
}

/** Pointer travel in px that moves toward the page's action: left from the right page, right from the left page. */
function along(side: DragSide, distance: number): number {
  return side === 'right' ? -distance : distance;
}

function dragFrom(state: PageTurnState, side: DragSide, distance: number): void {
  beginDrag(state, side);
  dragTo(state, along(side, distance), WIDTH);
  endDrag(state);
  settleFully(state);
}

function leafAngles(state: PageTurnState): number[] {
  return Array.from({ length: PAGE_COUNT }, (_, j) => leafAngle(state, j));
}

type Op =
  | { kind: 'begin'; side: DragSide }
  | { kind: 'end' | 'cancel' }
  | { kind: 'drag'; dx: number }
  | { kind: 'key'; direction: 'next' | 'prev' }
  | { kind: 'tick'; dt: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  sideArb.map((side) => ({ kind: 'begin' as const, side })),
  fc.constantFrom<Op>({ kind: 'end' }, { kind: 'cancel' }),
  fc.integer({ min: -900, max: 900 }).map((dx) => ({ kind: 'drag' as const, dx })),
  fc.constantFrom('next' as const, 'prev' as const).map((direction) => ({ kind: 'key' as const, direction })),
  fc.double({ min: 0, max: 0.2, noNaN: true }).map((dt) => ({ kind: 'tick' as const, dt })),
);

function apply(state: PageTurnState, op: Op): void {
  switch (op.kind) {
    case 'begin':
      beginDrag(state, op.side);
      break;
    case 'end':
      endDrag(state);
      takeCloseRequest(state);
      break;
    case 'cancel':
      cancelDrag(state);
      break;
    case 'drag':
      dragTo(state, op.dx, WIDTH);
      break;
    case 'key':
      turnByKey(state, op.direction);
      break;
    case 'tick':
      tickPageTurn(state, op.dt);
      break;
  }
}

describe('two drag zones', () => {
  it('Feature: graveyard-core, Property 28: The wrong direction does nothing', () => {
    fc.assert(
      fc.property(
        pageArb,
        sideArb,
        fc.array(fc.integer({ min: 0, max: 900 }), { minLength: 1, maxLength: 6 }),
        fc.boolean(),
        (index, side, distances, cancel) => {
          const state = stateAt(index);
          beginDrag(state, side);
          for (const distance of distances) {
            // Away from the page's action: right from the right page, left from the left page.
            dragTo(state, -along(side, distance), WIDTH);
            expect(state.progress).toBe(0);
            expect(state.direction).toBeNull();
            expect(state.closeDrag).toBe(false);
          }
          if (cancel) cancelDrag(state);
          else endDrag(state);
          expect(state).toEqual(stateAt(index));
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 29: Next then previous returns to the same page', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: PAGE_COUNT - 2 }),
        fc.integer({ min: Math.ceil(FULL * PAGE_TURN.commitThreshold), max: 700 }),
        fc.integer({ min: Math.ceil(FULL * PAGE_TURN.commitThreshold), max: 700 }),
        (index, forward, back) => {
          const state = stateAt(index);
          dragFrom(state, 'right', forward);
          expect(state.index).toBe(index + 1);
          expect(state.status).toBe('idle');
          dragFrom(state, 'left', back);
          expect(state.index).toBe(index);
          expect(state.status).toBe('idle');
          expect(state).toEqual(stateAt(index));
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 30: A closing gesture at the ends needs half the distance', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: 0, max: 700 }), (atStart, distance) => {
        const side: DragSide = atStart ? 'left' : 'right';
        const state = stateAt(atStart ? 0 : PAGE_COUNT - 1);
        const before = leafAngles(state);
        expect(zoneAction(state.index, side)).toBe('close');

        beginDrag(state, side);
        dragTo(state, along(side, distance), WIDTH);
        // No leaf moves and no turn starts: only the progress of the gesture follows the pointer.
        expect(leafAngles(state)).toEqual(before);
        expect(turningLeafIndex(state)).toBeNull();
        expect(state.direction).toBeNull();
        endDrag(state);
        // Below the threshold the gesture settles back to 0 (the cover returns); no leaf moves meanwhile.
        expect(leafAngles(state)).toEqual(before);
        settleFully(state);

        expect(state.status).toBe('idle');
        expect(state.index).toBe(atStart ? 0 : PAGE_COUNT - 1);
        expect(state.closeRequested).toBe(distance >= FULL * PAGE_TURN.commitThreshold);
        expect(takeCloseRequest(state)).toBe(distance >= FULL * PAGE_TURN.commitThreshold);
        expect(state).toEqual(stateAt(state.index));
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 30: a cancelled closing gesture never requests the close', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: 0, max: 700 }), (atStart, distance) => {
        const side: DragSide = atStart ? 'left' : 'right';
        const state = stateAt(atStart ? 0 : PAGE_COUNT - 1);
        beginDrag(state, side);
        dragTo(state, along(side, distance), WIDTH);
        cancelDrag(state);
        expect(state.closeRequested).toBe(false);
        settleFully(state);
        expect(state.status).toBe('idle');
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 31: No leaf is both turned and unturned', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 80 }), (ops) => {
        const state = createPageTurnState();
        for (const op of ops) {
          apply(state, op);
          const angles = leafAngles(state);
          const between = angles.filter((angle) => angle > 0 && angle < Math.PI);
          expect(between.length).toBeLessThanOrEqual(1);
          if (between.length === 1) expect(angles[turningLeafIndex(state)!]).toBe(between[0]);
          for (let j = 1; j < PAGE_COUNT; j++) expect(angles[j]!).toBeLessThanOrEqual(angles[j - 1]!);
          if (state.status === 'idle') {
            expect(between).toHaveLength(0);
            angles.forEach((angle, j) => expect(angle).toBe(j < state.index ? Math.PI : 0));
          }
          if (state.closeDrag) expect(state.direction).toBeNull();
          if (state.direction === 'next') expect(state.index).toBeLessThan(PAGE_COUNT - 1);
          if (state.direction === 'prev') expect(state.index).toBeGreaterThan(0);
        }
      }),
      RUNS,
    );
  });
});

describe('two drag zones: examples', () => {
  it('maps each side and page to its action', () => {
    expect([0, 1, 2].map((index) => zoneAction(index, 'right'))).toEqual(['next', 'next', 'close']);
    expect([0, 1, 2].map((index) => zoneAction(index, 'left'))).toEqual(['close', 'prev', 'prev']);
  });

  it('turns the leaf of the previous page back from the left zone, in reverse', () => {
    const state = stateAt(2);
    beginDrag(state, 'left');
    dragTo(state, FULL * 0.25, WIDTH);
    expect(state.direction).toBe('prev');
    expect(turningLeafIndex(state)).toBe(1);
    expect(leafAngle(state, 1)).toBeCloseTo(Math.PI * 0.75);
  });

  it('does not jitter: a wrong-way drag past the dead zone leaves the direction open', () => {
    const state = stateAt(1);
    beginDrag(state, 'left');
    dragTo(state, -100, WIDTH);
    expect(state.direction).toBeNull();
    dragTo(state, 100, WIDTH);
    expect(state.direction).toBe('prev');
  });

  it('closes the book through the machine, and only once the pages are idle', () => {
    const machine = createReadingMachine();
    machine.open({ playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true });
    machine.skip();

    machine.beginDrag('left');
    machine.dragTo(FULL * 0.49, WIDTH);
    machine.endDrag();
    expect(machine.phase()).toBe('open');
    // The cover settles back to open before another drag can start.
    for (let i = 0; i < 10; i++) machine.tick(MAX_FRAME_DELTA);

    machine.beginDrag('left');
    machine.dragTo(FULL * 0.5, WIDTH);
    machine.endDrag();
    expect(machine.phase()).toBe('closing');
  });

  it('keeps a key turn from closing the book at the ends', () => {
    const state = stateAt(0);
    turnByKey(state, 'prev');
    expect(state.status).toBe('idle');
    expect(state.closeRequested).toBe(false);
  });
});

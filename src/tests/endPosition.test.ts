import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BACK_SWING_MAX, backBoardAngle } from '../book/backClose';
import { applySequenceEvent, createSequenceProgress, createSequenceState, startClosingFromCover, tickSequence, writeProgress } from '../book/bookSequence';
import { MAX_FRAME_DELTA, PAGE_TURN, TOTAL_SECONDS } from '../book/bookTimings';
import {
  END_INDEX,
  PAGE_COUNT,
  beginDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  isIdle,
  leafAngle,
  tickPageTurn,
  turnByKey,
} from '../book/pageTurn';
import type { PageTurnState } from '../book/pageTurn';
import { createReadingMachine } from '../book/readingMachine';
import type { ReadingMachine } from '../book/readingMachine';
import { LEAF_FRAME } from '../book/bookAssets';
import { LEAF_COUNT, LEAF_THICKNESS, leafHingeAngle, leafHingeZ, restLeafZ } from '../book/bookStack';
import { LEAF_CURL, leafCurl, leafStrip } from '../book/leafCurl';
import { curlHingeRotation } from '../book/leafCurlMesh';

const RUNS = { numRuns: 200 };
const WIDTH = 400;
const FULL = WIDTH * PAGE_TURN.fullTurnRatio;
const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

const dtArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0, max: MAX_FRAME_DELTA, noNaN: true }),
  fc.double({ min: MAX_FRAME_DELTA, max: 5, noNaN: true }),
);
/** How a page turn is made: the arrow key, or a drag of at least the commit distance. */
const methodArb = fc.constantFrom<'key' | 'drag'>('key', 'drag');
const overArb = fc.integer({ min: Math.ceil(FULL * PAGE_TURN.commitThreshold), max: 700 });

function stateAt(index: number): PageTurnState {
  return { ...createPageTurnState(), index };
}

function settleFully(state: PageTurnState): void {
  for (let i = 0; i < 20; i++) tickPageTurn(state, MAX_FRAME_DELTA);
}

function turn(state: PageTurnState, direction: 'next' | 'prev', method: 'key' | 'drag', distance: number): void {
  if (method === 'key') turnByKey(state, direction);
  else {
    beginDrag(state, direction === 'next' ? 'right' : 'left');
    dragTo(state, direction === 'next' ? -distance : distance, WIDTH);
    endDrag(state);
  }
  settleFully(state);
}

/** An open book on `index`, pages idle. */
function openOn(index: number): ReadingMachine {
  const machine = createReadingMachine();
  machine.open(GUARD);
  machine.skip();
  for (let i = 0; i < index; i++) {
    machine.turnPage('next');
    for (let k = 0; k < 20; k++) machine.tick(MAX_FRAME_DELTA);
  }
  return machine;
}

function allLeavesTurned(pages: PageTurnState): boolean {
  return Array.from({ length: PAGE_COUNT }, (_, j) => leafAngle(pages, j)).every((angle) => angle === Math.PI);
}

describe('the last leaf turning into the end position', () => {
  /** Top of the page block, the inside face of the back board: the underside of the last leaf at rest. */
  const BLOCK_TOP = restLeafZ(LEAF_COUNT - 1) - LEAF_THICKNESS / 2;
  const LAST = LEAF_COUNT - 1;

  it('stays above the inside of the back board and never passes through it, rigid', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: LEAF_FRAME.width, noNaN: true }), (f, x) => {
        const angle = leafHingeAngle(LAST, f);
        const underside = leafHingeZ(LAST, f) + x * Math.sin(angle) - (LEAF_THICKNESS / 2) * Math.abs(Math.cos(angle));
        expect(underside).toBeGreaterThanOrEqual(BLOCK_TOP - 1e-12);
      }),
      RUNS,
    );
  });

  it('stays above the inside of the back board while it bends', () => {
    const angles = new Float64Array(LEAF_CURL.segments);
    const positions = new Float64Array(12 * (LEAF_CURL.segments + 1));
    const normals = new Float64Array(12 * (LEAF_CURL.segments + 1));
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (f) => {
        leafCurl(f, LEAF_CURL.segments, angles);
        leafStrip(angles, LEAF_CURL.segments, LEAF_FRAME.width, LEAF_FRAME.depth, positions, normals, LEAF_FRAME.height, LEAF_FRAME.originX, LEAF_FRAME.originY);
        // The hinge rotates the strip about y by `curlHingeRotation` and sits at the hinge height.
        const rotation = curlHingeRotation(LAST, f);
        for (let v = 0; v < positions.length; v += 3) {
          const z = leafHingeZ(LAST, f) - positions[v]! * Math.sin(rotation) + positions[v + 2]! * Math.cos(rotation);
          expect(z).toBeGreaterThanOrEqual(BLOCK_TOP - 1e-9);
        }
      }),
      RUNS,
    );
  });
});

describe('end position properties', () => {
  it('Feature: graveyard-core, Property 42: Next from the last page reaches the end position and next from the end is a no-op', () => {
    fc.assert(
      fc.property(methodArb, overArb, methodArb, overArb, (method, distance, again, againDistance) => {
        const state = stateAt(PAGE_COUNT - 1);
        turn(state, 'next', method, distance);
        expect(state).toEqual(stateAt(END_INDEX));
        expect(allLeavesTurned(state)).toBe(true);
        // Nothing lies beyond the end: a key does nothing, a drag from the right zone is a closing gesture, not a turn.
        turnByKey(state, 'next');
        expect(state).toEqual(stateAt(END_INDEX));
        if (again === 'drag') {
          beginDrag(state, 'right');
          dragTo(state, -againDistance, WIDTH);
          expect(state.direction).toBeNull();
          expect(state.closeDrag).toBe(true);
          expect(state.index).toBe(END_INDEX);
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 43: Previous from the end position returns to the last page', () => {
    fc.assert(
      fc.property(methodArb, overArb, methodArb, overArb, (back, backDistance, forth, forthDistance) => {
        const state = stateAt(END_INDEX);
        turn(state, 'prev', back, backDistance);
        expect(state).toEqual(stateAt(PAGE_COUNT - 1));
        expect([0, 1].every((j) => leafAngle(state, j) === Math.PI)).toBe(true);
        expect(leafAngle(state, PAGE_COUNT - 1)).toBe(0);
        turn(state, 'next', forth, forthDistance);
        expect(state).toEqual(stateAt(END_INDEX));
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 44: The back board is never closed while a leaf is unturned', () => {
    type Op = 'open' | 'skip' | 'close' | 'tick' | 'run' | 'next' | 'prev' | 'dragRight' | 'dragLeft' | 'move' | 'release' | 'cancel';
    const ops = fc.array(
      fc.tuple(
        fc.constantFrom<Op>(
          'open', 'skip', 'close', 'tick', 'run', 'run', 'next', 'next', 'next', 'prev',
          'dragRight', 'dragLeft', 'move', 'move', 'release', 'cancel',
        ),
        fc.integer({ min: -450, max: 450 }),
      ),
      { maxLength: 150 },
    );
    fc.assert(
      fc.property(ops, (sequence) => {
        const machine = createReadingMachine();
        for (const [op, amount] of sequence) {
          if (op === 'open') machine.open(GUARD);
          else if (op === 'skip') machine.skip();
          else if (op === 'close') machine.close();
          else if (op === 'tick') machine.tick(MAX_FRAME_DELTA);
          else if (op === 'run') for (let i = 0; i < 30; i++) machine.tick(MAX_FRAME_DELTA);
          else if (op === 'next') machine.turnPage('next');
          else if (op === 'prev') machine.turnPage('prev');
          else if (op === 'dragRight') machine.beginDrag('right');
          else if (op === 'dragLeft') machine.beginDrag('left');
          else if (op === 'move') machine.dragTo(amount, WIDTH);
          else if (op === 'release') machine.endDrag();
          else machine.cancelDrag();
          const backClosed =
            machine.progress.swing === BACK_SWING_MAX ||
            backBoardAngle(machine.pages) === BACK_SWING_MAX ||
            (machine.phase() === 'closing' && machine.sequence.side === 'back');
          if (backClosed) expect(allLeavesTurned(machine.pages)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 45: Close from the last page ends closed with all leaves turned first and the book face up on its base', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 30 }), (dts) => {
        const machine = openOn(PAGE_COUNT - 1);
        machine.close();
        let closingSeen = false;
        const frames = [...dts, ...new Array<number>(Math.ceil((TOTAL_SECONDS + 3) / MAX_FRAME_DELTA)).fill(MAX_FRAME_DELTA)];
        for (const dt of frames) {
          machine.tick(dt);
          if (machine.phase() === 'closing') {
            if (!closingSeen) {
              closingSeen = true;
              // No jump: the close starts from the open pose, with the turn already landed.
              expect(machine.sequence.t).toBe(TOTAL_SECONDS);
              expect(machine.progress.cover).toBeCloseTo(1, 9);
              expect(machine.progress.swing).toBe(0);
            }
            expect(isIdle(machine.pages)).toBe(true);
            expect(machine.pages.index).toBe(END_INDEX);
            expect(allLeavesTurned(machine.pages)).toBe(true);
            expect(machine.sequence.side).toBe('back');
          } else if (machine.phase() === 'open') {
            // Until the automatic turn lands the book stays open on the last page or in the turn.
            expect(machine.pages.index).toBeGreaterThanOrEqual(PAGE_COUNT - 1);
          }
        }
        expect(closingSeen).toBe(true);
        expect(machine.phase()).toBe('closed');
        expect(machine.progress).toEqual({ lift: 0, approach: 0, cover: 0, swing: 0 });
        expect(machine.sequence).toEqual({ phase: 'closed', t: 0, closePending: false, side: 'front' });
        expect(machine.pages).toEqual(createPageTurnState());
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 46: Close from the end position equals the back close', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 120 }), (dts) => {
        const machine = openOn(END_INDEX);
        machine.close();
        // The back close, made directly on the pure sequence from the open pose.
        const reference = createSequenceState();
        applySequenceEvent(reference, 'OPEN', true);
        applySequenceEvent(reference, 'SKIP', true);
        startClosingFromCover(reference, 1, true);
        const referenceProgress = createSequenceProgress();
        writeProgress(reference.t, referenceProgress, reference.side);

        expect(machine.sequence.phase).toBe(reference.phase);
        expect(machine.sequence.side).toBe(reference.side);
        expect(machine.sequence.t).toBeCloseTo(reference.t, 9);
        for (const dt of [...dts, ...new Array<number>(200).fill(MAX_FRAME_DELTA)]) {
          machine.tick(dt);
          tickSequence(reference, dt, true, true);
          writeProgress(reference.t, referenceProgress, reference.side);
          expect(machine.phase()).toBe(reference.phase);
          expect(machine.sequence.t).toBeCloseTo(reference.t, 9);
          expect(machine.progress.swing).toBeCloseTo(referenceProgress.swing, 9);
          expect(machine.progress.cover).toBeCloseTo(referenceProgress.cover, 9);
        }
        expect(machine.phase()).toBe('closed');
      }),
      RUNS,
    );
  });
});

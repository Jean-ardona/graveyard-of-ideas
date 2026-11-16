import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as THREE from 'three';
import { BACK_SWING_MAX, backBoardAngle, backSwingAngle, isBackClosingGesture } from '../book/backClose';
import { BOOK_PIVOTS, BOOK_SIZE, createBookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import { APPROACH_END, BACK_FLIP, LIFT_END, MAX_FRAME_DELTA, PAGE_TURN, TOTAL_SECONDS } from '../book/bookTimings';
import { END_INDEX, PAGE_COUNT, createPageTurnState, turningLeafIndex } from '../book/pageTurn';
import type { PageTurnState } from '../book/pageTurn';
import { createReadingMachine } from '../book/readingMachine';
import type { ReadingMachine } from '../book/readingMachine';

const RUNS = { numRuns: 200 };
const WIDTH = 400;
const FULL = WIDTH * PAGE_TURN.fullTurnRatio;
const COMMIT_PX = FULL * PAGE_TURN.commitThreshold;
const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

/** An open book on `page` (0-based), pages idle. */
function openOn(page: number): ReadingMachine {
  const machine = createReadingMachine();
  machine.open(GUARD);
  machine.skip();
  for (let i = 0; i < page; i++) {
    machine.turnPage('next');
    for (let k = 0; k < 20; k++) machine.tick(MAX_FRAME_DELTA);
  }
  return machine;
}

/** The end position with a drag from the right zone, `distance` px to the left. */
function backDragged(distance: number): ReadingMachine {
  const machine = openOn(END_INDEX);
  machine.beginDrag('right');
  machine.dragTo(-distance, WIDTH);
  return machine;
}

function run(machine: ReadingMachine, steps: number): void {
  for (let i = 0; i < steps; i++) machine.tick(MAX_FRAME_DELTA);
}

describe('back closing properties', () => {
  it('Feature: graveyard-core, Property 37: The back board angle is monotonic in the drag progress and stays in range', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -300, max: 900, noNaN: true }),
        fc.double({ min: -300, max: 900, noNaN: true }),
        (a, b) => {
          const [near, far] = a <= b ? [a, b] : [b, a];
          const machine = backDragged(near);
          const before = backBoardAngle(machine.pages);
          machine.dragTo(-far, WIDTH);
          const after = backBoardAngle(machine.pages);
          expect(after).toBeGreaterThanOrEqual(before);
          expect(after).toBeLessThanOrEqual(BACK_SWING_MAX);
        },
      ),
      RUNS,
    );
    // Any input at all, NaN and infinities included, stays inside [0, pi].
    fc.assert(
      fc.property(
        fc.double(),
        fc.double(),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom<PageTurnState['side']>('left', 'right', null),
        fc.integer({ min: -2, max: 5 }),
        (progress, approach, closeDrag, reducedMotion, side, index) => {
          const pages = { ...createPageTurnState(), progress, closeDrag, side, index, status: 'dragging' as const };
          for (const angle of [backBoardAngle(pages, reducedMotion), backSwingAngle(progress, approach)]) {
            expect(angle).toBeGreaterThanOrEqual(0);
            expect(angle).toBeLessThanOrEqual(BACK_SWING_MAX);
          }
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 38: Release below 50 percent returns exactly to the end-position open state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Math.ceil(COMMIT_PX) - 1 }), fc.boolean(), (distance, cancel) => {
        const machine = backDragged(distance);
        if (cancel) machine.cancelDrag();
        else machine.endDrag();
        expect(machine.phase()).toBe('open');
        run(machine, 10);
        expect(machine.phase()).toBe('open');
        expect(machine.sequence.t).toBe(TOTAL_SECONDS);
        expect(machine.sequence.side).toBe('front');
        expect(machine.progress.cover).toBe(1);
        expect(machine.progress.swing).toBe(0);
        expect(machine.pages).toEqual({ ...createPageTurnState(), index: END_INDEX });
        expect(backBoardAngle(machine.pages)).toBe(0);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 39: Release above 50 percent reaches closed back up and then the rest pose face up', () => {
    fc.assert(
      fc.property(fc.integer({ min: Math.ceil(COMMIT_PX), max: 900 }), (distance) => {
        const machine = backDragged(distance);
        const dragged = backBoardAngle(machine.pages);
        machine.endDrag();
        expect(machine.phase()).toBe('closing');
        expect(machine.sequence.side).toBe('back');
        // No jump: the swing at release equals the swing that was dragged.
        expect(Math.abs(machine.progress.swing - dragged)).toBeLessThan(1e-9);
        let mostSwung = machine.progress.swing;
        for (let i = 0; i < 400 && machine.phase() !== 'closed'; i++) {
          machine.tick(MAX_FRAME_DELTA);
          mostSwung = Math.max(mostSwung, machine.progress.swing);
        }
        // The book is closed with its back up (pi) before the flip starts; a step may carry past that point.
        expect(BACK_SWING_MAX - mostSwung).toBeLessThan(0.01);
        expect(machine.phase()).toBe('closed');
        // Rest pose face up: no swing, the front side, the first page.
        expect(machine.progress.swing).toBe(0);
        expect(machine.progress.cover).toBe(0);
        expect(machine.progress.lift).toBe(0);
        expect(machine.progress.approach).toBe(0);
        expect(machine.sequence.side).toBe('front');
        expect(machine.pages).toEqual(createPageTurnState());
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 40: The flip is one continuous rotation of exactly 180 degrees', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.004, max: MAX_FRAME_DELTA, noNaN: true }), (step) => {
        const machine = backDragged(FULL);
        machine.endDrag();
        // Jump to the instant the back board has closed over the leaves: the book is back up at exactly pi.
        let guard = 0;
        machine.sequence.t = APPROACH_END;
        machine.tick(0);
        expect(machine.progress.swing).toBe(BACK_SWING_MAX);
        let previous = machine.progress.swing;
        let turned = 0;
        let flipSeconds = 0;
        while (machine.phase() === 'closing' && guard++ < 5000) {
          machine.tick(step);
          const { swing, lift } = machine.progress;
          // Single direction, finite step, and the flip happens at full lift: it never goes below the rest height.
          expect(swing).toBeLessThanOrEqual(previous + 1e-12);
          expect(previous - swing).toBeLessThanOrEqual(BACK_SWING_MAX * (step / BACK_FLIP.seconds) * 3 + 1e-9);
          if (swing > 0) expect(lift).toBe(1);
          if (machine.sequence.t > LIFT_END) flipSeconds += step;
          turned += previous - swing;
          previous = swing;
        }
        expect(machine.phase()).toBe('closed');
        expect(machine.progress.swing).toBe(0);
        expect(turned).toBeCloseTo(Math.PI, 9);
        // Takes about BACK_FLIP.seconds (one step of slack at each end).
        expect(Math.abs(flipSeconds - BACK_FLIP.seconds)).toBeLessThanOrEqual(2 * step + 1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: graveyard-core, Property 41: Both covers closed never coexists with a turning leaf', () => {
    type Op = 'open' | 'skip' | 'close' | 'tick' | 'next' | 'prev' | 'dragRight' | 'dragLeft' | 'move' | 'release' | 'cancel';
    const ops = fc.array(
      fc.tuple(
        fc.constantFrom<Op>('open', 'skip', 'close', 'tick', 'tick', 'tick', 'next', 'prev', 'dragRight', 'dragLeft', 'move', 'release', 'cancel'),
        fc.integer({ min: -450, max: 450 }),
      ),
      { maxLength: 80 },
    );
    fc.assert(
      fc.property(ops, (sequence) => {
        const machine = createReadingMachine();
        for (const [op, amount] of sequence) {
          if (op === 'open') machine.open(GUARD);
          else if (op === 'skip') machine.skip();
          else if (op === 'close') machine.close();
          else if (op === 'tick') machine.tick(MAX_FRAME_DELTA);
          else if (op === 'next') machine.turnPage('next');
          else if (op === 'prev') machine.turnPage('prev');
          else if (op === 'dragRight') machine.beginDrag('right');
          else if (op === 'dragLeft') machine.beginDrag('left');
          else if (op === 'move') machine.dragTo(amount, WIDTH);
          else if (op === 'release') machine.endDrag();
          else machine.cancelDrag();
          const frontClosed = machine.progress.cover === 0;
          const backClosed = machine.progress.swing === BACK_SWING_MAX || machine.phase() === 'closed';
          if (frontClosed && backClosed) {
            expect(turningLeafIndex(machine.pages)).toBeNull();
            expect(machine.pages.direction).toBeNull();
          }
          // The back close needs the end position; the gesture never moves a leaf.
          if (isBackClosingGesture(machine.pages)) expect(machine.pages.direction).toBeNull();
          if (machine.sequence.side === 'back' && machine.phase() === 'closing') expect(machine.pages.index).toBe(END_INDEX);
        }
      }),
      RUNS,
    );
  });
});

describe('back closing examples', () => {
  it('closes the front cover from the earlier pages, the back board from the end, and turns the last page first', () => {
    for (let page = 0; page < PAGE_COUNT - 1; page++) {
      const machine = openOn(page);
      machine.close();
      expect(machine.phase()).toBe('closing');
      expect(machine.sequence.side).toBe('front');
    }
    const end = openOn(END_INDEX);
    end.close();
    expect(end.phase()).toBe('closing');
    expect(end.sequence.side).toBe('back');

    const last = openOn(PAGE_COUNT - 1);
    last.close();
    // The last page turns by itself first: the book stays open until the turn has landed.
    expect(last.phase()).toBe('open');
    expect(last.pages.status).toBe('settling');
    expect(last.pages.autoTurn).toBe(true);
    run(last, 20);
    expect(last.phase()).toBe('closing');
    expect(last.sequence.side).toBe('back');
    expect(last.pages.index).toBe(END_INDEX);
  });

  it('closes with the front cover when closed while still opening', () => {
    const machine = createReadingMachine();
    machine.open(GUARD);
    machine.tick(MAX_FRAME_DELTA);
    machine.close();
    expect(machine.sequence.side).toBe('front');
  });

  it('keeps a close that waits for a turn, and picks the side by the page it lands on', () => {
    const toLast = openOn(PAGE_COUNT - 2);
    toLast.turnPage('next');
    toLast.close();
    expect(toLast.phase()).toBe('open');
    run(toLast, 20);
    // It landed on the last page, turned it by itself, and closed with the back board from the end.
    expect(toLast.phase()).toBe('closing');
    expect(toLast.sequence.side).toBe('back');
    expect(toLast.pages.index).toBe(END_INDEX);

    const awayFromLast = openOn(PAGE_COUNT - 1);
    awayFromLast.turnPage('prev');
    awayFromLast.close();
    run(awayFromLast, 20);
    expect(awayFromLast.sequence.side).toBe('front');
  });

  it('turns into and out of the end position with the arrow keys and never closes the book', () => {
    const machine = openOn(PAGE_COUNT - 1);
    machine.turnPage('next');
    run(machine, 20);
    expect(machine.phase()).toBe('open');
    expect(machine.pages).toEqual({ ...createPageTurnState(), index: END_INDEX });
    machine.turnPage('next');
    run(machine, 20);
    expect(machine.phase()).toBe('open');
    expect(machine.pages.index).toBe(END_INDEX);
    machine.turnPage('prev');
    run(machine, 20);
    expect(machine.phase()).toBe('open');
    expect(machine.pages.index).toBe(PAGE_COUNT - 1);
  });

  it('turns the last page from the right zone like any page, and back from the left zone in the end position', () => {
    const machine = openOn(PAGE_COUNT - 1);
    machine.beginDrag('right');
    machine.dragTo(-FULL, WIDTH);
    expect(machine.pages.direction).toBe('next');
    expect(machine.pages.closeDrag).toBe(false);
    machine.endDrag();
    run(machine, 20);
    expect(machine.pages.index).toBe(END_INDEX);
    expect(machine.phase()).toBe('open');
    machine.beginDrag('left');
    machine.dragTo(FULL, WIDTH);
    expect(machine.pages.direction).toBe('prev');
    machine.endDrag();
    run(machine, 20);
    expect(machine.pages.index).toBe(PAGE_COUNT - 1);
  });

  it('ignores a leftward drag from the left zone and a rightward drag from the right zone in the end position', () => {
    const machine = openOn(END_INDEX);
    machine.beginDrag('right');
    machine.dragTo(300, WIDTH);
    expect(isBackClosingGesture(machine.pages)).toBe(false);
    expect(backBoardAngle(machine.pages)).toBe(0);
  });

  it('with reduced motion style skip, ends closed on its base face up at once', () => {
    const machine = openOn(END_INDEX);
    machine.close();
    run(machine, 5);
    machine.skip();
    expect(machine.phase()).toBe('closed');
    expect(machine.progress).toEqual({ lift: 0, approach: 0, cover: 0, swing: 0 });
    expect(machine.sequence.side).toBe('front');
  });

  it('flips while the book is at full lift and the swing is the only thing that rotates it', () => {
    expect(BACK_FLIP.seconds).toBeGreaterThan(0);
    const machine = openOn(END_INDEX);
    machine.close();
    for (let i = 0; i < 400 && machine.phase() === 'closing'; i++) {
      machine.tick(MAX_FRAME_DELTA);
      if (machine.progress.swing > 0) expect(machine.progress.lift).toBe(1);
    }
  });
});

describe('back board geometry', () => {
  const assets = createBookAssets();
  afterAll(() => assets.dispose());

  it('never reaches below the bottom face of a closed book at any swing angle', () => {
    const model = createBookModel(assets);
    const pivot = new THREE.Group();
    pivot.position.set(BOOK_PIVOTS.frontBoard[0], 0, 0);
    model.root.position.set(-BOOK_PIVOTS.frontBoard[0], 0, 0);
    pivot.add(model.root);
    // A closed book: front cover and leaves folded flat.
    model.parts.cover.rotation.y = 0;
    for (let step = 0; step <= 36; step++) {
      pivot.rotation.y = -(Math.PI * step) / 36;
      pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.root);
      expect(box.min.z).toBeGreaterThanOrEqual(-BOOK_SIZE.depth / 2 - 0.001);
    }
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COVER_OPEN_ANGLE, MAX_FRAME_DELTA, PAGE_TURN, TOTAL_SECONDS } from '../book/bookTimings';
import { coverAngle, coverOpenFraction } from '../book/coverScrub';
import { createPageTurnState } from '../book/pageTurn';
import type { PageTurnState } from '../book/pageTurn';
import { createReadingMachine } from '../book/readingMachine';
import type { ReadingMachine } from '../book/readingMachine';

const RUNS = { numRuns: 200 };
const WIDTH = 400;
const FULL = WIDTH * PAGE_TURN.fullTurnRatio;
const COMMIT_PX = FULL * PAGE_TURN.commitThreshold;

/** An open book on page 0 with a drag from the left zone at `distance` px (rightward). */
function draggedMachine(distance: number): ReadingMachine {
  const machine = createReadingMachine();
  machine.open({ playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true });
  machine.skip();
  machine.beginDrag('left');
  machine.dragTo(distance, WIDTH);
  return machine;
}

function run(machine: ReadingMachine, steps: number): void {
  for (let i = 0; i < steps; i++) machine.tick(MAX_FRAME_DELTA);
}

describe('cover scrub properties', () => {
  it('Feature: graveyard-core, Property 33: The cover angle is monotonic in the drag progress', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -300, max: 900, noNaN: true }),
        fc.double({ min: -300, max: 900, noNaN: true }),
        (a, b) => {
          const [near, far] = a <= b ? [a, b] : [b, a];
          const machine = draggedMachine(near);
          const before = coverOpenFraction(machine.pages);
          machine.dragTo(far, WIDTH);
          const after = coverOpenFraction(machine.pages);
          expect(after).toBeLessThanOrEqual(before);
          expect(coverAngle(after)).toBeLessThanOrEqual(coverAngle(before));
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 34: Release below 50 percent returns exactly to the open state', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Math.ceil(COMMIT_PX) - 1 }), fc.boolean(), (distance, cancel) => {
        const machine = draggedMachine(distance);
        if (cancel) machine.cancelDrag();
        else machine.endDrag();
        expect(machine.phase()).toBe('open');
        run(machine, 10);
        expect(machine.phase()).toBe('open');
        expect(machine.sequence.t).toBe(TOTAL_SECONDS);
        expect(machine.progress.cover).toBe(1);
        expect(machine.pages).toEqual(createPageTurnState());
        expect(coverOpenFraction(machine.pages)).toBe(1);
        expect(coverAngle(coverOpenFraction(machine.pages))).toBe(COVER_OPEN_ANGLE);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 35: Release above 50 percent reaches closed without a jump', () => {
    fc.assert(
      fc.property(fc.integer({ min: Math.ceil(COMMIT_PX), max: 900 }), (distance) => {
        const machine = draggedMachine(distance);
        const scrubbed = coverOpenFraction(machine.pages);
        machine.endDrag();
        expect(machine.phase()).toBe('closing');
        let cover = machine.progress.cover;
        expect(Math.abs(cover - scrubbed)).toBeLessThan(1e-9);
        for (let i = 0; i < 200 && machine.phase() !== 'closed'; i++) {
          machine.tick(MAX_FRAME_DELTA);
          expect(machine.progress.cover).toBeLessThanOrEqual(cover + 1e-12);
          cover = machine.progress.cover;
        }
        expect(machine.phase()).toBe('closed');
        expect(machine.progress.cover).toBe(0);
        expect(machine.pages).toEqual(createPageTurnState());
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 36: The cover angle never leaves the open-to-closed range', () => {
    fc.assert(
      fc.property(
        fc.double(),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom<PageTurnState['status']>('idle', 'dragging', 'settling'),
        (progress, closeDrag, reducedMotion, status) => {
          const pages = { ...createPageTurnState(), progress, closeDrag, status };
          const fraction = coverOpenFraction(pages, reducedMotion);
          expect(fraction).toBeGreaterThanOrEqual(0);
          expect(fraction).toBeLessThanOrEqual(1);
          const angle = coverAngle(fraction);
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThanOrEqual(COVER_OPEN_ANGLE);
          // The angle function alone is safe for any number, NaN and infinities included.
          const raw = coverAngle(progress);
          expect(Number.isFinite(raw)).toBe(true);
          expect(raw).toBeGreaterThanOrEqual(0);
          expect(raw).toBeLessThanOrEqual(COVER_OPEN_ANGLE);
        },
      ),
      RUNS,
    );
  });
});

describe('cover scrub examples', () => {
  it('scrubs the cover with the drag and ignores a NaN drag distance', () => {
    const machine = draggedMachine(FULL * 0.25);
    expect(coverOpenFraction(machine.pages)).toBeCloseTo(0.75);
    machine.dragTo(Number.NaN, WIDTH);
    expect(coverOpenFraction(machine.pages)).toBeCloseTo(0.75);
  });

  it('does not scrub with reduced motion, and a release past the threshold still closes', () => {
    const machine = draggedMachine(FULL * 0.8);
    expect(coverOpenFraction(machine.pages, true)).toBe(1);
    machine.endDrag();
    expect(machine.phase()).toBe('closing');
  });

  it('keeps the book open while a short release settles, and a close waits for it', () => {
    const machine = draggedMachine(FULL * 0.2);
    machine.endDrag();
    machine.close();
    expect(machine.phase()).toBe('open');
    run(machine, 10);
    expect(machine.phase()).toBe('closing');
  });
});

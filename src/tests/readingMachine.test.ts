import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createReadingMachine } from '../book/readingMachine';
import type { ReadingMachine } from '../book/readingMachine';
import { isIdle } from '../book/pageTurn';
import type { TurnDirection } from '../book/pageTurn';
import { APPROACH_END, LIFT_END, MAX_FRAME_DELTA, PAGE_TURN, TOTAL_SECONDS } from '../book/bookTimings';
import { canOpenBook, uiModeForPhase } from '../interaction/uiMode';
import type { OpenGuardInput, UiMode } from '../interaction/uiMode';

const RUNS = { numRuns: 200 };
const GOOD: OpenGuardInput = { mode: 'exploring', pointerAllowsMovement: true, projectResting: true };
const MODES: UiMode[] = ['exploring', 'openingGrave', 'reading', 'closingGrave', 'burying', 'resurrecting', 'paused'];

const dtArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0, max: MAX_FRAME_DELTA, noNaN: true }),
  fc.double({ min: MAX_FRAME_DELTA, max: 5, noNaN: true }),
);
const guardArb: fc.Arbitrary<OpenGuardInput> = fc.record({
  mode: fc.constantFrom(...MODES),
  pointerAllowsMovement: fc.boolean(),
  projectResting: fc.boolean(),
});
const directionArb = fc.constantFrom<TurnDirection>('next', 'prev');

type Op =
  | { kind: 'open'; guard: OpenGuardInput }
  | { kind: 'close' | 'skip' | 'begin' | 'end' | 'cancel' }
  | { kind: 'drag'; dx: number }
  | { kind: 'turn'; direction: TurnDirection }
  | { kind: 'tick'; dt: number };

const eventArb: fc.Arbitrary<Op> = fc.oneof(
  guardArb.map((guard) => ({ kind: 'open' as const, guard })),
  fc.constantFrom<Op>({ kind: 'close' }, { kind: 'skip' }),
);
const pageOpArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom<Op>({ kind: 'begin' }, { kind: 'end' }, { kind: 'cancel' }),
  fc.integer({ min: -600, max: 600 }).map((dx) => ({ kind: 'drag' as const, dx })),
  directionArb.map((direction) => ({ kind: 'turn' as const, direction })),
);
const tickArb: fc.Arbitrary<Op> = dtArb.map((dt) => ({ kind: 'tick' as const, dt }));
const opArb = fc.oneof(eventArb, pageOpArb, tickArb);

function apply(machine: ReadingMachine, op: Op): void {
  switch (op.kind) {
    case 'open':
      machine.open(op.guard);
      break;
    case 'close':
      machine.close();
      break;
    case 'skip':
      machine.skip();
      break;
    case 'begin':
      machine.beginDrag();
      break;
    case 'end':
      machine.endDrag();
      break;
    case 'cancel':
      machine.cancelDrag();
      break;
    case 'drag':
      machine.dragTo(op.dx, 400);
      break;
    case 'turn':
      machine.turnPage(op.direction);
      break;
    case 'tick':
      machine.tick(op.dt);
      break;
  }
}

function opened(): ReadingMachine {
  const machine = createReadingMachine();
  machine.open(GOOD);
  machine.skip();
  return machine;
}

function tickBy(machine: ReadingMachine, total: number, chunk: number): void {
  let remaining = total;
  while (remaining > 0) {
    const step = Math.min(chunk, remaining);
    machine.tick(step);
    remaining -= step;
  }
}

function tickUntil(machine: ReadingMachine, done: () => boolean, dts: number[]): void {
  const settleFrames = Math.ceil((TOTAL_SECONDS + PAGE_TURN.settleSeconds) / MAX_FRAME_DELTA) + 2;
  for (const dt of [...dts, ...new Array<number>(settleFrames).fill(MAX_FRAME_DELTA)]) {
    if (done()) return;
    machine.tick(dt);
  }
}

describe('reading machine properties', () => {
  it('Feature: graveyard-core, Property 4: Open then close round trip', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 40 }), fc.array(dtArb, { maxLength: 40 }), (up, down) => {
        const machine = createReadingMachine();
        machine.open(GOOD);
        tickUntil(machine, () => machine.phase() === 'open', up);
        expect(machine.phase()).toBe('open');
        machine.close();
        tickUntil(machine, () => machine.phase() === 'closed', down);

        const fresh = createReadingMachine();
        expect(machine.sequence).toEqual(fresh.sequence);
        expect(machine.progress).toEqual(fresh.progress);
        expect(machine.pages).toEqual(fresh.pages);
        expect(machine.pages.index).toBe(0);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 5: One sequence at a time', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const machine = createReadingMachine();
        for (const op of ops) {
          const before = { ...machine.sequence };
          const accepted = op.kind === 'open' ? machine.open(op.guard) : false;
          if (op.kind === 'open') {
            expect(accepted).toBe(before.phase === 'closed' && canOpenBook(op.guard));
            if (accepted) expect(machine.sequence).toEqual({ phase: 'lifting', t: 0, closePending: false });
            else expect(machine.sequence).toEqual(before);
          } else {
            apply(machine, op);
          }
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 6: Pointer and input invariants', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 80 }), (ops) => {
        const machine = createReadingMachine();
        for (const op of ops) {
          apply(machine, op);
          const phase = machine.phase();
          expect(machine.pointerLockReleased()).toBe(phase === 'open');
          expect(machine.inputLocked()).toBe(phase !== 'closed');
          expect(machine.uiMode()).toBe(uiModeForPhase(phase));
          if (!isIdle(machine.pages)) expect(phase).toBe('open');
          if (phase === 'closed') {
            expect(isIdle(machine.pages)).toBe(true);
            expect(machine.pages.index).toBe(0);
          }
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 8: Frame-rate independence', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: TOTAL_SECONDS + 0.5, noNaN: true }),
        fc.double({ min: 0, max: PAGE_TURN.settleSeconds * 2, noNaN: true }),
        fc.double({ min: 0.002, max: MAX_FRAME_DELTA, noNaN: true }),
        fc.double({ min: 0.002, max: MAX_FRAME_DELTA, noNaN: true }),
        (openSeconds, turnSeconds, chunkA, chunkB) => {
          const a = createReadingMachine();
          const b = createReadingMachine();
          a.open(GOOD);
          b.open(GOOD);
          tickBy(a, openSeconds, chunkA);
          tickBy(b, openSeconds, chunkB);
          expect(a.sequence.t).toBeCloseTo(b.sequence.t, 6);
          const nearBoundary = [LIFT_END, APPROACH_END, TOTAL_SECONDS].some((x) => Math.abs(x - openSeconds) < 1e-6);
          if (!nearBoundary) expect(a.phase()).toBe(b.phase());

          const c = opened();
          const d = opened();
          c.turnPage('next');
          d.turnPage('next');
          tickBy(c, turnSeconds, chunkA);
          tickBy(d, turnSeconds, chunkB);
          if (Math.abs(turnSeconds - PAGE_TURN.settleSeconds) < 1e-6) return;
          expect(c.pages.index).toBe(d.pages.index);
          expect(c.pages.status).toBe(d.pages.status);
          expect(c.pages.progress).toBeCloseTo(d.pages.progress, 6);
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 12: Closing waits for pages', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(pageOpArb, tickArb), { maxLength: 30 }),
        fc.array(dtArb, { maxLength: 20 }),
        (pageOps, waits) => {
          const machine = opened();
          for (const op of pageOps) apply(machine, op);
          machine.close();
          const check = (): void => {
            if (machine.phase() === 'closing') expect(isIdle(machine.pages)).toBe(true);
            if (!isIdle(machine.pages)) expect(machine.phase()).toBe('open');
          };
          check();
          for (const dt of waits) {
            machine.tick(dt);
            check();
          }
          machine.endDrag();
          machine.cancelDrag();
          tickUntil(machine, () => machine.phase() === 'closed', []);
          expect(machine.phase()).toBe('closed');
        },
      ),
      RUNS,
    );
  });
});

describe('OPEN guard', () => {
  it('accepts exploring, free movement and a resting project', () => {
    expect(canOpenBook(GOOD)).toBe(true);
  });

  it.each(MODES.filter((mode) => mode !== 'exploring'))('refuses while the mode is %s', (mode) => {
    expect(canOpenBook({ ...GOOD, mode })).toBe(false);
  });

  it('refuses when the pointer does not allow movement', () => {
    expect(canOpenBook({ ...GOOD, pointerAllowsMovement: false })).toBe(false);
  });

  it('refuses when the project does not rest', () => {
    expect(canOpenBook({ ...GOOD, projectResting: false })).toBe(false);
  });

  it('leaves the machine closed when the guard refuses', () => {
    const machine = createReadingMachine();
    expect(machine.open({ ...GOOD, mode: 'burying' })).toBe(false);
    expect(machine.phase()).toBe('closed');
    expect(machine.inputLocked()).toBe(false);
  });
});

describe('reading machine examples', () => {
  it('reports each phase and the matching UI mode on the way open', () => {
    const machine = createReadingMachine();
    expect(machine.uiMode()).toBe('exploring');
    machine.open(GOOD);
    expect(machine.uiMode()).toBe('openingGrave');
    machine.tick(0);
    machine.skip();
    expect(machine.uiMode()).toBe('reading');
    expect(machine.pointerLockReleased()).toBe(true);
    machine.close();
    expect(machine.uiMode()).toBe('closingGrave');
    expect(machine.pointerLockReleased()).toBe(false);
    expect(machine.inputLocked()).toBe(true);
  });

  it('ignores page events outside open', () => {
    const machine = createReadingMachine();
    machine.turnPage('next');
    machine.beginDrag();
    expect(isIdle(machine.pages)).toBe(true);
    machine.open(GOOD);
    machine.turnPage('next');
    expect(isIdle(machine.pages)).toBe(true);
  });

  it('keeps the same records for its whole life', () => {
    const machine = createReadingMachine();
    const { sequence, progress, pages } = machine;
    machine.open(GOOD);
    machine.tick(0.05);
    machine.skip();
    machine.turnPage('next');
    expect(machine.sequence).toBe(sequence);
    expect(machine.progress).toBe(progress);
    expect(machine.pages).toBe(pages);
  });

  it('notifies on discrete changes only and stops after unsubscribe', () => {
    const machine = createReadingMachine();
    let calls = 0;
    const unsubscribe = machine.subscribe(() => {
      calls += 1;
    });
    machine.tick(0.05);
    expect(calls).toBe(0);
    machine.open(GOOD);
    expect(calls).toBe(1);
    machine.tick(0.05);
    expect(calls).toBe(1);
    machine.skip();
    expect(calls).toBe(2);
    machine.turnPage('next');
    expect(calls).toBe(3);
    machine.tick(0.05);
    expect(calls).toBe(3);
    const version = machine.version();
    unsubscribe();
    tickBy(machine, PAGE_TURN.settleSeconds + 0.1, MAX_FRAME_DELTA);
    expect(machine.pages.index).toBe(1);
    expect(calls).toBe(3);
    expect(machine.version()).toBe(version + 1);
  });

  it('returns to page 0 after a full open, turn, close cycle', () => {
    const machine = opened();
    machine.turnPage('next');
    tickBy(machine, PAGE_TURN.settleSeconds + 0.1, MAX_FRAME_DELTA);
    expect(machine.pages.index).toBe(1);
    machine.close();
    tickBy(machine, TOTAL_SECONDS + 0.1, MAX_FRAME_DELTA);
    expect(machine.phase()).toBe('closed');
    expect(machine.pages.index).toBe(0);
  });
});

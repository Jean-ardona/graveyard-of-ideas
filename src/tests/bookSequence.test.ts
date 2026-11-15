import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applySequenceEvent,
  clampDelta,
  createSequenceProgress,
  createSequenceState,
  isOpening,
  tickSequence,
  writeProgress,
} from '../book/bookSequence';
import type { BookEvent, SequenceProgress, SequenceState } from '../book/bookSequence';
import { APPROACH_END, LIFT_END, MAX_FRAME_DELTA, TOTAL_SECONDS } from '../book/bookTimings';

const RUNS = { numRuns: 200 };

/** Frame steps including zero and values above the clamp. */
const dtArb = fc.oneof(
  fc.constant(0),
  fc.double({ min: 0, max: MAX_FRAME_DELTA, noNaN: true }),
  fc.double({ min: MAX_FRAME_DELTA, max: 5, noNaN: true }),
);

type Op = { event: BookEvent } | { dt: number };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom<BookEvent>('OPEN', 'CLOSE', 'SKIP').map((event) => ({ event })),
  dtArb.map((dt) => ({ dt })),
);

function apply(state: SequenceState, op: Op): void {
  if ('event' in op) applySequenceEvent(state, op.event, true);
  else tickSequence(state, op.dt, true);
}

function progressAt(state: SequenceState): SequenceProgress {
  const out = createSequenceProgress();
  writeProgress(state.t, out);
  return out;
}

function expectedOpeningPhase(t: number): string {
  if (t < LIFT_END) return 'lifting';
  if (t < APPROACH_END) return 'approaching';
  return 'coverOpening';
}

describe('sequence properties', () => {
  it('Feature: graveyard-core, Property 1: Sequence state is always consistent', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const state = createSequenceState();
        for (const op of ops) {
          apply(state, op);
          const progress = progressAt(state);
          expect(state.t).toBeGreaterThanOrEqual(0);
          expect(state.t).toBeLessThanOrEqual(TOTAL_SECONDS);
          for (const value of [progress.lift, progress.approach, progress.cover]) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
          if (isOpening(state.phase)) expect(state.phase).toBe(expectedOpeningPhase(state.t));
          if (state.phase === 'closed') {
            expect(state.t).toBe(0);
            expect([progress.lift, progress.approach, progress.cover]).toEqual([0, 0, 0]);
          }
          if (state.phase === 'open') {
            expect(state.t).toBe(TOTAL_SECONDS);
            for (const value of [progress.lift, progress.approach, progress.cover]) {
              expect(value).toBeCloseTo(1, 9);
            }
          }
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 2: Opening completes', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 40 }), (dts) => {
        const state = createSequenceState();
        applySequenceEvent(state, 'OPEN', true);
        const enough = new Array<number>(Math.ceil(TOTAL_SECONDS / MAX_FRAME_DELTA) + 1).fill(MAX_FRAME_DELTA);
        for (const dt of [...dts, ...enough]) {
          const before = state.t;
          tickSequence(state, dt, true);
          expect(state.t).toBeGreaterThanOrEqual(before);
        }
        expect(state.phase).toBe('open');
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 3: Reversal retraces and never jumps', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 30 }), fc.array(dtArb, { maxLength: 80 }), (opening, closing) => {
        const state = createSequenceState();
        applySequenceEvent(state, 'OPEN', true);
        for (const dt of opening) tickSequence(state, dt, true);
        fc.pre(isOpening(state.phase));
        const t = state.t;
        const before = progressAt(state);
        applySequenceEvent(state, 'CLOSE', true);
        expect(state.phase).toBe('closing');
        expect(state.t).toBe(t);
        expect(progressAt(state)).toEqual(before);
        for (const dt of [...closing, ...new Array<number>(50).fill(MAX_FRAME_DELTA)]) {
          const last = state.t;
          tickSequence(state, dt, true);
          expect(state.t).toBeLessThanOrEqual(last);
        }
        expect(state.phase).toBe('closed');
        expect(state.t).toBe(0);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 7: Skip reaches the fixed points', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const state = createSequenceState();
        for (const op of ops) apply(state, op);
        const phase = state.phase;
        const snapshot = { ...state };
        applySequenceEvent(state, 'SKIP', true);
        if (isOpening(phase)) {
          expect(state.phase).toBe('open');
          expect(state.t).toBe(TOTAL_SECONDS);
        } else if (phase === 'closing') {
          expect(state.phase).toBe('closed');
          expect(state.t).toBe(0);
        } else {
          expect(state).toEqual(snapshot);
        }
      }),
      RUNS,
    );
  });
});

describe('sequence examples', () => {
  function stateAt(t: number): SequenceState {
    return { phase: 'lifting', t, closePending: false };
  }

  it('changes phase exactly at the end of each step', () => {
    const below = 1e-4;
    const cases: Array<[number, string]> = [
      [LIFT_END - below, 'lifting'],
      [LIFT_END, 'approaching'],
      [APPROACH_END - below, 'approaching'],
      [APPROACH_END, 'coverOpening'],
      [TOTAL_SECONDS - below, 'coverOpening'],
      [TOTAL_SECONDS, 'open'],
    ];
    for (const [t, phase] of cases) {
      const state = stateAt(t);
      tickSequence(state, 0, true);
      expect(state.phase).toBe(phase);
    }
  });

  it('discards the time left over at the end points', () => {
    const opening = stateAt(TOTAL_SECONDS - MAX_FRAME_DELTA / 5);
    tickSequence(opening, MAX_FRAME_DELTA, true);
    expect(opening).toEqual({ phase: 'open', t: TOTAL_SECONDS, closePending: false });

    const closing: SequenceState = { phase: 'closing', t: MAX_FRAME_DELTA / 5, closePending: false };
    tickSequence(closing, MAX_FRAME_DELTA, true);
    expect(closing).toEqual({ phase: 'closed', t: 0, closePending: false });
  });

  it('ignores OPEN while running and CLOSE or SKIP while closed', () => {
    const running = stateAt(LIFT_END + 0.1);
    running.phase = 'approaching';
    applySequenceEvent(running, 'OPEN', true);
    expect(running).toEqual({ phase: 'approaching', t: LIFT_END + 0.1, closePending: false });

    const closed = createSequenceState();
    applySequenceEvent(closed, 'CLOSE', true);
    applySequenceEvent(closed, 'SKIP', true);
    expect(closed).toEqual(createSequenceState());
  });

  it('keeps CLOSE pending in open until the pages are idle', () => {
    const state: SequenceState = { phase: 'open', t: TOTAL_SECONDS, closePending: false };
    applySequenceEvent(state, 'CLOSE', false);
    expect(state.phase).toBe('open');
    expect(state.closePending).toBe(true);
    tickSequence(state, 0, false);
    expect(state.phase).toBe('open');
    tickSequence(state, 0, true);
    expect(state.phase).toBe('closing');
    expect(state.closePending).toBe(false);
  });

  it('clamps frame steps and treats invalid ones as zero', () => {
    expect(clampDelta(1)).toBe(MAX_FRAME_DELTA);
    expect(clampDelta(0.01)).toBe(0.01);
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
  });
});

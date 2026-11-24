import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isAmberHue } from '../ui/theme/colorMath';
import { TOKENS } from '../ui/theme/tokens';
import {
  BOOK_PARTS,
  EMBERS_SECONDS,
  FIRST_SPECTER_STEP,
  MAX_FRAME_DELTA,
  STEPS,
  STEP_COUNT,
  TOTAL_SECONDS,
  createResurrectionEffects,
  createResurrectionProgress,
  createResurrectionState,
  finishResurrection,
  tickResurrection,
} from '../cinematics/resurrectionTimeline';
import { RESURRECTION_BUDGET, createEmberField, writeEmbers } from '../cinematics/resurrectionVisuals';
import { createSpecterBuffers, createSpecterSeeds, writeSpecter } from '../cinematics/specterParticles';
import { GROUP_B_TOTAL, RETURN_SECONDS, SPECTER_BUDGET, SPECTER_PHASES, SPECTER_TOTAL } from '../cinematics/specterTimings';

function rig() {
  return {
    state: createResurrectionState(),
    progress: createResurrectionProgress(),
    effects: createResurrectionEffects(),
  };
}

type Rig = ReturnType<typeof rig>;

function tick(r: Rig, dt: number, instant = false): void {
  tickResurrection(r.state, r.progress, r.effects, dt, instant);
}

/** Frame steps: normal, zero, huge, negative and NaN values. */
const dtArb = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: 0, max: 0.2, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 5, 1e9, -1, Number.NaN, Number.POSITIVE_INFINITY) },
);

const GROUP_B_STEPS = ['gather', 'form', 'depart', 'vanish', 'return'] as const;

describe('resurrection timeline', () => {
  it('Feature: graveyard-core, Property 77: The embers finish and the book is gone before any specter step begins', () => {
    const seeds = createSpecterSeeds(SPECTER_BUDGET.low);
    const buffers = createSpecterBuffers(SPECTER_BUDGET.low);
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 200 }), (dts) => {
        const r = rig();
        let previousStep = 0;
        for (const dt of dts) {
          tick(r, dt);
          const { progress, state, effects } = r;
          const groupBStarted = progress.groupBTime > 0 || progress.specterTime > 0;
          if (groupBStarted) {
            // Strict ordering: group A completed, all four parts are gone, and the step index agrees.
            expect(state.step).toBeGreaterThanOrEqual(FIRST_SPECTER_STEP);
            expect(effects.bookGone).toBe(true);
            for (const part of BOOK_PARTS) expect(progress[part]).toBe(1);
            expect(progress.embers).toBe(1);
          } else {
            // Nothing of the specter is on stage: its particles are all parked.
            expect(writeSpecter(seeds, progress.specterTime, 0.3, buffers)).toBe(0);
          }
          if (state.step < FIRST_SPECTER_STEP) {
            expect(progress.groupBTime).toBe(0);
            expect(progress.specterTime).toBe(0);
          }
          // `done` only after every step.
          expect(effects.done).toBe(state.step === STEP_COUNT);
          // Each step starts only when the previous one is at 1: the step index never goes back, and the
          // time spent in the current step never exceeds its length.
          expect(state.step).toBeGreaterThanOrEqual(previousStep);
          previousStep = state.step;
          if (state.step < STEP_COUNT) expect(state.elapsed).toBeLessThanOrEqual(STEPS[state.step]!.seconds + 1e-9);
          if (state.step >= 1) expect(progress.embers).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: graveyard-core, Property 78: The timeline is bounded, frame-rate independent, in place and instant with reduced motion', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 120 }), fc.integer({ min: 1, max: 12 }), (dts, pieces) => {
        const r = rig();
        const { state, progress, effects } = r;
        let previous = -1;
        let previousB = 0;
        for (const dt of dts) {
          tick(r, dt);
          for (const key of ['embers', 'cover', 'spine', 'pageBlock', 'pages'] as const) {
            expect(progress[key]).toBeGreaterThanOrEqual(0);
            expect(progress[key]).toBeLessThanOrEqual(1);
          }
          expect(progress.groupBTime).toBeGreaterThanOrEqual(0);
          expect(progress.groupBTime).toBeLessThanOrEqual(GROUP_B_TOTAL);
          expect(progress.specterTime).toBeGreaterThanOrEqual(0);
          expect(progress.specterTime).toBeLessThanOrEqual(SPECTER_TOTAL);
          expect(progress.specterTime).toBe(Math.min(progress.groupBTime, SPECTER_TOTAL));
          expect(progress.groupBTime).toBeGreaterThanOrEqual(previousB);
          previousB = progress.groupBTime;
          const position = state.step * 1000 + state.elapsed;
          expect(position).toBeGreaterThanOrEqual(previous);
          previous = position;
        }
        // In place: the same records after any number of ticks.
        expect(r.state).toBe(state);
        expect(r.progress).toBe(progress);
        expect(r.effects).toBe(effects);

        // The same total time split into different pieces (each below the clamp) gives the same result.
        const total = Math.min(2.5, MAX_FRAME_DELTA * pieces);
        const whole = rig();
        const split = rig();
        for (let remaining = total; remaining > 1e-12; remaining -= MAX_FRAME_DELTA) tick(whole, Math.min(remaining, MAX_FRAME_DELTA));
        for (let i = 0; i < pieces * 4; i++) tick(split, total / (pieces * 4));
        expect(split.state.step).toBe(whole.state.step);
        expect(split.state.elapsed).toBeCloseTo(whole.state.elapsed, 6);
        expect(split.progress.groupBTime).toBeCloseTo(whole.progress.groupBTime, 6);
        expect(split.progress.specterTime).toBeCloseTo(whole.progress.specterTime, 6);

        // Reduced motion (instant): one tick reaches the final state, whatever came before.
        const instant = rig();
        tick(instant, 0.016, true);
        const final = rig();
        finishResurrection(final.state, final.progress, final.effects);
        expect(instant).toEqual(final);
        expect(instant.effects).toEqual({ bookGone: true, done: true });
        expect(instant.progress.groupBTime).toBe(GROUP_B_TOTAL);
        expect(instant.progress.specterTime).toBe(SPECTER_TOTAL);
      }),
      { numRuns: 100 },
    );
  });

  it('plays the whole sequence in the sum of its steps and ends with the final state', () => {
    const r = rig();
    const frames = Math.ceil(TOTAL_SECONDS / 0.05) + 5;
    for (let i = 0; i < frames; i++) tick(r, 0.05);
    expect(r.effects.done).toBe(true);
    expect(r.progress).toEqual({
      embers: 1, cover: 1, spine: 1, pageBlock: 1, pages: 1, groupBTime: 9.4, specterTime: 7.8,
    });
    expect(STEPS.map((step) => step.id)).toEqual(['embers', 'gather', 'form', 'depart', 'vanish', 'return']);
    expect(STEPS.map((step) => step.seconds)).toEqual([3.4, 2.0, 1.4, 3.4, 1.0, 1.6]);
  });

  it('builds the steps from the specter timing constants', () => {
    expect(GROUP_B_STEPS.map((id) => STEPS.find((step) => step.id === id)?.seconds)).toEqual([
      SPECTER_PHASES.gather.duration,
      SPECTER_PHASES.form.duration,
      SPECTER_PHASES.depart.duration,
      SPECTER_PHASES.vanish.duration,
      RETURN_SECONDS,
    ]);
    expect(TOTAL_SECONDS).toBeCloseTo(EMBERS_SECONDS + GROUP_B_TOTAL, 9);
  });

  it('reports group B times that follow the steps once the book is gone', () => {
    const r = rig();
    for (let i = 0; i < 40; i++) tick(r, 0.1);
    expect(r.state.step).toBe(1);
    expect(r.progress.groupBTime).toBeCloseTo(0.6, 6);
    for (let i = 0; i < 71; i++) tick(r, 0.1);
    // 3.4 s of embers plus 7.7 s of group B: the vanish step is running.
    expect(r.state.step).toBe(4);
    expect(r.progress.specterTime).toBeCloseTo(7.7, 6);
    expect(r.progress.groupBTime).toBe(r.progress.specterTime);
  });

  it('dissolves the four parts in a staggered way and keeps the book whole at the start', () => {
    const r = rig();
    expect(BOOK_PARTS).toEqual(['cover', 'spine', 'pageBlock', 'pages']);
    tick(r, 0.1);
    expect(r.effects.bookGone).toBe(false);
    for (let i = 0; i < 60 && !r.effects.bookGone; i++) {
      tick(r, 0.1);
      // The cover is never behind the last part.
      expect(r.progress.cover).toBeGreaterThanOrEqual(r.progress.pages);
    }
    expect(r.effects.bookGone).toBe(true);
    // The tomb has not changed yet: group B has not advanced.
    expect(r.state.step).toBe(0);
    expect(r.progress.groupBTime).toBe(0);
    expect(r.progress.specterTime).toBe(0);
  });
});

describe('resurrection visuals', () => {
  it('Feature: graveyard-core, Property 79: Embers are amber and bounded (ember part)', () => {
    const emberTokens = Object.values(TOKENS.ember);
    expect(emberTokens.every((hex) => isAmberHue(hex))).toBe(true);
    fc.assert(
      fc.property(fc.constantFrom(...(['low', 'medium', 'high'] as const)), fc.array(dtArb, { maxLength: 150 }), (quality, dts) => {
        const r = rig();
        const embers = createEmberField(RESURRECTION_BUDGET[quality].embers);
        for (const dt of dts) {
          tick(r, dt);
          writeEmbers(embers, r.progress);
          for (let i = 0; i < embers.count; i++) {
            const [red, green, blue] = [embers.colors[i * 3]!, embers.colors[i * 3 + 1]!, embers.colors[i * 3 + 2]!];
            // Amber, never blue: red leads, blue trails, and every channel is a valid brightness.
            expect(red).toBeGreaterThanOrEqual(green);
            expect(green).toBeGreaterThanOrEqual(blue);
            expect(red).toBeLessThanOrEqual(1);
            expect(Number.isFinite(embers.positions[i * 3 + 1]!)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('keeps Low the smallest budget and leaves no ember visible at the end', () => {
    const { low, medium, high } = RESURRECTION_BUDGET;
    expect(low.embers).toBeLessThan(medium.embers);
    expect(medium.embers).toBeLessThan(high.embers);
    const r = rig();
    finishResurrection(r.state, r.progress, r.effects);
    const embers = createEmberField(low.embers);
    writeEmbers(embers, r.progress);
    expect(Array.from(embers.colors).every((value) => value === 0)).toBe(true);
  });
});

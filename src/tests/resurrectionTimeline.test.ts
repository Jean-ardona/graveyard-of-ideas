import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isAmberHue } from '../ui/theme/colorMath';
import { TOKENS } from '../ui/theme/tokens';
import {
  BOOK_PARTS,
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
import {
  RESURRECTION_BUDGET,
  SPECTER_FLY_DISTANCE,
  createEmberField,
  createSmokeField,
  createSpecterPose,
  writeEmbers,
  writeSmoke,
  writeSpecterPose,
} from '../cinematics/resurrectionVisuals';

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

const SPECTER_KEYS = ['smoke', 'form', 'rise', 'fly', 'fade'] as const;

describe('resurrection timeline', () => {
  it('Feature: graveyard-core, Property 77: The embers finish and the book is gone before any specter step begins', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 200 }), (dts) => {
        const r = rig();
        for (const dt of dts) {
          tick(r, dt);
          const specterStarted = SPECTER_KEYS.some((key) => r.progress[key] > 0);
          if (specterStarted) {
            // Strict ordering: group A completed, all four parts are gone, and the step index agrees.
            expect(r.state.step).toBeGreaterThanOrEqual(FIRST_SPECTER_STEP);
            expect(r.effects.bookGone).toBe(true);
            for (const part of BOOK_PARTS) expect(r.progress[part]).toBe(1);
            expect(r.progress.embers).toBe(1);
          }
          if (r.state.step < FIRST_SPECTER_STEP) expect(SPECTER_KEYS.every((key) => r.progress[key] === 0)).toBe(true);
          // `done` only after every step.
          expect(r.effects.done).toBe(r.state.step === STEP_COUNT);
          // A later step never runs ahead of an earlier one.
          const order = ['embers', ...SPECTER_KEYS] as const;
          for (let i = 1; i < order.length; i++) {
            if (r.progress[order[i]!] > 0) expect(r.progress[order[i - 1]!]).toBe(1);
          }
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
        for (const dt of dts) {
          tick(r, dt);
          for (const value of Object.values(progress)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
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

        // Reduced motion (instant): one tick reaches the final state, whatever came before.
        const instant = rig();
        tick(instant, 0.016, true);
        const final = rig();
        finishResurrection(final.state, final.progress, final.effects);
        expect(instant).toEqual(final);
        expect(instant.effects).toEqual({ bookGone: true, done: true });
      }),
      { numRuns: 100 },
    );
  });

  it('plays the whole sequence in the sum of its steps and ends with every visual at its end value', () => {
    const r = rig();
    const frames = Math.ceil(TOTAL_SECONDS / 0.05) + 5;
    for (let i = 0; i < frames; i++) tick(r, 0.05);
    expect(r.effects.done).toBe(true);
    expect(r.progress).toEqual({
      embers: 1, cover: 1, spine: 1, pageBlock: 1, pages: 1, smoke: 1, form: 1, rise: 1, fly: 1, fade: 1,
    });
    expect(STEPS.map((step) => step.id)).toEqual(['embers', 'smoke', 'form', 'rise', 'fly', 'fade']);
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
    // The tomb has not changed yet: no step of group B has advanced.
    expect(r.state.step).toBe(0);
    expect(r.progress.smoke).toBe(0);
  });
});

describe('resurrection visuals', () => {
  it('Feature: graveyard-core, Property 79: Embers are amber and bounded, and the specter is harmless', () => {
    const emberTokens = Object.values(TOKENS.ember);
    expect(emberTokens.every((hex) => isAmberHue(hex))).toBe(true);
    fc.assert(
      fc.property(
        fc.constantFrom(...(['low', 'medium', 'high'] as const)),
        fc.array(dtArb, { maxLength: 150 }),
        fc.double({ min: -7, max: 7, noNaN: true }),
        (quality, dts, heading) => {
          const r = rig();
          const embers = createEmberField(RESURRECTION_BUDGET[quality].embers);
          const smoke = createSmokeField(RESURRECTION_BUDGET[quality].puffs);
          const pose = createSpecterPose();
          let lastAway = 0;
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
            writeSmoke(smoke, r.progress);
            expect(smoke.opacity).toBeGreaterThanOrEqual(0);
            expect(smoke.opacity).toBeLessThanOrEqual(1);
            // No smoke before the book is gone.
            if (!r.effects.bookGone) expect(smoke.opacity).toBe(0);

            writeSpecterPose(r.progress, heading, pose);
            for (const value of [pose.x, pose.y, pose.z, pose.scale, pose.opacity]) expect(Number.isFinite(value)).toBe(true);
            expect(pose.opacity).toBeGreaterThanOrEqual(0);
            expect(pose.opacity).toBeLessThanOrEqual(1);
            // Harmless: it moves away from the tomb along a fixed heading, never back toward it, and stays bounded.
            const away = -(pose.x * Math.sin(heading) + pose.z * Math.cos(heading));
            expect(away).toBeGreaterThanOrEqual(lastAway - 1e-9);
            lastAway = away;
            expect(Math.hypot(pose.x, pose.z)).toBeLessThanOrEqual(SPECTER_FLY_DISTANCE + 5);
            // Invisible before the book is gone.
            if (!r.effects.bookGone) expect(pose.opacity).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('keeps Low the smallest budget and leaves nothing visible at the end', () => {
    const { low, medium, high } = RESURRECTION_BUDGET;
    expect(low.embers).toBeLessThan(medium.embers);
    expect(medium.embers).toBeLessThan(high.embers);
    expect(low.puffs).toBeLessThanOrEqual(medium.puffs);
    const r = rig();
    finishResurrection(r.state, r.progress, r.effects);
    const embers = createEmberField(low.embers);
    const pose = createSpecterPose();
    const smoke = createSmokeField(low.puffs);
    writeEmbers(embers, r.progress);
    writeSmoke(smoke, r.progress);
    writeSpecterPose(r.progress, 0.4, pose);
    expect(Array.from(embers.colors).every((value) => value === 0)).toBe(true);
    expect(smoke.opacity).toBe(0);
    expect(pose.opacity).toBe(0);
  });
});

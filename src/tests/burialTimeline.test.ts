/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_FRAME_DELTA, burialDuration, createBurialTimeline, skipBurial, tickBurial } from '../cinematics/burialTimeline';
import type { BurialTimeline } from '../cinematics/burialTimeline';
import {
  APPEAR_SECONDS,
  DOLLY_ARC_HEIGHT,
  DOLLY_IN,
  GLOW_FADE_SECONDS,
  HOLD,
  HOLD_DISTANCE,
  HOLD_END,
  RETURN,
  TOTAL_SECONDS,
} from '../cinematics/burialTimings';

const SOURCES = import.meta.glob<string>(
  [
    '../cinematics/burialTimings.ts',
    '../cinematics/burialTimeline.ts',
    '../cinematics/burialCamera.ts',
    '../cinematics/lookAtSlot.ts',
    '../interaction/revealPending.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const dtArb = fc.oneof(
  fc.double({ min: -1, max: 1, noNaN: true }),
  fc.constantFrom(0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.016, 0.1, 5),
);

const FINAL = [1, 1, 0, 1];

function values(timeline: BurialTimeline): number[] {
  const { dolly, appear, glow, back } = timeline.progress;
  return [dolly, appear, glow, back];
}

function snapshot(timeline: BurialTimeline): { progress: number[]; done: boolean } {
  return { progress: values(timeline), done: timeline.effects.done };
}

/** Ticks with fixed steps until `seconds` have passed. */
function playTo(timeline: BurialTimeline, seconds: number): void {
  while (timeline.elapsed < seconds - 1e-9) tickBurial(timeline, 0.01, false);
}

describe('burial timeline', () => {
  it('has the documented steps and a total of 4.8 seconds', () => {
    expect([DOLLY_IN, HOLD, RETURN]).toEqual([1.8, 1.6, 1.4]);
    expect(TOTAL_SECONDS).toBe(4.8);
    expect(DOLLY_IN + HOLD + RETURN).toBeCloseTo(TOTAL_SECONDS, 10);
    expect([APPEAR_SECONDS, GLOW_FADE_SECONDS, HOLD_DISTANCE, DOLLY_ARC_HEIGHT]).toEqual([1.0, 0.6, 3.0, 1.5]);
    expect(burialDuration(false)).toBe(TOTAL_SECONDS);
    expect(burialDuration(true)).toBe(0);
  });

  it('plays dolly, hold and return in order and ends with the glow at 0', () => {
    const timeline = createBurialTimeline();
    expect(snapshot(timeline)).toEqual({ progress: [0, 0, 0, 0], done: false });
    tickBurial(timeline, MAX_FRAME_DELTA, false);
    expect(timeline.progress.dolly).toBeGreaterThan(0);
    expect(timeline.progress.appear).toBe(0);
    expect(timeline.progress.back).toBe(0);
    for (let i = 0; i < 200 && !timeline.effects.done; i += 1) tickBurial(timeline, 0.05, false);
    expect(snapshot(timeline)).toEqual({ progress: FINAL, done: true });
  });

  it('shows the book only from the hold, keeps the glow while it rises and fades it before the return', () => {
    const timeline = createBurialTimeline();
    let peak = 0;
    let appearedBeforeHold = false;
    let glowAfterHold = false;
    while (!timeline.effects.done) {
      tickBurial(timeline, 0.01, false);
      if (timeline.effects.done) break;
      peak = Math.max(peak, timeline.progress.glow);
      if (timeline.progress.appear > 0 && timeline.elapsed < DOLLY_IN) appearedBeforeHold = true;
      if (timeline.progress.glow > 0 && timeline.elapsed > HOLD_END) glowAfterHold = true;
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(appearedBeforeHold).toBe(false);
    expect(glowAfterHold).toBe(false);
  });

  it('rises over the first second of the hold and starts the return only after it', () => {
    const timeline = createBurialTimeline();
    playTo(timeline, DOLLY_IN + APPEAR_SECONDS);
    expect(timeline.progress.dolly).toBe(1);
    expect(timeline.progress.appear).toBeGreaterThan(0.99);
    expect(timeline.progress.back).toBe(0);
    playTo(timeline, HOLD_END + RETURN / 2);
    expect(timeline.progress.glow).toBe(0);
    expect(timeline.progress.back).toBeGreaterThan(0.4);
    expect(timeline.progress.back).toBeLessThan(0.6);
  });

  it('Feature: graveyard-core, Property 75: The timeline is bounded, frame-rate independent, in place, and instant with reduced motion', () => {
    fc.assert(
      fc.property(fc.array(dtArb, { maxLength: 80 }), fc.boolean(), (dts, instant) => {
        const timeline = createBurialTimeline();
        const { progress, effects } = timeline;
        let lastElapsed = 0;
        for (const dt of dts) {
          tickBurial(timeline, dt, instant);
          for (const value of values(timeline)) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
          expect(timeline.elapsed).toBeGreaterThanOrEqual(lastElapsed);
          expect(timeline.elapsed).toBeLessThanOrEqual(timeline.duration);
          lastElapsed = timeline.elapsed;
          expect(timeline.progress).toBe(progress);
          expect(timeline.effects).toBe(effects);
          if (instant) expect(snapshot(timeline)).toEqual({ progress: FINAL, done: true });
        }
      }),
      { numRuns: 150 },
    );
  });

  it('Feature: graveyard-core, Property 75: the same total time split differently gives the same progress', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 12 }), (steps, pieces) => {
        const total = (steps * MAX_FRAME_DELTA) / 4;
        const whole = createBurialTimeline();
        const split = createBurialTimeline();
        // Both use steps at or below the clamp: one of `step` seconds, the other of `step / pieces`.
        const step = total / steps;
        for (let i = 0; i < steps; i += 1) tickBurial(whole, step, false);
        for (let i = 0; i < steps * pieces; i += 1) tickBurial(split, step / pieces, false);
        values(whole).forEach((value, index) => expect(values(split)[index]).toBeCloseTo(value, 8));
      }),
      { numRuns: 120 },
    );
  });

  it('clamps one large step to the frame limit', () => {
    const big = createBurialTimeline();
    const clamped = createBurialTimeline();
    tickBurial(big, 50, false);
    tickBurial(clamped, MAX_FRAME_DELTA, false);
    expect(big.elapsed).toBe(clamped.elapsed);
  });

  it('Feature: graveyard-core, Property 74: skip lands on the final state for any time, from any history', () => {
    fc.assert(
      fc.property(
        fc.array(dtArb, { maxLength: 60 }),
        fc.oneof(fc.double(), fc.constantFrom(Number.NaN, -1, 0, TOTAL_SECONDS, 99, Number.POSITIVE_INFINITY)),
        (dts, at) => {
          const timeline = createBurialTimeline();
          for (const dt of dts) tickBurial(timeline, dt, false);
          const { progress, effects } = timeline;
          skipBurial(timeline, at);
          expect(snapshot(timeline)).toEqual({ progress: FINAL, done: true });
          expect(timeline.elapsed).toBe(TOTAL_SECONDS);
          expect(timeline.progress).toBe(progress);
          expect(timeline.effects).toBe(effects);

          // The skipped state equals the state reached by playing on without skipping.
          const played = createBurialTimeline();
          for (let i = 0; i < 100; i += 1) tickBurial(played, MAX_FRAME_DELTA, false);
          expect(snapshot(played)).toEqual(snapshot(timeline));
          expect(played.elapsed).toBe(timeline.elapsed);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('keeps the pure modules free of React, Three.js, DOM, store and timers', () => {
    const entries = Object.entries(SOURCES);
    expect(entries).toHaveLength(5);
    for (const [file, source] of entries) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code, file).not.toMatch(/from\s+['"][^'"]*(store|domain)[^'"]*['"]/);
      expect(code, file).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
      expect(code, file).not.toMatch(/Math\.random/);
    }
  });
});

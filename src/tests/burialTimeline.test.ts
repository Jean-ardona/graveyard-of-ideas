/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  APPEAR,
  MAX_FRAME_DELTA,
  SETTLE,
  TOTAL_SECONDS,
  TURN,
  burialDuration,
  createBurialTimeline,
  skipBurial,
  tickBurial,
} from '../cinematics/burialTimeline';
import type { BurialTimeline } from '../cinematics/burialTimeline';

const SOURCES = import.meta.glob<string>(
  ['../cinematics/burialTimeline.ts', '../cinematics/lookAtSlot.ts', '../interaction/revealPending.ts'],
  { query: '?raw', import: 'default', eager: true },
);

const dtArb = fc.oneof(
  fc.double({ min: -1, max: 1, noNaN: true }),
  fc.constantFrom(0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.016, 0.1, 5),
);

function values(timeline: BurialTimeline): number[] {
  const { turn, appear, glow, settle } = timeline.progress;
  return [turn, appear, glow, settle];
}

function snapshot(timeline: BurialTimeline): { progress: number[]; done: boolean } {
  return { progress: values(timeline), done: timeline.effects.done };
}

describe('burial timeline', () => {
  it('has the documented steps and a total of 3.0 seconds', () => {
    expect([TURN, APPEAR, SETTLE]).toEqual([1.2, 1.0, 0.8]);
    expect(TOTAL_SECONDS).toBeCloseTo(3.0, 10);
    expect(burialDuration(false)).toBe(TOTAL_SECONDS);
    expect(burialDuration(true)).toBe(0);
  });

  it('plays turn, appear and settle in order and ends with the glow at 0', () => {
    const timeline = createBurialTimeline();
    expect(snapshot(timeline)).toEqual({ progress: [0, 0, 0, 0], done: false });
    tickBurial(timeline, MAX_FRAME_DELTA, false);
    expect(timeline.progress.turn).toBeGreaterThan(0);
    expect(timeline.progress.appear).toBe(0);
    for (let i = 0; i < 100 && !timeline.effects.done; i += 1) tickBurial(timeline, 0.05, false);
    expect(snapshot(timeline)).toEqual({ progress: [1, 1, 0, 1], done: true });
  });

  it('keeps the glow visible while the book appears and fades it in the settle step', () => {
    const timeline = createBurialTimeline();
    let peak = 0;
    let appearedBeforeTurnEnded = false;
    for (let t = 0; t < TOTAL_SECONDS; t += 0.02) {
      tickBurial(timeline, 0.02, false);
      peak = Math.max(peak, timeline.progress.glow);
      if (timeline.progress.appear > 0 && timeline.progress.turn < 1) appearedBeforeTurnEnded = true;
    }
    expect(peak).toBeGreaterThan(0.9);
    expect(appearedBeforeTurnEnded).toBe(false);
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
          if (instant) expect(snapshot(timeline)).toEqual({ progress: [1, 1, 0, 1], done: true });
        }
      }),
      { numRuns: 150 },
    );
  });

  it('Feature: graveyard-core, Property 75: the same total time split differently gives the same progress', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 1, max: 12 }),
        (steps, pieces) => {
          const total = (steps * MAX_FRAME_DELTA) / 4;
          const whole = createBurialTimeline();
          const split = createBurialTimeline();
          // Both use steps at or below the clamp: one of `step` seconds, the other of `step / pieces`.
          const step = total / steps;
          for (let i = 0; i < steps; i += 1) tickBurial(whole, step, false);
          for (let i = 0; i < steps * pieces; i += 1) tickBurial(split, step / pieces, false);
          values(whole).forEach((value, index) => expect(values(split)[index]).toBeCloseTo(value, 8));
        },
      ),
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

  it('skip lands on the final state for any time, from any history', () => {
    fc.assert(
      fc.property(
        fc.array(dtArb, { maxLength: 60 }),
        fc.oneof(fc.double(), fc.constantFrom(Number.NaN, -1, 0, TOTAL_SECONDS, 99, Number.POSITIVE_INFINITY)),
        (dts, at) => {
          const timeline = createBurialTimeline();
          for (const dt of dts) tickBurial(timeline, dt, false);
          const { progress, effects } = timeline;
          skipBurial(timeline, at);
          expect(snapshot(timeline)).toEqual({ progress: [1, 1, 0, 1], done: true });
          expect(timeline.progress).toBe(progress);
          expect(timeline.effects).toBe(effects);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('keeps the pure modules free of React, Three.js, DOM, store and timers', () => {
    const entries = Object.entries(SOURCES);
    expect(entries).toHaveLength(3);
    for (const [file, source] of entries) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code, file).not.toMatch(/from\s+['"][^'"]*(store|domain)[^'"]*['"]/);
      expect(code, file).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
    }
  });
});

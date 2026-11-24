/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { QualityLevel } from '../domain/types';
import { clampMoteCount, createMoteBuffer, moteCount, twinkleFactor, writeMotes } from '../ui/summon/summonMotes';
import { MOTE_COUNTS, MOTES_MAX, MOTES_MIN, SUMMON_LOOK, SUMMON_TIMINGS } from '../ui/summon/summonTimings';
import type { SummonDirection, SummonKind } from '../ui/summon/summonTimings';

const SOURCE = Object.values(
  import.meta.glob<string>('../ui/summon/summonMotes.ts', { query: '?raw', import: 'default', eager: true }),
)[0] ?? '';

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const kinds = fc.constantFrom<SummonKind>('full', 'short');
const directions = fc.constantFrom<SummonDirection>('summon', 'dismiss');
const qualities = fc.constantFrom<QualityLevel>('low', 'medium', 'high');
const anyNumber = fc.double();

/** The longest summon plus dismissal, so the generators cover every end. */
const LONGEST = Math.max(...Object.values(SUMMON_TIMINGS).map((d) => d.inSeconds + d.outSeconds));
const ENDS = Object.values(SUMMON_TIMINGS).flatMap((d) => [d.inSeconds, d.outSeconds, d.inSeconds + d.outSeconds]);
const anyTime = fc.oneof(
  fc.double(),
  fc.double({ min: -2, max: LONGEST + 2, noNaN: true }),
  fc.constantFrom(0, ...ENDS, 1e9, -1e9, Infinity, -Infinity, Number.NaN),
);

const anyCount = fc.oneof(
  anyNumber,
  fc.integer({ min: -5, max: MOTES_MAX + 20 }),
  fc.double({ min: 0, max: MOTES_MAX + 20, noNaN: true }),
);

function expectBufferFinite(buffer: ReturnType<typeof createMoteBuffer>): void {
  for (let i = 0; i < MOTES_MAX; i++) {
    expect(Number.isFinite(buffer.x[i])).toBe(true);
    expect(Number.isFinite(buffer.y[i])).toBe(true);
    expect(Number.isFinite(buffer.size[i])).toBe(true);
    expect(Number.isFinite(buffer.alpha[i])).toBe(true);
    expect(buffer.alpha[i]).toBeGreaterThanOrEqual(0);
    expect(buffer.alpha[i]).toBeLessThanOrEqual(1);
  }
}

describe('summon motes are pure', () => {
  it('imports no React, Three.js, DOM, store or timers, never calls Math.random and has no color literal', () => {
    expect(SOURCE).not.toBe('');
    const code = withoutComments(SOURCE);
    expect(code).not.toMatch(/from\s+['"](react|react-dom|three|zustand|@react-three\/[^'"]*)['"]/);
    expect(code).not.toMatch(/from\s+['"][^'"]*\/(store|interaction|world|book|cinematics)[^'"]*['"]/);
    expect(code).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\s*\(/);
  });

  it('allocates nothing in writeMotes and keeps the buffer arrays', () => {
    const code = withoutComments(SOURCE);
    const body = /export function writeMotes\([\s\S]*?\): \w+ \{([\s\S]*?)\r?\n\}/.exec(code)?.[1] ?? '';
    expect(body).not.toBe('');
    expect(body).not.toMatch(/\bnew\b|=>|(?:^|[=(,:?&|+\-*/<>!;{}])\s*\[|\{\s*\w+\s*:/);

    const buffer = createMoteBuffer();
    const { x, y, size, alpha, seeds } = buffer;
    writeMotes('summon', 'full', SUMMON_TIMINGS.full.inSeconds / 2, false, 400, 300, MOTE_COUNTS.medium, buffer);
    expect(buffer.x).toBe(x);
    expect(buffer.y).toBe(y);
    expect(buffer.size).toBe(size);
    expect(buffer.alpha).toBe(alpha);
    expect(buffer.seeds).toBe(seeds);
  });
});

describe('summon motes examples', () => {
  it('has a cap of 100 and a floor of 60', () => {
    expect(MOTES_MAX).toBe(100);
    expect(MOTES_MIN).toBe(60);
    expect(createMoteBuffer().alpha).toHaveLength(MOTES_MAX);
  });

  it('builds the same seed table every time', () => {
    expect(Array.from(createMoteBuffer().seeds)).toEqual(Array.from(createMoteBuffer().seeds));
  });

  it('has every alpha at 0 at t <= 0 for a summon, at t >= duration and for non-finite t', () => {
    const buffer = createMoteBuffer();
    for (const kind of ['full', 'short'] as const) {
      const { inSeconds, outSeconds } = SUMMON_TIMINGS[kind];
      const cases: [SummonDirection, number][] = [
        ['summon', 0],
        ['summon', -1],
        ['summon', inSeconds],
        ['summon', inSeconds + 5],
        ['summon', Infinity],
        ['summon', Number.NaN],
        ['dismiss', outSeconds],
        ['dismiss', outSeconds + 5],
        ['dismiss', -Infinity],
        ['dismiss', Number.NaN],
      ];
      for (const [direction, t] of cases) {
        expect(writeMotes(direction, kind, t, false, 400, 300, MOTES_MAX, buffer)).toBe(0);
        expect(buffer.alpha.every((a) => a === 0)).toBe(true);
      }
    }
  });

  it('shows motes in the middle of a summon and of a dismissal', () => {
    const buffer = createMoteBuffer();
    expect(writeMotes('summon', 'full', SUMMON_TIMINGS.full.inSeconds / 2, false, 400, 300, MOTES_MAX, buffer)).toBeGreaterThan(0);
    expect(writeMotes('dismiss', 'full', SUMMON_TIMINGS.full.outSeconds / 2, false, 400, 300, MOTES_MAX, buffer)).toBeGreaterThan(0);
  });
});

describe('summon motes properties', () => {
  it('Feature: graveyard-core, Property 91: The page summon timeline is finite for any time', () => {
    const buffer = createMoteBuffer();
    fc.assert(
      fc.property(directions, kinds, anyTime, fc.boolean(), anyNumber, anyNumber, anyCount, (direction, kind, t, instant, w, h, count) => {
        writeMotes(direction, kind, t, instant, w, h, count, buffer);
        expectBufferFinite(buffer);
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 94: The mote count stays within the floor and the cap and never exceeds the cap', () => {
    expect(moteCount('low', false)).toBe(60);
    expect(moteCount('medium', false)).toBe(80);
    expect(moteCount('high', false)).toBe(100);
    const buffer = createMoteBuffer();
    fc.assert(
      fc.property(anyCount, qualities, directions, kinds, anyTime, (n, quality, direction, kind, t) => {
        const clamped = clampMoteCount(n);
        expect(Number.isInteger(clamped)).toBe(true);
        expect(clamped).toBeGreaterThanOrEqual(MOTES_MIN);
        expect(clamped).toBeLessThanOrEqual(MOTES_MAX);
        expect(MOTE_COUNTS[quality]).toBe(moteCount(quality, false));

        const active = writeMotes(direction, kind, t, false, 320, 240, n, buffer);
        expect(active).toBeLessThanOrEqual(MOTES_MAX);
        if (Number.isFinite(n)) expect(active).toBeLessThanOrEqual(Math.max(0, Math.trunc(n)));
        expectBufferFinite(buffer);
        let positive = 0;
        for (let i = 0; i < MOTES_MAX; i++) if ((buffer.alpha[i] ?? 0) > 0) positive++;
        expect(positive).toBe(active);
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 95: Reduced motion and calm mode make every page animation instant', () => {
    const buffer = createMoteBuffer();
    fc.assert(
      fc.property(qualities, directions, kinds, anyTime, anyCount, (quality, direction, kind, t, n) => {
        expect(moteCount(quality, true)).toBe(0);
        expect(writeMotes(direction, kind, t, true, 320, 240, n, buffer)).toBe(0);
        expect(buffer.alpha.every((a) => a === 0)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('summon mote look', () => {
  it('keeps ordinary sizes within 1 to 4 px and has a few larger motes, never above the large size', () => {
    const buffer = createMoteBuffer();
    writeMotes('summon', 'full', SUMMON_TIMINGS.full.inSeconds / 2, false, 400, 300, MOTES_MAX, buffer);
    let large = 0;
    for (let i = 0; i < MOTES_MAX; i++) {
      const size = buffer.size[i] ?? 0;
      expect(size).toBeGreaterThanOrEqual(SUMMON_LOOK.moteSizeMin);
      expect(size).toBeLessThanOrEqual(SUMMON_LOOK.largeMoteSizeMax);
      if (size > SUMMON_LOOK.moteSizeMax) large++;
    }
    expect(large).toBeGreaterThan(0);
    expect(large).toBeLessThan(MOTES_MAX * 0.2);
  });

  it('starts motes both behind the page and around it', () => {
    const buffer = createMoteBuffer();
    const width = 400;
    const height = 300;
    writeMotes('summon', 'full', SUMMON_TIMINGS.full.inSeconds * 0.02, false, width, height, MOTES_MAX, buffer);
    let inside = 0;
    let outside = 0;
    for (let i = 0; i < MOTES_MAX; i++) {
      const x = buffer.x[i] ?? 0;
      const y = buffer.y[i] ?? 0;
      if (x >= 0 && x <= width && y >= 0 && y <= height) inside++;
      else outside++;
    }
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
  });

  it('twinkle factor stays within [1 - depth, 1] for any input and is a pure function of its arguments', () => {
    fc.assert(
      fc.property(anyNumber, anyNumber, anyNumber, (t, phase, rate) => {
        const value = twinkleFactor(t, phase, rate);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1 - SUMMON_LOOK.twinkleDepth - 1e-12);
        expect(value).toBeLessThanOrEqual(1 + 1e-12);
        expect(Object.is(twinkleFactor(t, phase, rate), value)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('twinkles: the alpha of a mote pulses over time with its own phase, the same at the same time', () => {
    const buffer = createMoteBuffer();
    const other = createMoteBuffer();
    const { inSeconds } = SUMMON_TIMINGS.full;
    const samples: number[] = [];
    for (let k = 1; k < 40; k++) {
      const t = (inSeconds * k) / 40;
      writeMotes('dismiss', 'full', Math.min(t, SUMMON_TIMINGS.full.outSeconds * 0.99), false, 400, 300, MOTES_MAX, buffer);
      writeMotes('dismiss', 'full', Math.min(t, SUMMON_TIMINGS.full.outSeconds * 0.99), false, 400, 300, MOTES_MAX, other);
      expect(Array.from(buffer.alpha)).toEqual(Array.from(other.alpha));
    }
    const t = SUMMON_TIMINGS.full.outSeconds / 2;
    writeMotes('dismiss', 'full', t, false, 400, 300, MOTES_MAX, buffer);
    for (let i = 0; i < 10; i++) samples.push(buffer.alpha[i] ?? 0);
    // Same envelope at the same time: any difference between motes comes from their own twinkle phase and size.
    expect(new Set(samples.map((a) => a.toFixed(6))).size).toBeGreaterThan(1);
  });
});

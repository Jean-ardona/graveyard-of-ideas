/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FINAL_POSE, isLanded, summonDurations, summonProgress, writePagePose, writeSwap } from '../ui/summon/pageSummon';
import type { PagePose } from '../ui/summon/pageSummon';
import { MOTES_MAX, SUMMON_TIMINGS } from '../ui/summon/summonTimings';
import type { SummonDirection, SummonKind } from '../ui/summon/summonTimings';

const SOURCES = import.meta.glob<string>(
  ['../ui/summon/summonTimings.ts', '../ui/summon/pageSummon.ts', '../ui/summon/summonMotes.ts'],
  { query: '?raw', import: 'default', eager: true },
);
const PAGE_SUMMON_SOURCE = Object.entries(SOURCES).find(([file]) => file.endsWith('/pageSummon.ts'))?.[1] ?? '';

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function newPose(): PagePose {
  return { opacity: Number.NaN, offsetY: Number.NaN, tilt: Number.NaN, scale: Number.NaN };
}

function isFinalPose(pose: PagePose): boolean {
  return (
    Object.is(pose.opacity, FINAL_POSE.opacity) &&
    Object.is(pose.offsetY, FINAL_POSE.offsetY) &&
    Object.is(pose.tilt, FINAL_POSE.tilt) &&
    Object.is(pose.scale, FINAL_POSE.scale)
  );
}

const kinds = fc.constantFrom<SummonKind>('full', 'short');
const directions = fc.constantFrom<SummonDirection>('summon', 'dismiss');

/** The longest summon plus dismissal, so the generators cover every end. */
const LONGEST = Math.max(...Object.values(SUMMON_TIMINGS).map((d) => d.inSeconds + d.outSeconds));
/** Time including NaN, the infinities, negatives, zero, the exact ends and values far beyond them. */
const anyTime = fc.oneof(
  fc.double(),
  fc.double({ min: -2, max: LONGEST + 2, noNaN: true }),
  fc.constantFrom(0, ...Object.values(SUMMON_TIMINGS).flatMap((d) => [d.inSeconds, d.outSeconds, d.inSeconds + d.outSeconds]), 1e9, -1e9, Infinity, -Infinity, Number.NaN),
);
const orderedTime = fc.oneof(
  fc.double({ noNaN: true }),
  fc.double({ min: -2, max: LONGEST + 2, noNaN: true }),
  fc.constantFrom(0, ...Object.values(SUMMON_TIMINGS).flatMap((d) => [d.inSeconds, d.outSeconds, d.inSeconds + d.outSeconds]), 1e9, -1e9, Infinity, -Infinity),
);

describe('page summon core is pure', () => {
  it('imports no React, Three.js, DOM, store or timers, never calls Math.random and has no color literal', () => {
    expect(Object.keys(SOURCES)).toHaveLength(3);
    for (const [file, source] of Object.entries(SOURCES)) {
      const code = withoutComments(source);
      expect(code, file).not.toMatch(/from\s+['"](react|react-dom|three|zustand|@react-three\/[^'"]*)['"]/);
      expect(code, file).not.toMatch(/from\s+['"][^'"]*\/(store|interaction|world|book|cinematics)[^'"]*['"]/);
      expect(code, file).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
      expect(code, file).not.toMatch(/Math\.random/);
      expect(code, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\s*\(/);
    }
  });

  it('allocates nothing in writePagePose or writeSwap', () => {
    const code = withoutComments(PAGE_SUMMON_SOURCE);
    for (const name of ['writePagePose', 'writeSwap']) {
      const body = new RegExp(`export function ${name}\\([\\s\\S]*?\\): \\w+ \\{([\\s\\S]*?)\\r?\\n\\}`).exec(code)?.[1] ?? '';
      expect(body, name).not.toBe('');
      expect(body, name).not.toMatch(/\bnew\b|=>|(?:^|[=(,:?&|+\-*/<>!;{}])\s*\[|\{\s*\w+\s*:/);
    }
  });

  it('keeps the identity of the records it writes', () => {
    const out = newPose();
    const outgoing = newPose();
    const incoming = newPose();
    expect(writePagePose('summon', 'full', SUMMON_TIMINGS.full.inSeconds / 2, false, out)).toBe(out);
    writeSwap('short', SUMMON_TIMINGS.short.outSeconds / 2, false, outgoing, incoming);
    expect(Object.keys(out)).toEqual(['opacity', 'offsetY', 'tilt', 'scale']);
    expect(Object.keys(outgoing)).toEqual(['opacity', 'offsetY', 'tilt', 'scale']);
    expect(Object.keys(incoming)).toEqual(['opacity', 'offsetY', 'tilt', 'scale']);
  });
});

describe('page summon examples', () => {
  it('has the documented timings and 100 motes at most', () => {
    expect(SUMMON_TIMINGS.full).toEqual({ inSeconds: 2.2, outSeconds: 0.9 });
    expect(SUMMON_TIMINGS.short).toEqual({ inSeconds: 0.5, outSeconds: 0.3 });
    expect(MOTES_MAX).toBe(100);
    expect(summonDurations('full', true)).toEqual({ inSeconds: 0, outSeconds: 0 });
  });

  it('ends a dismissal at opacity exactly 0', () => {
    const out = newPose();
    for (const kind of ['full', 'short'] as const) {
      const { outSeconds } = SUMMON_TIMINGS[kind];
      for (const t of [outSeconds, outSeconds + 1, Infinity]) {
        writePagePose('dismiss', kind, t, false, out);
        expect(Object.is(out.opacity, 0)).toBe(true);
      }
      writePagePose('dismiss', kind, 0, false, out);
      expect(out).toEqual({ opacity: 1, offsetY: 0, tilt: 0, scale: 1 });
      expect(Object.is(out.offsetY, 0)).toBe(true);
    }
  });

  it('is opaque when the eased progress reaches 2/3', () => {
    const raw = 1 - Math.cbrt(1 / 3);
    const t = raw * SUMMON_TIMINGS.full.inSeconds;
    expect(summonProgress('summon', 'full', t, false)).toBeCloseTo(2 / 3, 12);
    const out = writePagePose('summon', 'full', t, false, newPose());
    expect(out.opacity).toBeGreaterThan(1 - 1e-12);
  });

  it('starts a summon invisible, low, tilted and slightly small', () => {
    const out = writePagePose('summon', 'full', 0, false, newPose());
    expect(out).toEqual({ opacity: 0, offsetY: 48, tilt: 12, scale: 0.96 });
  });
});

describe('page summon properties', () => {
  it('Feature: graveyard-core, Property 91: The page summon timeline is finite for any time', () => {
    fc.assert(
      fc.property(directions, kinds, anyTime, fc.boolean(), (direction, kind, t, instant) => {
        const p = summonProgress(direction, kind, t, instant);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        const pose = writePagePose(direction, kind, t, instant, newPose());
        for (const value of [pose.opacity, pose.offsetY, pose.tilt, pose.scale]) expect(Number.isFinite(value)).toBe(true);
        expect(pose.opacity).toBeGreaterThanOrEqual(0);
        expect(pose.opacity).toBeLessThanOrEqual(1);
        expect(pose.scale).toBeGreaterThan(0);
        const outgoing = newPose();
        const incoming = newPose();
        writeSwap(kind, t, instant, outgoing, incoming);
        for (const pair of [outgoing, incoming]) {
          for (const value of [pair.opacity, pair.offsetY, pair.tilt, pair.scale]) expect(Number.isFinite(value)).toBe(true);
          expect(pair.opacity).toBeGreaterThanOrEqual(0);
          expect(pair.opacity).toBeLessThanOrEqual(1);
          expect(pair.scale).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 92: Page summon progress is monotonic', () => {
    fc.assert(
      fc.property(kinds, orderedTime, orderedTime, fc.boolean(), (kind, a, b, instant) => {
        const t1 = Math.min(a, b);
        const t2 = Math.max(a, b);
        expect(summonProgress('summon', kind, t2, instant)).toBeGreaterThanOrEqual(summonProgress('summon', kind, t1, instant));
        expect(summonProgress('dismiss', kind, t2, instant)).toBeGreaterThanOrEqual(summonProgress('dismiss', kind, t1, instant));
        const early = writePagePose('summon', kind, t1, instant, newPose());
        const late = writePagePose('summon', kind, t2, instant, newPose());
        expect(late.opacity).toBeGreaterThanOrEqual(early.opacity);
        expect(late.offsetY).toBeLessThanOrEqual(early.offsetY);
        expect(late.tilt).toBeLessThanOrEqual(early.tilt);
        const dismissEarly = writePagePose('dismiss', kind, t1, instant, newPose());
        const dismissLate = writePagePose('dismiss', kind, t2, instant, newPose());
        expect(dismissLate.opacity).toBeLessThanOrEqual(dismissEarly.opacity);
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 93: A landed page equals the final pose, and two pages are never visible at once', () => {
    fc.assert(
      fc.property(kinds, anyTime, (kind, t) => {
        const { inSeconds, outSeconds } = SUMMON_TIMINGS[kind];
        if (t >= inSeconds) {
          expect(isFinalPose(writePagePose('summon', kind, t, false, newPose()))).toBe(true);
          expect(isLanded(kind, t, false)).toBe(true);
        }
        if (t < inSeconds) expect(isLanded(kind, t, false)).toBe(false);

        const outgoing = newPose();
        const incoming = newPose();
        writeSwap(kind, t, false, outgoing, incoming);
        expect(outgoing.opacity > 0 && incoming.opacity > 0).toBe(false);
        if (!(t >= outSeconds)) expect(incoming.opacity).toBe(0);
        if (t >= outSeconds + inSeconds) {
          expect(outgoing.opacity).toBe(0);
          expect(isFinalPose(incoming)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Feature: graveyard-core, Property 95: Reduced motion and calm mode make every page animation instant', () => {
    fc.assert(
      fc.property(directions, kinds, anyTime, (direction, kind, t) => {
        expect(summonDurations(kind, true)).toEqual({ inSeconds: 0, outSeconds: 0 });
        expect(summonProgress(direction, kind, t, true)).toBe(1);
        expect(isFinalPose(writePagePose('summon', kind, t, true, newPose()))).toBe(true);
        expect(writePagePose('dismiss', kind, t, true, newPose()).opacity).toBe(0);
        const outgoing = newPose();
        const incoming = newPose();
        writeSwap(kind, t, true, outgoing, incoming);
        expect(isFinalPose(incoming)).toBe(true);
        expect(outgoing.opacity).toBe(0);
        expect(isLanded(kind, 0, true)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as CAMERA_TIMINGS from '../cinematics/cameraTimings';
import {
  BODY_ALPHA,
  SPECTER_BODY_COLOR,
  SPECTER_POINT_SIZE,
  SHED_ALPHA,
  SHED_FRACTION,
  SHED_LIFE,
} from '../cinematics/specterLook';
import {
  SPECTER_TRAITS,
  createSpecterBuffers,
  createSpecterSeeds,
  specterCenter,
  writeSpecter,
} from '../cinematics/specterParticles';
import type { SpecterBuffers, SpecterPoint, SpecterSeeds } from '../cinematics/specterParticles';
import {
  GROUP_B_TOTAL,
  RETURN_SECONDS,
  SPECTER_BUDGET,
  SPECTER_MAX_PARTICLES,
  SPECTER_PHASES,
  SPECTER_TOTAL,
} from '../cinematics/specterTimings';
import { hexToRgb, isAmberHue, relativeLuminance } from '../ui/theme/colorMath';
import { TEXT_TOKENS, TOKENS } from '../ui/theme/tokens';

const PURE_SOURCES = import.meta.glob<string>(
  [
    '../cinematics/specterTimings.ts',
    '../cinematics/specterLook.ts',
    '../cinematics/specterShape.ts',
    '../cinematics/specterParticles.ts',
    '../cinematics/cameraTimings.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceOf(name: string): string {
  const entry = Object.entries(PURE_SOURCES).find(([file]) => file.endsWith(`/${name}.ts`));
  if (!entry) throw new Error(`missing source ${name}`);
  return entry[1];
}

/** The text of one exported function, from its signature to the closing brace at column 0. */
function bodyOf(source: string, name: string): string {
  const code = withoutComments(source);
  const start = code.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const rest = code.slice(start);
  const end = rest.search(/\n\}\r?\n/);
  if (end < 0) throw new Error(`unterminated function ${name}`);
  return rest.slice(0, end + 2);
}

function sameBytes(a: Float32Array, b: Float32Array): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

function alphasOf(buffers: SpecterBuffers): number[] {
  const alphas: number[] = [];
  for (let i = 0; i < buffers.count; i++) alphas.push(buffers.colors[i * 4 + 3]!);
  return alphas;
}

/** Times of every kind, around and far beyond the ends. */
const timeArb = fc.oneof(
  fc.double({ noNaN: false }),
  fc.double({ min: -10, max: 12, noNaN: true }),
  fc.double({ min: 0, max: SPECTER_TOTAL, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, SPECTER_TOTAL, SPECTER_TOTAL - 1e-9, 3.4, 6.8),
);
const headingArb = fc.oneof(
  fc.double({ noNaN: false }),
  fc.double({ min: -10, max: 10, noNaN: true }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, Math.PI),
);
const smallCountArb = fc.integer({ min: 0, max: 80 });
const anyCountArb = fc.oneof(
  fc.integer({ min: -50, max: SPECTER_MAX_PARTICLES + 500 }),
  fc.double({ noNaN: false }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, SPECTER_MAX_PARTICLES, SPECTER_MAX_PARTICLES + 1),
);

function evaluate(count: number, time: number, heading: number) {
  const seeds = createSpecterSeeds(count);
  const buffers = createSpecterBuffers(count);
  const active = writeSpecter(seeds, time, heading, buffers);
  return { seeds, buffers, active };
}

describe('specter pure modules', () => {
  it('import no React, Three.js, DOM, store, timers or random source', () => {
    expect(Object.keys(PURE_SOURCES)).toHaveLength(5);
    for (const [file, source] of Object.entries(PURE_SOURCES)) {
      const code = withoutComments(source);
      expect(code, file).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code, file).not.toMatch(/from\s+['"][^'"]*\/store[^'"]*['"]/);
      expect(code, file).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame)\b/);
      expect(code, file).not.toMatch(/Math\.random/);
    }
  });

  it('allocates nothing in the bodies of writeSpecter and specterCenter', () => {
    const source = sourceOf('specterParticles');
    for (const name of ['writeSpecter', 'specterCenter']) {
      const body = bodyOf(source, name);
      expect(body.length, name).toBeGreaterThan(200);
      expect(body, name).not.toMatch(/\bnew\s/);
      expect(body, name).not.toMatch(/=>/);
      expect(body, name).not.toMatch(/\bfunction\b\s*\(/);
      expect(body, name).not.toMatch(/[=(,:]\s*\[/);
      expect(body, name).not.toMatch(/(=|\(|,|return)\s*\{/);
      expect(body, name).not.toMatch(/\.(map|filter|slice|concat|from|clone)\(/);
    }
  });
});

describe('specter constants', () => {
  it('chains the phases and ends at SPECTER_TOTAL', () => {
    const { gather, form, depart, vanish } = SPECTER_PHASES;
    expect(gather).toEqual({ start: 0, duration: 2.0 });
    expect(form).toEqual({ start: 2.0, duration: 1.4 });
    expect(depart).toEqual({ start: 3.4, duration: 3.4 });
    expect(vanish).toEqual({ start: 6.8, duration: 1.0 });
    expect(gather.start + gather.duration).toBeCloseTo(form.start, 12);
    expect(form.start + form.duration).toBeCloseTo(depart.start, 12);
    expect(depart.start + depart.duration).toBeCloseTo(vanish.start, 12);
    expect(vanish.start + vanish.duration).toBeCloseTo(SPECTER_TOTAL, 12);
    expect(SPECTER_TOTAL).toBe(7.8);
  });

  it('has one source for the return time and the group B total', () => {
    expect(RETURN_SECONDS).toBe(CAMERA_TIMINGS.RETURN_SECONDS);
    expect(GROUP_B_TOTAL).toBe(SPECTER_TOTAL + RETURN_SECONDS);
    expect(GROUP_B_TOTAL).toBeCloseTo(9.4, 12);
  });

  it('keeps budgets and point sizes ordered by quality, within the cap, and the alphas soft', () => {
    expect(SPECTER_BUDGET.low).toBeLessThan(SPECTER_BUDGET.medium);
    expect(SPECTER_BUDGET.medium).toBeLessThan(SPECTER_BUDGET.high);
    expect(SPECTER_BUDGET.high).toBeLessThanOrEqual(SPECTER_MAX_PARTICLES);
    expect(SPECTER_POINT_SIZE.low).toBeGreaterThan(SPECTER_POINT_SIZE.medium);
    expect(SPECTER_POINT_SIZE.medium).toBeGreaterThan(SPECTER_POINT_SIZE.high);
    expect(BODY_ALPHA).toBeGreaterThanOrEqual(0.35);
    expect(BODY_ALPHA).toBeLessThanOrEqual(0.55);
    expect(SHED_ALPHA).toBeGreaterThan(0);
    expect(SHED_ALPHA).toBeLessThan(BODY_ALPHA);
  });

  it('takes the body color from a token that is not amber and not text', () => {
    expect(SPECTER_BODY_COLOR).toBe(TOKENS.color.specterBody);
    const [br, bg, bb] = hexToRgb(SPECTER_BODY_COLOR);
    expect(Math.max(br, bg, bb)).toBeLessThan(0x20);
    expect(relativeLuminance(SPECTER_BODY_COLOR)).toBeLessThan(0.01);
    expect(TEXT_TOKENS).not.toContain('specterBody');
  });
});

describe('specter particles', () => {
  it('Feature: graveyard-core, Property 82: The specter state is finite for any time', () => {
    fc.assert(
      fc.property(anyCountArb, headingArb, timeArb, (count, heading, time) => {
        const { buffers, active } = evaluate(count, time, heading);
        for (const value of buffers.positions) expect(Number.isFinite(value)).toBe(true);
        const alphas = alphasOf(buffers);
        for (const alpha of alphas) {
          expect(Number.isFinite(alpha)).toBe(true);
          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(BODY_ALPHA + 1e-6);
        }
        expect(active).toBe(alphas.filter((alpha) => alpha > 0).length);
      }),
      { numRuns: 150 },
    );
  });

  it('Feature: graveyard-core, Property 83: The same time gives the same specter state', () => {
    fc.assert(
      fc.property(smallCountArb, headingArb, fc.array(timeArb, { minLength: 1, maxLength: 6 }), (count, heading, times) => {
        const seeds = createSpecterSeeds(count);
        const references = times.map((time) => {
          const fresh = createSpecterBuffers(count);
          writeSpecter(seeds, time, heading, fresh);
          return { positions: fresh.positions.slice(), colors: fresh.colors.slice() };
        });
        const shared = createSpecterBuffers(count);
        const order = [
          ...times.keys(),
          ...[...times.keys()].reverse(),
          ...times.keys(),
          ...times.keys(),
        ];
        for (const index of order) {
          writeSpecter(seeds, times[index]!, heading, shared);
          expect(sameBytes(shared.positions, references[index]!.positions)).toBe(true);
          expect(sameBytes(shared.colors, references[index]!.colors)).toBe(true);
          // The same time twice in a row.
          writeSpecter(seeds, times[index]!, heading, shared);
          expect(sameBytes(shared.positions, references[index]!.positions)).toBe(true);
          expect(sameBytes(shared.colors, references[index]!.colors)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: graveyard-core, Property 84: All specter particles are gone after the end', () => {
    const goneArb = fc.oneof(
      fc.double({ min: SPECTER_TOTAL }),
      fc.double({ max: 0 }),
      fc.constantFrom(Number.NaN, Infinity, -Infinity, 0, -0, SPECTER_TOTAL),
    );
    fc.assert(
      fc.property(smallCountArb, headingArb, goneArb, (count, heading, time) => {
        const seeds = createSpecterSeeds(count);
        const buffers = createSpecterBuffers(count);
        // Dirty the buffers first, so the parking is a real write.
        writeSpecter(seeds, 5, 0, buffers);
        expect(writeSpecter(seeds, time, heading, buffers)).toBe(0);
        for (const alpha of alphasOf(buffers)) expect(alpha).toBe(0);
        for (const value of buffers.positions) expect(value).toBe(0);
      }),
      { numRuns: 150 },
    );
  });

  it('Feature: graveyard-core, Property 85: The active particle count never exceeds the cap', () => {
    fc.assert(
      fc.property(anyCountArb, headingArb, timeArb, (count, heading, time) => {
        const { buffers, active } = evaluate(count, time, heading);
        const cap = Math.min(Math.max(0, Math.trunc(count) || 0), SPECTER_MAX_PARTICLES);
        expect(buffers.count).toBe(cap);
        expect(buffers.positions.length).toBe(cap * 3);
        expect(buffers.colors.length).toBe(cap * 4);
        expect(active).toBeLessThanOrEqual(cap);
      }),
      { numRuns: 150 },
    );
    const qualities = ['low', 'medium', 'high'] as const;
    fc.assert(
      fc.property(fc.constantFrom(...qualities), headingArb, timeArb, (quality, heading, time) => {
        const budget = SPECTER_BUDGET[quality];
        const { buffers, active } = evaluate(budget, time, heading);
        expect(buffers.count).toBe(budget);
        expect(active).toBeLessThanOrEqual(budget);
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: graveyard-core, Property 79 (pure part): The specter is harmless', () => {
    // Alphas stay in [0, 1], and are 0 before the book is gone (specter time 0) and after the end.
    fc.assert(
      fc.property(smallCountArb, headingArb, timeArb, (count, heading, time) => {
        const { buffers } = evaluate(count, time, heading);
        for (const alpha of alphasOf(buffers)) {
          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1);
        }
        for (const edge of [0, SPECTER_TOTAL, SPECTER_TOTAL + 5]) {
          const parked = evaluate(count, edge, heading);
          expect(parked.active).toBe(0);
        }
      }),
      { numRuns: 100 },
    );

    // The colors are outside the amber hue range: body and the white rgb of the buffers.
    expect(isAmberHue(SPECTER_BODY_COLOR)).toBe(false);
    const buffers = createSpecterBuffers(10);
    expect(isAmberHue('#ffffff')).toBe(false);
    for (let i = 0; i < buffers.count; i++) {
      expect([buffers.colors[i * 4], buffers.colors[i * 4 + 1], buffers.colors[i * 4 + 2]]).toEqual([1, 1, 1]);
    }

    // The center moves away from the tomb along the heading turned around: the distance from the
    // origin never decreases, and at the end it is far along the away direction.
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (heading) => {
        const point: SpecterPoint = { x: 0, y: 0, z: 0 };
        let previous = 0;
        const steps = 156;
        for (let step = 0; step <= steps; step++) {
          const t = (SPECTER_TOTAL * step) / steps;
          specterCenter(t, heading, point);
          expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
          const distance = Math.hypot(point.x, point.y, point.z);
          expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = distance;
        }
        specterCenter(SPECTER_TOTAL, heading, point);
        const along = point.x * -Math.sin(heading) + point.z * -Math.cos(heading);
        expect(along).toBeGreaterThan(20);
        specterCenter(SPECTER_PHASES.depart.start, heading, point);
        expect(point.x).toBe(0);
        expect(point.z).toBe(0);
      }),
      { numRuns: 100 },
    );

    // It is finite for any time and heading, and takes no viewer position.
    fc.assert(
      fc.property(timeArb, headingArb, (time, heading) => {
        const point = specterCenter(time, heading, { x: 0, y: 0, z: 0 });
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(Number.isFinite(point.z)).toBe(true);
      }),
      { numRuns: 100 },
    );
    expect(specterCenter.length).toBe(3);
    expect(withoutComments(sourceOf('specterParticles'))).not.toMatch(/player/i);
  });

  it('allocates seeds and buffers once and never replaces them', () => {
    const seeds = createSpecterSeeds(120);
    const buffers = createSpecterBuffers(120);
    const { start, target, traits } = seeds;
    const { positions, colors } = buffers;
    const seedCopies = [start.slice(), target.slice(), traits.slice()];
    const rgb = Array.from(colors).filter((_, index) => index % 4 !== 3);
    for (const time of [0.3, 2.5, 5, 7.7, 9, -1]) writeSpecter(seeds, time, 0.7, buffers);
    expect(seeds.start).toBe(start);
    expect(seeds.target).toBe(target);
    expect(seeds.traits).toBe(traits);
    expect(buffers.positions).toBe(positions);
    expect(buffers.colors).toBe(colors);
    [start, target, traits].forEach((array, index) => expect(sameBytes(array, seedCopies[index]!)).toBe(true));
    // Only the alpha is written per tick: the rgb never changes.
    expect(Array.from(colors).filter((_, index) => index % 4 !== 3)).toEqual(rgb);
  });

  it('is deterministic: two seed sets of the same count are identical', () => {
    const a: SpecterSeeds = createSpecterSeeds(300);
    const b: SpecterSeeds = createSpecterSeeds(300);
    expect(sameBytes(a.start, b.start)).toBe(true);
    expect(sameBytes(a.target, b.target)).toBe(true);
    expect(sameBytes(a.traits, b.traits)).toBe(true);
  });

  it('sheds about one third of the particles, and every shed life ends by SPECTER_TOTAL', () => {
    const seeds = createSpecterSeeds(SPECTER_MAX_PARTICLES);
    let shed = 0;
    for (let i = 0; i < seeds.count; i++) {
      const time = seeds.traits[i * SPECTER_TRAITS.stride + SPECTER_TRAITS.shed]!;
      if (time <= 0) continue;
      shed++;
      expect(time).toBeGreaterThanOrEqual(3.7 - 1e-6);
      expect(time + SHED_LIFE).toBeLessThanOrEqual(SPECTER_TOTAL + 1e-5);
    }
    expect(SHED_FRACTION).toBe(0.35);
    expect(shed / seeds.count).toBeGreaterThan(0.28);
    expect(shed / seeds.count).toBeLessThan(0.42);
  });

  it('has nearly nothing left an instant before the end', () => {
    const { buffers } = evaluate(SPECTER_BUDGET.low, SPECTER_TOTAL - 1e-6, 0.4);
    for (const alpha of alphasOf(buffers)) expect(alpha).toBeLessThan(1e-3);
  });

  it('shows a formed specter in the middle and nothing at the first instant', () => {
    const n = SPECTER_BUDGET.low;
    expect(evaluate(n, 3.3, 0.4).active).toBe(n);
    expect(evaluate(n, 0.001, 0.4).active).toBeLessThan(n * 0.02);
    expect(evaluate(n, 5, 0.4).active).toBeGreaterThan(n / 2);
  });

  it('keeps the body alpha in the soft band and the shed smoke below it', () => {
    const n = SPECTER_BUDGET.low;
    const { seeds, buffers } = evaluate(n, 3.3, 0.4);
    expect(Math.max(...alphasOf(buffers))).toBeLessThanOrEqual(BODY_ALPHA + 1e-6);
    expect(Math.max(...alphasOf(buffers))).toBeGreaterThan(BODY_ALPHA * 0.9);
    // Just after the earliest shed time, shed particles are at most SHED_ALPHA.
    const later = evaluate(n, 4.0, 0.4).buffers;
    for (let i = 0; i < seeds.count; i++) {
      const shedTime = seeds.traits[i * SPECTER_TRAITS.stride + SPECTER_TRAITS.shed]!;
      if (shedTime > 0 && shedTime <= 4.0) expect(later.colors[i * 4 + 3]!).toBeLessThanOrEqual(SHED_ALPHA + 1e-6);
    }
  });

  it('moves the whole cloud away from the tomb front, along the heading turned around, while it departs', () => {
    const heading = 0.9;
    const early = evaluate(SPECTER_BUDGET.low, 3.4, heading).buffers;
    const late = evaluate(SPECTER_BUDGET.low, 6, heading).buffers;
    const mean = (buffers: SpecterBuffers) => {
      let x = 0;
      let z = 0;
      for (let i = 0; i < buffers.count; i++) {
        x += buffers.positions[i * 3]!;
        z += buffers.positions[i * 3 + 2]!;
      }
      return -Math.sin(heading) * x - Math.cos(heading) * z;
    };
    expect(mean(late)).toBeGreaterThan(mean(early));
  });
});

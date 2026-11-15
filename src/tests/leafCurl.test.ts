import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEAF_CURL as TIMINGS_CURL, MAX_FRAME_DELTA } from '../book/bookTimings';
import { CURL_STRENGTH, LEAF_CURL, curledLeafIndex, leafCurl, leafStrip } from '../book/leafCurl';
import {
  PAGE_COUNT,
  beginDrag,
  cancelDrag,
  createPageTurnState,
  dragTo,
  endDrag,
  leafAngle,
  tickPageTurn,
  turnByKey,
  turningLeafIndex,
} from '../book/pageTurn';
import type { PageTurnState, TurnDirection } from '../book/pageTurn';

const RUNS = { numRuns: 200 };
const TOL = 1e-9;

const segmentsArb = fc.integer({ min: 1, max: 64 });
/** Any double, including NaN, infinities and values far outside [0, 1]. */
const anyProgressArb = fc.double();
const unitArb = fc.double({ min: 0, max: 1, noNaN: true });
const widthArb = fc.double({ min: 0.01, max: 2, noNaN: true });
const depthArb = fc.double({ min: 0.0005, max: 0.05, noNaN: true });

function angles(progress: number, segments: number): Float64Array {
  const out = new Float64Array(segments);
  leafCurl(progress, segments, out);
  return out;
}

function strip(phi: Float64Array, width: number, depth: number): { positions: Float64Array; normals: Float64Array } {
  const segments = phi.length;
  const positions = new Float64Array(12 * (segments + 1));
  const normals = new Float64Array(12 * (segments + 1));
  leafStrip(phi, segments, width, depth, positions, normals);
  return { positions, normals };
}

/** Vertex of the strip: face 0 front or 1 back, column, row. */
function vertex(buffer: Float64Array, segments: number, face: number, column: number, row: number): number[] {
  const at = ((face * (segments + 1) + column) * 2 + row) * 3;
  return [buffer[at]!, buffer[at + 1]!, buffer[at + 2]!];
}

describe('leaf curl properties', () => {
  it('uses the shared constants', () => {
    expect(LEAF_CURL).toBe(TIMINGS_CURL);
    expect(LEAF_CURL).toEqual({ segments: 12, tipLag: 0.8 });
  });

  it('Feature: graveyard-core, Property 16: The leaf is flat at the ends', () => {
    fc.assert(
      fc.property(segmentsArb, widthArb, depthArb, (segments, width, depth) => {
        const start = angles(0, segments);
        const end = angles(1, segments);
        for (let i = 0; i < segments; i++) {
          expect(start[i]).toBe(0);
          expect(Math.abs(end[i]! - Math.PI)).toBeLessThan(TOL);
        }
        const flatStart = strip(start, width, depth).positions;
        const flatEnd = strip(end, width, depth).positions;
        for (let k = 0; k <= segments; k++) {
          const x = (k * width) / segments;
          for (let face = 0; face < 2; face++) {
            const z = face === 0 ? depth / 2 : -depth / 2;
            const a = vertex(flatStart, segments, face, k, 0);
            const b = vertex(flatEnd, segments, face, k, 0);
            expect(Math.abs(a[0]! - x)).toBeLessThan(TOL);
            expect(Math.abs(a[2]! - z)).toBeLessThan(TOL);
            expect(Math.abs(b[0]! + x)).toBeLessThan(TOL);
            expect(Math.abs(b[2]! + z)).toBeLessThan(TOL);
          }
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 17: Arc length is constant', () => {
    fc.assert(
      fc.property(unitArb, segmentsArb, widthArb, depthArb, (progress, segments, width, depth) => {
        const { positions } = strip(angles(progress, segments), width, depth);
        const center = (k: number): number[] => {
          const front = vertex(positions, segments, 0, k, 0);
          const back = vertex(positions, segments, 1, k, 0);
          return [(front[0]! + back[0]!) / 2, (front[2]! + back[2]!) / 2];
        };
        expect(center(0)[0]).toBeCloseTo(0, 12);
        expect(center(0)[1]).toBeCloseTo(0, 12);
        let total = 0;
        for (let k = 1; k <= segments; k++) {
          const a = center(k - 1);
          const b = center(k);
          const length = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
          expect(Math.abs(length - width / segments)).toBeLessThan(TOL);
          total += length;
        }
        expect(Math.abs(total - width)).toBeLessThan(TOL * segments);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 18: Angles are finite and inputs are clamped', () => {
    fc.assert(
      fc.property(anyProgressArb, segmentsArb, widthArb, depthArb, (progress, segments, width, depth) => {
        const phi = angles(progress, segments);
        const clamped = Number.isNaN(progress) ? 0 : Math.min(Math.max(progress, 0), 1);
        const expected = angles(clamped, segments);
        for (let i = 0; i < segments; i++) {
          expect(Number.isFinite(phi[i])).toBe(true);
          expect(phi[i]).toBeGreaterThanOrEqual(0);
          expect(phi[i]).toBeLessThanOrEqual(Math.PI);
          expect(Object.is(phi[i], expected[i])).toBe(true);
        }
        const { positions, normals } = strip(phi, width, depth);
        expect(positions.every(Number.isFinite)).toBe(true);
        expect(normals.every(Number.isFinite)).toBe(true);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 19: Curvature is symmetric around the middle of the turn', () => {
    fc.assert(
      fc.property(unitArb, fc.integer({ min: 2, max: 64 }), (progress, segments) => {
        const a = angles(progress, segments);
        const b = angles(1 - progress, segments);
        const middle = angles(0.5, segments);
        for (let i = 1; i < segments; i++) {
          const curvature = a[i]! - a[i - 1]!;
          expect(Math.abs(curvature - (b[i]! - b[i - 1]!))).toBeLessThan(TOL);
          expect(curvature).toBeLessThanOrEqual(TOL);
          expect(Math.abs(curvature)).toBeLessThanOrEqual(Math.abs(middle[i]! - middle[i - 1]!) + TOL);
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 20: The spine angle opens monotonically', () => {
    fc.assert(
      fc.property(unitArb, unitArb, segmentsArb, (x, y, segments) => {
        const [a, b] = x <= y ? [x, y] : [y, x];
        const low = angles(a, segments)[0]!;
        const high = angles(b, segments)[0]!;
        expect(low).toBeLessThanOrEqual(high);
        expect(Math.abs(low - Math.PI * a)).toBeLessThan(TOL);
        expect(Math.abs(high - Math.PI * b)).toBeLessThan(TOL);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 21: The shape depends on the progress alone', () => {
    fc.assert(
      fc.property(fc.array(anyProgressArb, { minLength: 1, maxLength: 12 }), segmentsArb, (values, segments) => {
        // Forward, back, forward again: every repeat of a value must match the first time exactly.
        const sequence = [...values, ...[...values].reverse(), ...values];
        const first = new Map<number, { phi: Float64Array; positions: Float64Array; normals: Float64Array }>();
        const phi = new Float64Array(segments);
        const positions = new Float64Array(12 * (segments + 1));
        const normals = new Float64Array(12 * (segments + 1));
        for (const value of sequence) {
          leafCurl(value, segments, phi);
          leafStrip(phi, segments, 0.27, 0.004, positions, normals, 0.37, 0.007, 0.01);
          const seen = first.get(value);
          if (seen === undefined) {
            first.set(value, { phi: phi.slice(), positions: positions.slice(), normals: normals.slice() });
            continue;
          }
          expect(phi.every((v, i) => Object.is(v, seen.phi[i]))).toBe(true);
          expect(positions.every((v, i) => Object.is(v, seen.positions[i]))).toBe(true);
          expect(normals.every((v, i) => Object.is(v, seen.normals[i]))).toBe(true);
        }
      }),
      RUNS,
    );
  });
});

type Op =
  | { kind: 'begin' | 'end' | 'cancel' }
  | { kind: 'drag'; dx: number; width: number }
  | { kind: 'key'; direction: TurnDirection }
  | { kind: 'tick'; dt: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constantFrom<Op>({ kind: 'begin' }, { kind: 'end' }, { kind: 'cancel' }),
  fc.record({
    kind: fc.constant('drag' as const),
    dx: fc.integer({ min: -900, max: 900 }),
    width: fc.integer({ min: 0, max: 900 }),
  }),
  fc.constantFrom<TurnDirection>('next', 'prev').map((direction) => ({ kind: 'key' as const, direction })),
  fc.double({ min: 0, max: MAX_FRAME_DELTA, noNaN: true }).map((dt) => ({ kind: 'tick' as const, dt })),
);

function apply(state: PageTurnState, op: Op): void {
  switch (op.kind) {
    case 'begin':
      beginDrag(state);
      break;
    case 'end':
      endDrag(state);
      break;
    case 'cancel':
      cancelDrag(state);
      break;
    case 'drag':
      dragTo(state, op.dx, op.width);
      break;
    case 'key':
      turnByKey(state, op.direction);
      break;
    case 'tick':
      tickPageTurn(state, op.dt);
      break;
  }
}

describe('curl applies to the turning leaf only', () => {
  it('Feature: graveyard-core, Property 22: Only the turning leaf is deformed', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), unitArb, fc.boolean(), (ops, coverBelow, reducedMotion) => {
        const state = createPageTurnState();
        for (const op of ops) {
          apply(state, op);
          const between: number[] = [];
          for (let j = 0; j < PAGE_COUNT; j++) {
            const angle = leafAngle(state, j);
            if (angle > 0 && angle < Math.PI) between.push(j);
          }
          const index = turningLeafIndex(state);
          if (state.status === 'idle') expect(index).toBeNull();
          expect(between.length).toBeLessThanOrEqual(1);
          expect(index).toBe(between.length === 1 ? between[0] : null);
          if (index !== null) {
            const fraction = leafAngle(state, index) / Math.PI;
            expect(fraction).toBeGreaterThan(0);
            expect(fraction).toBeLessThan(1);
          }
          expect(curledLeafIndex(state, 1, false)).toBe(index ?? -1);
          expect(curledLeafIndex(state, 1, true)).toBe(-1);
          expect(curledLeafIndex(state, Math.min(coverBelow, 0.999), reducedMotion)).toBe(-1);
        }
      }),
      RUNS,
    );
  });
});

describe('curl strength', () => {
  const strengthArb = fc.double({ min: 0, max: 1, noNaN: true });

  function anglesWith(progress: number, segments: number, strength?: number): Float64Array {
    const out = new Float64Array(segments);
    if (strength === undefined) leafCurl(progress, segments, out);
    else leafCurl(progress, segments, out, strength);
    return out;
  }

  it('defaults to 0.6, inside 0 to 1', () => {
    expect(CURL_STRENGTH).toBe(0.6);
    const a = anglesWith(0.5, 12);
    const b = anglesWith(0.5, 12, CURL_STRENGTH);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('strength 0 keeps the leaf rigid and strength 1 bends by the full tip lag', () => {
    const rigid = anglesWith(0.5, 12, 0);
    for (const angle of rigid) expect(angle).toBe(Math.PI * 0.5);
    const full = anglesWith(0.5, 12, 1);
    expect(full[0]).toBe(Math.PI * 0.5);
    expect(full[11]).toBeCloseTo(Math.PI * 0.5 - LEAF_CURL.tipLag, 12);
  });

  it('Feature: graveyard-core, Property 32: Strength scales the bend and keeps the shape rules', () => {
    fc.assert(
      fc.property(unitArb, strengthArb, strengthArb, segmentsArb, widthArb, depthArb, (progress, k1, k2, segments, width, depth) => {
        const phi = anglesWith(progress, segments, k1);
        // The spine angle is the rigid one and the tip trails it by strength times the full lag.
        expect(phi[0]).toBeCloseTo(Math.PI * progress, 12);
        const lag = phi[0]! - phi[segments - 1]!;
        if (segments > 1) expect(lag).toBeCloseTo(LEAF_CURL.tipLag * k1 * Math.sin(Math.PI * progress), 12);
        // A stronger curl never bends less.
        const [weak, strong] = k1 <= k2 ? [k1, k2] : [k2, k1];
        const weakPhi = anglesWith(progress, segments, weak);
        const strongPhi = anglesWith(progress, segments, strong);
        for (let i = 0; i < segments; i++) expect(strongPhi[i]!).toBeLessThanOrEqual(weakPhi[i]! + TOL);
        // Angles stay finite and in range, the leaf is flat at both ends, the arc length is constant.
        for (const angle of phi) {
          expect(Number.isFinite(angle)).toBe(true);
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThanOrEqual(Math.PI);
        }
        expect(Array.from(anglesWith(0, segments, k1))).toEqual(new Array<number>(segments).fill(0));
        for (const angle of anglesWith(1, segments, k1)) expect(Math.abs(angle - Math.PI)).toBeLessThan(TOL);
        const { positions } = strip(phi, width, depth);
        const centerAt = (k: number): number[] => {
          const front = vertex(positions, segments, 0, k, 0);
          const back = vertex(positions, segments, 1, k, 0);
          return [(front[0]! + back[0]!) / 2, (front[2]! + back[2]!) / 2];
        };
        for (let k = 1; k <= segments; k++) {
          const a = centerAt(k - 1);
          const b = centerAt(k);
          expect(Math.abs(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) - width / segments)).toBeLessThan(TOL);
        }
        // Symmetric around the middle of the turn.
        const mirrored = anglesWith(1 - progress, segments, k1);
        const lagMirrored = mirrored[0]! - mirrored[segments - 1]!;
        expect(Math.abs(lag - lagMirrored)).toBeLessThan(1e-9);
      }),
      RUNS,
    );
  });

  it('clamps strength outside 0 to 1 and treats NaN as rigid', () => {
    expect(Array.from(anglesWith(0.5, 12, 7))).toEqual(Array.from(anglesWith(0.5, 12, 1)));
    expect(Array.from(anglesWith(0.5, 12, -3))).toEqual(Array.from(anglesWith(0.5, 12, 0)));
    expect(Array.from(anglesWith(0.5, 12, Number.NaN))).toEqual(Array.from(anglesWith(0.5, 12, 0)));
  });
});

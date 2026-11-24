/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_JITTER_DY,
  MAX_JITTER_ROTATION,
  MAX_QUILL_ROTATION,
  MAX_QUILL_SHIFT,
  inkJitter,
  quillOffset,
} from '../ui/ritual/inkStyle';

const SOURCE = import.meta.glob<string>('../ui/ritual/inkStyle.ts', { query: '?raw', import: 'default', eager: true });

const anyNumber = fc.oneof(fc.integer(), fc.double({ noNaN: false }), fc.constantFrom(NaN, Infinity, -Infinity, -1, 0));

describe('inkStyle', () => {
  it('is a pure module', () => {
    const source = Object.values(SOURCE)[0] ?? '';
    expect(source).not.toBe('');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
    expect(code).not.toMatch(/from\s+['"][^'"]*(store|domain)[^'"]*['"]/);
    expect(code).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|Math\.random)\b/);
  });

  it('Feature: graveyard-core, ink style: jitter and quill offset stay within their bounds', () => {
    fc.assert(
      fc.property(anyNumber, fc.boolean(), (n, reduced) => {
        const jitter = inkJitter(n);
        expect(Math.abs(jitter.dy)).toBeLessThanOrEqual(MAX_JITTER_DY);
        expect(Math.abs(jitter.rotation)).toBeLessThanOrEqual(MAX_JITTER_ROTATION);
        expect(inkJitter(n)).toEqual(jitter);
        const quill = quillOffset(n, reduced);
        expect(Math.abs(quill.x)).toBeLessThanOrEqual(MAX_QUILL_SHIFT);
        expect(Math.abs(quill.y)).toBeLessThanOrEqual(MAX_QUILL_SHIFT);
        expect(Math.abs(quill.rotation)).toBeLessThanOrEqual(MAX_QUILL_ROTATION);
        if (reduced) expect(quill).toEqual({ x: 0, y: 0, rotation: 0 });
      }),
      { numRuns: 200 },
    );
  });

  it('moves the quill when motion is allowed', () => {
    expect([0, 1, 2, 3].some((count) => quillOffset(count, false).x !== 0)).toBe(true);
  });
});

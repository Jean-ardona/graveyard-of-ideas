import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { routeReadingKey } from '../book/readingKeys';
import type { BookPhase } from '../book/bookSequence';

const phaseArb = fc.constantFrom<BookPhase>('closed', 'lifting', 'approaching', 'coverOpening', 'open', 'closing');
const keyArb = fc.oneof(
  fc.constantFrom('Escape', 'e', 'E', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', ' '),
  fc.string({ maxLength: 3 }),
);

describe('routeReadingKey', () => {
  it('Feature: graveyard-core, Property 15: Key routing', () => {
    fc.assert(
      fc.property(keyArb, fc.boolean(), phaseArb, (key, typing, phase) => {
        const running = phase !== 'closed' && phase !== 'closing';
        let expected: string | null = null;
        if (running && key === 'Escape') expected = 'CLOSE';
        else if (running && !typing && (key === 'e' || key === 'E')) expected = 'CLOSE';
        else if (phase === 'open' && !typing && key === 'ArrowRight') expected = 'NEXT_PAGE';
        else if (phase === 'open' && !typing && key === 'ArrowLeft') expected = 'PREV_PAGE';
        expect(routeReadingKey(key, typing, phase)).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('closes with Escape even inside a text field', () => {
    expect(routeReadingKey('Escape', true, 'open')).toBe('CLOSE');
  });

  it('leaves E and the arrows to text fields', () => {
    expect(routeReadingKey('e', true, 'open')).toBeNull();
    expect(routeReadingKey('ArrowLeft', true, 'open')).toBeNull();
  });

  it('cancels a drag with Escape instead of closing', () => {
    expect(routeReadingKey('Escape', false, 'open', true)).toBe('CANCEL_DRAG');
    expect(routeReadingKey('Escape', false, 'open', false)).toBe('CLOSE');
  });

  it('turns pages only when open', () => {
    expect(routeReadingKey('ArrowRight', false, 'coverOpening')).toBeNull();
    expect(routeReadingKey('ArrowRight', false, 'open')).toBe('NEXT_PAGE');
    expect(routeReadingKey('ArrowLeft', false, 'open')).toBe('PREV_PAGE');
  });
});

describe('routeReadingKey with the resurrection dialog', () => {
  it.each(['Escape', 'Enter', ' '])('returns LAND for %s while the dialog is still rising', (key) => {
    for (const phase of ['coverOpening', 'open'] as const) {
      expect(routeReadingKey(key, false, phase, false, false)).toBe('LAND');
    }
  });

  it('keeps the mapping once the dialog has landed or when there is none', () => {
    expect(routeReadingKey('Escape', false, 'open', false, true)).toBe('CLOSE');
    expect(routeReadingKey('Escape', false, 'open', false, null)).toBe('CLOSE');
    expect(routeReadingKey('Enter', false, 'open', false, true)).toBeNull();
    expect(routeReadingKey('ArrowRight', false, 'open', false, true)).toBe('NEXT_PAGE');
  });

  it('does nothing for a closed or closing book, and other keys are not landed', () => {
    expect(routeReadingKey('Escape', false, 'closed', false, false)).toBeNull();
    expect(routeReadingKey('Escape', false, 'closing', false, false)).toBeNull();
    expect(routeReadingKey('e', false, 'open', false, false)).toBe('CLOSE');
  });
});

describe('routeReadingKey safety rule', () => {
  it('a second Escape before the dialog lands closes as usual; Enter and Space still only land', () => {
    expect(routeReadingKey('Escape', false, 'open', false, false, 0)).toBe('LAND');
    expect(routeReadingKey('Escape', false, 'open', false, false, 1)).toBe('CLOSE');
    expect(routeReadingKey('Enter', false, 'open', false, false, 1)).toBe('LAND');
    expect(routeReadingKey(' ', false, 'open', false, false, 1)).toBe('LAND');
  });
});

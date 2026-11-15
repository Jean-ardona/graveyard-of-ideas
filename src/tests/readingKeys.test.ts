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

import { describe, expect, it } from 'vitest';
import { routeRitualKey } from '../interaction/ritualKeys';

describe('routeRitualKey', () => {
  it('validates the page with Enter while writing', () => {
    expect(routeRitualKey('Enter', false, false, 'writing', true)).toBe('NEXT');
  });

  it('leaves Shift+Enter to the field as a new line', () => {
    expect(routeRitualKey('Enter', true, false, 'writing', true)).toBeNull();
  });

  it('seals with Ctrl+Enter', () => {
    expect(routeRitualKey('Enter', false, true, 'writing', true)).toBe('SEAL');
    expect(routeRitualKey('Enter', true, true, 'writing', true)).toBe('SEAL');
  });

  it('cancels with Escape while writing', () => {
    expect(routeRitualKey('Escape', false, false, 'writing', true)).toBe('CANCEL');
  });

  it('ignores other keys while writing, including Space', () => {
    expect(routeRitualKey(' ', false, false, 'writing', true)).toBeNull();
    expect(routeRitualKey('a', false, false, 'writing', true)).toBeNull();
  });

  it('skips the cinematic with Escape, Enter or Space', () => {
    expect(routeRitualKey('Escape', false, false, 'cinematic', true)).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey('Enter', false, false, 'cinematic', true)).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey(' ', false, false, 'cinematic', true)).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey('a', false, false, 'cinematic', true)).toBeNull();
  });

  it.each(['Enter', 'Escape', ' '])('does nothing for %s while idle', (key) => {
    expect(routeRitualKey(key, false, false, 'idle', true)).toBeNull();
    expect(routeRitualKey(key, false, true, 'idle', true)).toBeNull();
  });

  describe('before the page has landed', () => {
    it.each(['Escape', 'Enter', ' '])('returns LAND for %s while writing, with any modifier', (key) => {
      for (const [shift, ctrl] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        expect(routeRitualKey(key, shift, ctrl, 'writing', false)).toBe('LAND');
      }
    });

    it('returns LAND for the keys that would skip the cinematic', () => {
      for (const key of ['Escape', 'Enter', ' ']) expect(routeRitualKey(key, false, false, 'cinematic', false)).toBe('LAND');
    });

    it('never returns NEXT, SEAL, CANCEL or SKIP_CINEMATIC', () => {
      const keys = ['Escape', 'Enter', ' ', 'a', 'Tab', 'ArrowRight'];
      for (const phase of ['idle', 'writing', 'cinematic'] as const) {
        for (const key of keys) {
          for (const [shift, ctrl] of [[false, false], [true, false], [false, true]] as const) {
            const action = routeRitualKey(key, shift, ctrl, phase, false);
            expect(['NEXT', 'SEAL', 'CANCEL', 'SKIP_CINEMATIC']).not.toContain(action);
          }
        }
      }
    });

    it('ignores other keys and stays idle while idle', () => {
      expect(routeRitualKey('a', false, false, 'writing', false)).toBeNull();
      expect(routeRitualKey('Enter', false, false, 'idle', false)).toBeNull();
    });
  });

  it('keeps the whole mapping once landed (LAND is never returned)', () => {
    for (const phase of ['idle', 'writing', 'cinematic'] as const) {
      for (const key of ['Escape', 'Enter', ' ', 'a']) {
        expect(routeRitualKey(key, false, false, phase, true)).not.toBe('LAND');
      }
    }
  });
});
describe('routeRitualKey safety rule', () => {
  it('a second Escape before landing cancels while writing; Enter and Space still only land', () => {
    expect(routeRitualKey('Escape', false, false, 'writing', false, 0)).toBe('LAND');
    expect(routeRitualKey('Escape', false, false, 'writing', false, 1)).toBe('CANCEL');
    expect(routeRitualKey('Escape', false, false, 'writing', false, 5)).toBe('CANCEL');
    expect(routeRitualKey('Enter', false, false, 'writing', false, 3)).toBe('LAND');
    expect(routeRitualKey(' ', false, false, 'writing', false, 3)).toBe('LAND');
  });

  it('does not change the landed mapping', () => {
    expect(routeRitualKey('Escape', false, false, 'writing', true, 2)).toBe('CANCEL');
    expect(routeRitualKey('Enter', false, false, 'writing', true, 2)).toBe('NEXT');
  });
});

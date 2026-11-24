import { describe, expect, it } from 'vitest';
import { routeRitualKey } from '../interaction/ritualKeys';

describe('routeRitualKey', () => {
  it('validates the page with Enter while writing', () => {
    expect(routeRitualKey('Enter', false, false, 'writing')).toBe('NEXT');
  });

  it('leaves Shift+Enter to the field as a new line', () => {
    expect(routeRitualKey('Enter', true, false, 'writing')).toBeNull();
  });

  it('seals with Ctrl+Enter', () => {
    expect(routeRitualKey('Enter', false, true, 'writing')).toBe('SEAL');
    expect(routeRitualKey('Enter', true, true, 'writing')).toBe('SEAL');
  });

  it('cancels with Escape while writing', () => {
    expect(routeRitualKey('Escape', false, false, 'writing')).toBe('CANCEL');
  });

  it('ignores other keys while writing, including Space', () => {
    expect(routeRitualKey(' ', false, false, 'writing')).toBeNull();
    expect(routeRitualKey('a', false, false, 'writing')).toBeNull();
  });

  it('skips the cinematic with Escape, Enter or Space', () => {
    expect(routeRitualKey('Escape', false, false, 'cinematic')).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey('Enter', false, false, 'cinematic')).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey(' ', false, false, 'cinematic')).toBe('SKIP_CINEMATIC');
    expect(routeRitualKey('a', false, false, 'cinematic')).toBeNull();
  });

  it.each(['Enter', 'Escape', ' '])('does nothing for %s while idle', (key) => {
    expect(routeRitualKey(key, false, false, 'idle')).toBeNull();
    expect(routeRitualKey(key, false, true, 'idle')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { formatProjectDate } from '../grimoire';

describe('formatProjectDate', () => {
  it('formats a date, and returns nothing for a value that is not one', () => {
    expect(formatProjectDate('2024-03-05T12:00:00.000Z')).toMatch(/2024/);
    expect(formatProjectDate('not a date')).toBe('');
    expect(formatProjectDate(undefined)).toBe('');
  });
});

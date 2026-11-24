import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BANNED_PATTERNS, COPY, buriedOn, errorMessage, openPrompt, pageCaptionText, qualityLowered, statsLine } from '../ui/copy';
import type { DomainErrorCode, StorageErrorCode } from '../ui/copy';

/** Every string reachable from `COPY`. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

const ERROR_CODES: Record<DomainErrorCode | StorageErrorCode, true> = {
  invalid_title: true,
  invalid_description: true,
  graveyard_full: true,
  invalid_link: true,
  not_found: true,
  invalid_transition: true,
  invalid_next_action: true,
  too_long: true,
  too_large: true,
  invalid_json: true,
  dangerous_key: true,
  unsupported_version: true,
  invalid_schema: true,
  quota_exceeded: true,
  unavailable: true,
};

const matchesBanned = (text: string): boolean => BANNED_PATTERNS.some((pattern) => pattern.test(text));

describe('keeper voice tone', () => {
  it('has no banned pattern and no exclamation mark in COPY', () => {
    const strings = allStrings(COPY);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(matchesBanned(text), text).toBe(false);
      expect(text, text).not.toContain('!');
    }
  });

  it('has none in the output of the copy functions', () => {
    const outputs = [
      openPrompt('Tide Clock'),
      buriedOn('November 20, 2023'),
      pageCaptionText(2, 3),
      qualityLowered('Low'),
      statsLine(60, 120, 'Low'),
    ];
    for (const text of outputs) {
      expect(matchesBanned(text), text).toBe(false);
      expect(text, text).not.toContain('!');
    }
  });

  it('has the ritual strings: prompt, seven pages and controls', () => {
    expect(COPY.ritual.prompt).toBe('E - Write a new project');
    expect(COPY.ritual.seal).toBe('Seal the tomb');
    const pages = Object.values(COPY.ritual.steps);
    expect(pages).toHaveLength(7);
    for (const page of pages) {
      for (const text of [page.title, page.label, page.hint]) expect(text.trim(), text).not.toBe('');
    }
    for (const text of allStrings(COPY.ritual)) expect(text.trim()).not.toBe('');
  });

  it('keeps the text of the existing prompts', () => {
    expect(openPrompt('Tide Clock')).toBe('Open Tide Clock');
    expect(COPY.prompts.resume).toBe('Click to resume');
  });

  it('has a non-empty message for every error code', () => {
    for (const code of Object.keys(ERROR_CODES) as (DomainErrorCode | StorageErrorCode)[]) {
      expect(errorMessage(code).trim(), code).not.toBe('');
    }
  });

  it('Feature: graveyard-core, Property 49: The keeper\'s voice never guilts', () => {
    const nameArb = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.string({ minLength: 300, maxLength: 600 }),
      fc.stringOf(fc.constantFrom('a', ' ', '\n', '!', '日', '本', 'é', '🪦'), { maxLength: 60 }),
      fc.constant(''),
    );
    const functions: ((name: string) => string)[] = [
      openPrompt,
      buriedOn,
      qualityLowered,
      (name) => pageCaptionText(1, 3) + name,
    ];
    fc.assert(
      fc.property(nameArb, (name) => {
        for (const copyFunction of functions) {
          const text = copyFunction(name);
          expect(text.includes(name)).toBe(true);
          const rest = text.split(name).join('');
          expect(matchesBanned(rest)).toBe(false);
          expect(rest.includes('!')).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

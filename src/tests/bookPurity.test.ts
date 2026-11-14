/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(
  [
    '../book/bookTimings.ts',
    '../book/bookSequence.ts',
    '../book/pageTurn.ts',
    '../book/readingMachine.ts',
    '../book/readingKeys.ts',
    '../book/bookPageLayout.ts',
    '../interaction/uiMode.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const FORBIDDEN_IMPORT = /from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]|from\s+['"]three\//;
const FORBIDDEN_GLOBALS =
  /\b(window|document|navigator|localStorage|setTimeout|setInterval|requestAnimationFrame|performance|HTMLElement|addEventListener)\b/;

/** Source without comments, so prose in documentation does not count. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('pure book core', () => {
  it('scans all seven modules', () => {
    expect(Object.keys(SOURCES)).toHaveLength(7);
  });

  it.each(Object.entries(SOURCES))('%s imports no React or Three.js and uses no DOM or timers', (_file, source) => {
    const code = withoutComments(source);
    expect(code).not.toMatch(FORBIDDEN_IMPORT);
    expect(code).not.toMatch(FORBIDDEN_GLOBALS);
  });
});

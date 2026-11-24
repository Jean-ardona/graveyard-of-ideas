/// <reference types="vite/client" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio, isAmberHue } from '../ui/theme/colorMath';
import { tokenMap } from '../ui/theme/themeCss';
import { CONTRAST_PAIRS, TEXT_TOKENS, TOKENS } from '../ui/theme/tokens';

const CODE = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../tests/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
// vitest's css handling returns an empty string for ?raw css imports, so read the files directly.
function readStyles(dir: string, found: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) readStyles(path, found);
    else if (entry.name.endsWith('.css')) found[path.replace(/\\/g, '/')] = readFileSync(path, 'utf8');
  }
  return found;
}
const STYLES = readStyles(join(__dirname, '..'));
const HAUNTED = Object.entries(STYLES).find(([file]) => file.endsWith('haunted.css'))?.[1] ?? '';

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const colors = TOKENS.color as Record<string, string>;

describe('contrast', () => {
  it('reads at least 7:1 for every listed pair', () => {
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(colors[pair.fg] as string, colors[pair.bg] as string);
      expect(ratio, `${pair.fg} on ${pair.bg} (${pair.usage})`).toBeGreaterThanOrEqual(7);
    }
  });

  it('lists every text token as a foreground', () => {
    const listed = new Set(CONTRAST_PAIRS.map((pair) => pair.fg));
    for (const token of TEXT_TOKENS) expect(listed.has(token), token).toBe(true);
  });
});

describe('no amber outside embers', () => {
  it('keeps every non-ember token out of the amber hue range', () => {
    const values = [...Object.values(TOKENS.color), ...Object.values(TOKENS.leaf)];
    for (const value of values) expect(isAmberHue(value), value).toBe(false);
  });

  it('references ember tokens only inside src/cinematics', () => {
    const allowed = /\/(ui\/theme\/(tokens|themeCss)\.ts|cinematics\/)/;
    for (const [file, source] of Object.entries(CODE)) {
      if (allowed.test(file)) continue;
      expect(withoutComments(source), file).not.toMatch(/\bember\b|--ember-|\.ember\b/i);
    }
    for (const [file, source] of Object.entries(STYLES)) {
      expect(source, file).not.toMatch(/--ember-/);
    }
  });
});

describe('hand cursors and controls', () => {
  it('has a cursor rule for each cursor class', () => {
    for (const name of ['grab', 'grabbing', 'pointer', 'text', 'default']) {
      expect(TOKENS.cursor[name as keyof typeof TOKENS.cursor]).toBe(name);
      expect(HAUNTED, name).toMatch(new RegExp(`cursor:\\s*var\\(--cursor-${name}\\)`));
    }
    expect(HAUNTED).toMatch(/\.book-page-surface\[data-grab='true'\]/);
    expect(HAUNTED).toMatch(/\[data-dragging='true'\]/);
  });

  it('has an appearance: none rule for each control type', () => {
    const rules = [...HAUNTED.matchAll(/([^{}]+)\{[^}]*\bappearance:\s*none/g)].map((match) => match[1] ?? '');
    for (const control of ['button', 'input', 'select', 'textarea', 'dialog']) {
      expect(
        rules.some((selector) => selector.split(',').some((part) => part.trim() === control)),
        control,
      ).toBe(true);
    }
  });

  it('uses no raw control outside src/ui/kit', () => {
    for (const [file, source] of Object.entries(CODE)) {
      if (file.includes('/ui/kit/')) continue;
      expect(withoutComments(source), file).not.toMatch(/<(button|input|select|textarea|dialog)\b/);
    }
  });

  it('uses no native checkbox, radio or select look', () => {
    for (const [file, source] of Object.entries(CODE)) {
      expect(withoutComments(source), file).not.toMatch(/type=["'](checkbox|radio)["']/);
    }
  });

  it('keeps the regular IM Fell weight at 16 px or more', () => {
    expect(HAUNTED).toMatch(/body\s*\{[^}]*font-size:\s*(1[6-9]|[2-9]\d)px/);
    expect(HAUNTED).not.toMatch(/font-style:\s*italic|font-weight:\s*(bold|[6-9]00)/);
    expect(HAUNTED).toMatch(/color-scheme:\s*dark/);
    expect(HAUNTED).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px/);
  });
});

describe('token-only CSS', () => {
  const NAMED = /:\s*[^;{}]*\b(red|green|blue|white|black|gray|grey|yellow|orange|purple|pink|brown|cyan|magenta|transparent|currentcolor)\b/i;

  it('scans at least the haunted stylesheet', () => {
    expect(HAUNTED).not.toBe('');
    expect(HAUNTED.length).toBeGreaterThan(1000);
    expect(HAUNTED).toMatch(/\.ink-field\b/);
    expect(HAUNTED).toMatch(/\.ritual-page\b/);
  });

  it.each(Object.entries(STYLES))('%s has no color literal', (_file, source) => {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?)\(/i);
    expect(css.replace(/var\([^)]*\)/g, '')).not.toMatch(NAMED);
  });

  it.each(Object.entries(STYLES))('%s uses only defined variables', (_file, source) => {
    const defined = tokenMap();
    for (const match of source.matchAll(/var\(--([a-z0-9-]+)/g)) {
      expect(defined[match[1] as string], match[1]).toBeDefined();
    }
  });
});

describe('theme modules are pure', () => {
  it('colorMath and themeCss import no React, Three.js, DOM or timers', () => {
    for (const name of ['colorMath', 'themeCss']) {
      const source = Object.entries(CODE).find(([file]) => file.endsWith(`/ui/theme/${name}.ts`))?.[1] ?? '';
      expect(source, name).not.toBe('');
      const code = withoutComments(source);
      expect(code).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|localStorage)\b/);
    }
  });
});

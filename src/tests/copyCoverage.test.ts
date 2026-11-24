/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/** Every component outside the copy module, plus the two pure files that carry page text. */
const SOURCES = import.meta.glob<string>(
  ['../**/*.tsx', '../book/bookPageLayout.ts', '../book/leafFaces.ts', '!../tests/**', '!../ui/copy/**'],
  { query: '?raw', import: 'default', eager: true },
);

const TEXT_ATTRIBUTES = new Set(['title', 'placeholder', 'alt', 'aria-label', 'aria-description', 'label']);

function isLiteral(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** Hard-coded user-facing strings found in one source file. */
function findHardCoded(file: string, source: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const isPureText = !file.endsWith('.tsx');

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim() !== '') found.push(`text "${node.text.trim()}"`);
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(tree))) {
      const init = node.initializer;
      const value = init && ts.isJsxExpression(init) ? init.expression : init;
      if (value && isLiteral(value)) found.push(`${node.name.getText(tree)}="${value.text}"`);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(tree) === 'document.title'
    ) {
      found.push('document.title assignment');
    }
    // The pure files have no JSX: any literal that reads as words is page text.
    if (isPureText && isLiteral(node) && !ts.isImportDeclaration(node.parent) && /[A-Za-z]+\s+[A-Za-z]+/.test(node.text)) {
      found.push(`literal "${node.text}"`);
    }
    if (isPureText && ts.isTemplateExpression(node) && /[A-Za-z]+\s+[A-Za-z]+/.test(node.head.text)) {
      found.push(`template "${node.head.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe('copy coverage', () => {
  it('scans the components and the two pure page files', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(8);
    expect(files.some((file) => file.endsWith('bookPageLayout.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('leafFaces.ts'))).toBe(true);
    expect(files.some((file) => file.includes('/ui/copy/'))).toBe(false);
    expect(files.some((file) => file.endsWith('/ui/ritual/RitualOverlay.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('/ui/kit/InkField.tsx'))).toBe(true);
  });

  it.each(Object.entries(SOURCES))('%s has no hard-coded user-facing string', (file, source) => {
    expect(findHardCoded(file, source)).toEqual([]);
  });

  it('detects a hard-coded string when one is added', () => {
    const bad = `export const A = () => <button title="Close">Open</button>;`;
    expect(findHardCoded('x.tsx', bad)).toEqual(['title="Close"', 'text "Open"']);
  });
});

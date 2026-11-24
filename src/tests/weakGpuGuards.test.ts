/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * Weak-GPU rules for every atmosphere file that exists now and every one added by 11.4 to 11.10.
 * Nothing to scan yet is not a failure.
 */
const SOURCES = import.meta.glob<string>(
  [
    '../world/atmosphere/**/*.{ts,tsx}',
    '../cinematics/entrance/**/*.{ts,tsx}',
    '../ui/audio/**/*.{ts,tsx}',
    '../interaction/scareDirector.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const LIGHTS = /\b(PointLight|SpotLight|DirectionalLight|pointLight|spotLight|directionalLight)\b/;
const POST_PROCESSING = /postprocessing|EffectComposer|RenderPass|UnrealBloomPass/i;
const FORBIDDEN_IMPORT = /from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]|from\s+['"]three\//;
const FORBIDDEN_GLOBALS =
  /\b(window|document|navigator|localStorage|setTimeout|setInterval|requestAnimationFrame|performance|HTMLElement|addEventListener|AudioContext)\b/;

const FRAME_CALLBACKS = new Set(['useFrame', 'requestAnimationFrame', 'onBeforeRender', 'onBeforeCompile']);
const ALLOCATING_CALLS = new Set(['clone', 'map', 'filter', 'slice', 'concat', 'from', 'flatMap']);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Modules that talk to the browser or the GPU. Everything else that is a `.ts` file must stay pure. */
function isAdapter(file: string): boolean {
  return file.endsWith('.tsx') || /\/ui\/audio\/audio(Context|Engine)\.ts$/.test(file);
}

/** Allocations written inside the callback of `useFrame` and other frame callbacks. */
function findFrameAllocations(source: string): string[] {
  const tree = ts.createSourceFile('scan.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];

  const scanBody = (body: ts.Node): void => {
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node)) found.push(`new: ${node.getText(tree)}`);
      if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) found.push(`literal: ${node.getText(tree)}`);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (ALLOCATING_CALLS.has(node.expression.name.text)) found.push(`call: ${node.expression.name.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
  };

  const visitCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(tree);
      if (FRAME_CALLBACKS.has(callee)) {
        for (const argument of node.arguments) {
          if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) scanBody(argument.body);
        }
      }
    }
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(tree);
  return found;
}

describe('weak-GPU guards', () => {
  const files = Object.entries(SOURCES);

  it('detects what it must reject', () => {
    expect(findFrameAllocations('useFrame(() => { const v = new Vector3(); });')).toHaveLength(1);
    expect(findFrameAllocations('useFrame((_, dt) => { pos.set(dt, 0, 0); });')).toEqual([]);
    expect(LIGHTS.test('new THREE.PointLight()')).toBe(true);
    expect(POST_PROCESSING.test("import { EffectComposer } from '@react-three/postprocessing'")).toBe(true);
  });

  it.each(files)('%s creates no light and imports no post-processing', (_file, source) => {
    const code = withoutComments(source);
    expect(code).not.toMatch(LIGHTS);
    expect(code).not.toMatch(POST_PROCESSING);
  });

  it.each(files)('%s allocates nothing in frame callbacks', (_file, source) => {
    expect(findFrameAllocations(source)).toEqual([]);
  });

  it.each(files.filter(([file]) => !isAdapter(file)))('%s is pure: no React, Three.js, DOM or timers', (_file, source) => {
    const code = withoutComments(source);
    expect(code).not.toMatch(FORBIDDEN_IMPORT);
    expect(code).not.toMatch(FORBIDDEN_GLOBALS);
  });
});

/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { TOKENS } from '../ui/theme/tokens';
import { createSummonController } from '../ui/summon/summonController';
import { installFrameClock } from './summonHarness';
import type { FrameClock } from './summonHarness';
import { SUMMON_MS } from './summonHarness';
import { SUMMON_TIMINGS } from '../ui/summon/summonTimings';

const SOURCES = import.meta.glob<string>(
  ['../ui/summon/summonController.ts', '../ui/summon/SummonLayer.tsx', '../ui/summon/SummonedPage.tsx'],
  { query: '?raw', import: 'default', eager: true },
);
const sourceOf = (name: string): string => Object.entries(SOURCES).find(([file]) => file.endsWith(name))?.[1] ?? '';
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let clock: FrameClock;
let element: HTMLElement;

beforeEach(() => {
  clock = installFrameClock();
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  clock.restore();
  element.remove();
});

describe('summonController loop', () => {
  it('asks for no frame until a page animates, and stops asking when the last one lands', () => {
    const controller = createSummonController();
    expect(clock.requests()).toBe(0);
    expect(controller.isAnimating()).toBe(false);
    controller.start(element, 'full', 'summon', 'low');
    expect(clock.requests()).toBe(1);
    expect(controller.isAnimating()).toBe(true);
    clock.advance(SUMMON_MS.during('full', 0.3));
    expect(clock.requests()).toBe(2);
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(controller.isAnimating()).toBe(false);
    expect(clock.pending()).toBe(0);
    const total = clock.requests();
    clock.advance(SUMMON_MS.afterIn('full'));
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(clock.requests()).toBe(total);
  });

  it('keeps one request per frame with several pages and ends after the last one', () => {
    const controller = createSummonController();
    const other = document.createElement('div');
    controller.start(element, 'short', 'summon', 'low');
    controller.start(other, 'full', 'summon', 'low');
    expect(clock.pending()).toBe(1);
    clock.advance(SUMMON_MS.afterIn('short'));
    expect(controller.isAnimating()).toBe(true);
    expect(clock.pending()).toBe(1);
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(controller.isAnimating()).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('adds the resize listener only while animating', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const controller = createSummonController();
    controller.start(element, 'short', 'summon', 'low');
    expect(add.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    clock.advance(SUMMON_MS.afterIn('short'));
    expect(remove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('summonController pose', () => {
  it('writes the first pose at once, with the page hidden, and removes the inline pose on landing', () => {
    const controller = createSummonController();
    const done = vi.fn();
    controller.start(element, 'full', 'summon', 'low', { onDone: done });
    expect(element.style.opacity).toBe('0');
    expect(element.style.transform).toContain('translateY(48px)');
    clock.advance(SUMMON_MS.during('full', 0.5));
    expect(Number(element.style.opacity)).toBeGreaterThan(0);
    expect(done).not.toHaveBeenCalled();
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(element.style.transform).toBe('');
    expect(element.style.opacity).toBe('');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('ends a dismissal at opacity 0 and calls onDone once', () => {
    const controller = createSummonController();
    const done = vi.fn();
    controller.start(element, 'full', 'dismiss', 'low', { onDone: done });
    expect(element.style.opacity).toBe('1');
    clock.advance(SUMMON_MS.afterOut('full'));
    expect(element.style.opacity).toBe('0');
    expect(done).toHaveBeenCalledTimes(1);
    expect(controller.isAnimating()).toBe(false);
  });

  it('keeps a delayed page hidden until its delay has passed', () => {
    const controller = createSummonController();
    const delaySeconds = SUMMON_TIMINGS.short.outSeconds;
    controller.start(element, 'short', 'summon', 'low', { delaySeconds });
    clock.advance(delaySeconds * 500);
    expect(element.style.opacity).toBe('0');
    clock.advance(delaySeconds * 500 + SUMMON_MS.during('short', 0.5));
    expect(Number(element.style.opacity)).toBeGreaterThan(0);
  });

  it('lands at once on land(), cancels the pending frame and calls onDone once', () => {
    const controller = createSummonController();
    const done = vi.fn();
    controller.start(element, 'full', 'summon', 'low', { onDone: done });
    controller.land(element);
    expect(element.style.opacity).toBe('');
    expect(element.style.transform).toBe('');
    expect(done).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toBe(0);
    controller.land(element);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('cancels without a callback and leaves no inline pose', () => {
    const controller = createSummonController();
    const done = vi.fn();
    controller.start(element, 'full', 'summon', 'low', { onDone: done });
    controller.cancel(element);
    expect(done).not.toHaveBeenCalled();
    expect(element.style.opacity).toBe('');
    expect(clock.pending()).toBe(0);
    expect(controller.isAnimating()).toBe(false);
  });
});

describe('summonController canvas', () => {
  it('draws motes in the mist token, then clears and hides the canvas at the end', () => {
    const controller = createSummonController();
    const canvas = document.createElement('canvas');
    controller.attachLayer(canvas);
    expect(canvas.style.display).toBe('none');
    controller.start(element, 'full', 'summon', 'low');
    expect(canvas.style.display).toBe('block');
    clock.advance(SUMMON_MS.during('full', 0.3));
    expect(clock.context.drawImage).toHaveBeenCalled();
    expect(clock.context.fillStyle).toBe(TOKENS.color.mist);
    expect(clock.context.globalAlpha).toBe(1);
    clock.context.clearRect.mockClear();
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(canvas.style.display).toBe('none');
    expect(clock.context.clearRect.mock.calls.length).toBeGreaterThanOrEqual(1);
    clock.context.drawImage.mockClear();
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(clock.context.drawImage).not.toHaveBeenCalled();
  });

  it('uses pixel ratio 1 on Low and at most 1.5 otherwise', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const controller = createSummonController();
    const canvas = document.createElement('canvas');
    controller.attachLayer(canvas);
    controller.start(element, 'short', 'summon', 'low');
    expect(clock.context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
    controller.land(element);
    controller.start(element, 'short', 'summon', 'high');
    expect(clock.context.setTransform).toHaveBeenLastCalledWith(1.5, 0, 0, 1.5, 0, 0);
    controller.land(element);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original });
  });

  it('lands every page and stops drawing when the layer is detached', () => {
    const controller = createSummonController();
    const canvas = document.createElement('canvas');
    const done = vi.fn();
    controller.attachLayer(canvas);
    controller.start(element, 'full', 'summon', 'low', { onDone: done });
    controller.detachLayer();
    expect(done).toHaveBeenCalledTimes(1);
    expect(controller.isAnimating()).toBe(false);
    expect(element.style.opacity).toBe('');
    clock.context.drawImage.mockClear();
    controller.start(element, 'full', 'summon', 'low');
    clock.advance(SUMMON_MS.during('full', 0.3));
    expect(clock.context.drawImage).not.toHaveBeenCalled();
  });

  it('animates the page without a canvas and without a 2D context', () => {
    const controller = createSummonController();
    controller.start(element, 'short', 'summon', 'low');
    clock.advance(SUMMON_MS.during('short', 0.3));
    expect(Number(element.style.opacity)).toBeGreaterThan(0);
    clock.advance(SUMMON_MS.afterIn('short'));
    expect(element.style.opacity).toBe('');
  });
});

describe('summonController source', () => {
  const FRAME_PATH = ['frame', 'step', 'finish', 'applyPose', 'drawMotes', 'clearCanvas', 'anyActive'];

  function frameBodies(): Map<string, ts.Node> {
    const tree = ts.createSourceFile('c.ts', sourceOf('summonController.ts'), ts.ScriptTarget.Latest, true);
    const found = new Map<string, ts.Node>();
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && FRAME_PATH.includes(node.name.text) && node.body) {
        found.set(node.name.text, node.body);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    return found;
  }

  it('finds every function on the frame path', () => {
    expect([...frameBodies().keys()].sort()).toEqual([...FRAME_PATH].sort());
  });

  it('allocates nothing and creates no canvas on the frame path (the two style writes are strings)', () => {
    for (const [name, body] of frameBodies()) {
      const visit = (node: ts.Node): void => {
        expect(ts.isNewExpression(node), `${name}: new`).toBe(false);
        expect(ts.isArrayLiteralExpression(node), `${name}: array`).toBe(false);
        expect(ts.isObjectLiteralExpression(node), `${name}: object`).toBe(false);
        expect(ts.isArrowFunction(node) || ts.isFunctionExpression(node), `${name}: closure`).toBe(false);
        if (ts.isCallExpression(node)) {
          expect(node.expression.getText(), `${name}: call`).not.toMatch(/createElement|getBoundingClientRect|getContext/);
        }
        ts.forEachChild(node, visit);
      };
      visit(body);
    }
  });

  it('reads the clock once per frame', () => {
    const tree = ts.createSourceFile('c.ts', sourceOf('summonController.ts'), ts.ScriptTarget.Latest, true);
    let reads = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'frame') {
        const inner = (child: ts.Node): void => {
          if (ts.isCallExpression(child) && child.expression.getText() === 'performance.now') reads += 1;
          ts.forEachChild(child, inner);
        };
        inner(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(reads).toBe(1);
  });

  it('has no color literal, no amber and no light in the three UI files', () => {
    for (const name of ['summonController.ts', 'SummonLayer.tsx', 'SummonedPage.tsx']) {
      const code = withoutComments(sourceOf(name));
      expect(code, name).not.toBe('');
      expect(code, name).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(code, name).not.toMatch(/\b(rgba?|hsla?)\(/i);
      expect(code, name).not.toMatch(/\bember\b|amber|PointLight|SpotLight|DirectionalLight|castShadow/i);
    }
  });

  it('uses no timer and keeps the canvas creation out of SummonLayer', () => {
    const controller = withoutComments(sourceOf('summonController.ts'));
    expect(controller).not.toMatch(/setTimeout|setInterval/);
    expect(withoutComments(sourceOf('SummonLayer.tsx'))).not.toMatch(/createElement\(/);
  });
});

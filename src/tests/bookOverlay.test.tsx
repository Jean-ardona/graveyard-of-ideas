import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Color } from 'three';
import type * as THREE from 'three';
import BookPageOverlay from '../book/BookPageOverlay';
import { createBookAssets } from '../book/bookAssets';
import { BOOK_LOOK } from '../book/bookLook';
import { createBookModel } from '../book/bookModel';
import {
  closeLeafTextures,
  leafCrossfadeState,
  leafTexturesInUse,
  openLeafTextures,
  syncLeafTextures,
} from '../book/leafTextureLayer';
import { BOOK_FONT_STACK } from '../book/bookFonts';
import { PAGE_METRICS } from '../book/leafFaces';
import { clearPageRect, writePageRect } from '../book/pageRect';
import { turnPage } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { appStore } from '../store/appStore';
import type { Project } from '../domain';

const SOURCES = import.meta.glob<string>(['../book/BookPageOverlay.tsx', '../book/FieldEditor.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

function restingProject(): Project {
  const project = appStore.getState().data.projects.find((p) => p.status === 'resting');
  if (!project) throw new Error('the demo data has no resting project');
  return project;
}

/** Brings the singleton machine back to `closed`, whatever state a test left it in. */
function resetMachine(): void {
  readingMachine.cancelDrag();
  readingMachine.close();
  // A close from the last page waits for its automatic turn; finishing it lets the close start.
  readingMachine.finishTurn();
  readingMachine.skip();
}

/** Plays frames until the turn in progress has settled (a turn takes 0.3 s; a frame step is clamped to 0.05 s). */
function settleTurn(): void {
  for (let i = 0; i < 8; i++) readingMachine.tick(0.05);
}

describe('BookPageOverlay', () => {
  beforeEach(() => {
    readingMachine.open(GUARD);
    readingMachine.skip();
  });

  afterEach(() => {
    cleanup();
    resetMachine();
  });

  it('shows the three pages, hides content during a turn and autosaves edits', () => {
    const project = restingProject();
    render(<BookPageOverlay project={project} />);

    // Page 1: title in the ancient font. No tabs; goal, epitaph and notes are not in the book.
    expect(screen.getByRole('dialog', { name: project.title })).toBeTruthy();
    const heading = screen.getByRole('heading', { name: project.title });
    const unquoted = (stack: string): string => stack.replace(/["']/g, '');
    expect(unquoted(heading.style.fontFamily)).toBe(unquoted(BOOK_FONT_STACK));
    expect(heading.style.overflowWrap).toBe('anywhere');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByLabelText(/goal|epitaph|notes/i)).toBeNull();

    // A turn hides the content and blocks its pointer events; it returns when the page is at rest.
    const content = screen.getByTestId('book-page-content');
    expect(content.style.opacity).toBe('1');
    act(() => turnPage('next'));
    expect(content.style.opacity).toBe('0');
    expect(content.style.pointerEvents).toBe('none');
    act(settleTurn);
    expect(content.style.opacity).toBe('1');

    // Page 2: an empty description keeps the inline error and the last saved value.
    const idea = screen.getByLabelText('The idea in one line') as HTMLTextAreaElement;
    fireEvent.change(idea, { target: { value: '' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(appStore.getState().data.projects.find((p) => p.id === project.id)?.description).toBe(project.description);
    fireEvent.change(idea, { target: { value: 'A quieter idea' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(appStore.getState().data.projects.find((p) => p.id === project.id)?.description).toBe('A quieter idea');

    // Page 3: the resurrection button is disabled without a handler.
    act(() => turnPage('next'));
    act(settleTurn);
    expect(screen.getByLabelText('Realistic next action')).toBeTruthy();
    expect(screen.getByLabelText('A smaller version (optional)')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Resurrect this project' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    // The close button dispatches CLOSE: from the last page the page turns first, then the book closes.
    fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));
    expect(readingMachine.phase()).toBe('open');
    act(settleTurn);
    act(settleTurn);
    expect(readingMachine.phase()).toBe('closing');

    appStore.getState().editProject(project.id, { description: project.description });
  });

  it('sizes the page from PAGE_METRICS times the page width and uses the shared colors', () => {
    const width = 600;
    act(() => writePageRect(100, 40, width, 800, 100));
    try {
      const project = restingProject();
      render(<BookPageOverlay project={project} />);
      const m = PAGE_METRICS;
      const px = (value: string): number => parseFloat(value);
      const content = screen.getByTestId('book-page-content');
      const heading = screen.getByRole('heading', { name: project.title });
      expect(px(content.style.fontSize)).toBeCloseTo(m.bodySize * width, 6);
      expect(px(content.style.paddingTop)).toBeCloseTo(m.paddingTop * width, 6);
      expect(px(content.style.paddingLeft)).toBeCloseTo(m.paddingX * width, 6);
      expect(px(heading.style.fontSize)).toBeCloseTo(m.titleSize * width, 6);
      expect(px(heading.style.marginTop)).toBeCloseTo(m.titleMarginTop * width, 6);
      expect(content.style.background).toBe('transparent');
      expect(content.style.color).toBe('rgb(20, 28, 48)');
      expect(content.textContent).toContain(project.title);
    } finally {
      act(() => clearPageRect());
    }
  });

  it('has no paper, border, shadow or radius of its own, so the leaf paper is the only sheet', () => {
    render(<BookPageOverlay project={restingProject()} />);
    const containers = [
      screen.getByTestId('book-page-content'),
      screen.getByTestId('book-right-zone'),
      screen.getByTestId('book-left-zone'),
    ];
    for (const element of containers) {
      expect(element.style.backgroundColor).not.toMatch(/^(#|rgb)/);
      expect(element.style.boxShadow).not.toMatch(/\d/);
      expect(element.style.border).not.toMatch(/\d/);
      expect(element.style.borderRadius).toMatch(/^(0(px)?)?$/);
      expect(element.style.outline).not.toMatch(/\d/);
    }
    expect(containers[0]!.style.background).toBe('transparent');
  });

  it('paints the blank leaf, the leaf texture and its glow from the one paper token', () => {
    const assets = createBookAssets();
    const leaf = assets.leafMaterial as THREE.MeshStandardMaterial;
    expect(leaf.color.getHexString()).toBe(new Color(BOOK_LOOK.leafPaper).getHexString());
    const paper = new Color(BOOK_LOOK.leafPaper);
    expect(leaf.color.equals(paper)).toBe(true);
    expect(leaf.emissive.equals(paper)).toBe(true);
    expect(leaf.emissiveIntensity).toBe(BOOK_LOOK.leafGlowIntensity);

    const meshes = createBookModel(assets).leaves.map((item) => item.children[0] as THREE.Mesh);
    const noop = (): undefined => undefined;
    const fills: string[] = [];
    const context = {
      measureText: () => ({ width: 1 }),
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
      set fillStyle(value: string) {
        fills.push(value);
      },
    };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    openLeafTextures(meshes, restingProject(), { createCanvas: () => canvas, loadFont: () => new Promise<void>(noop) });
    try {
      expect(fills[0]).toBe(BOOK_LOOK.leafPaper);
      const front = leafTexturesInUse()!.slots[0]!.front;
      expect(front.emissiveIntensity).toBe(leaf.emissiveIntensity);
    } finally {
      closeLeafTextures();
    }
  });

  it('reports opacity 1 to the leaf textures only when the visible page finishes its fade', () => {
    const meshes = createBookModel(createBookAssets()).leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
    const noop = (): undefined => undefined;
    const context = { measureText: () => ({ width: 1 }), fillRect: noop, strokeRect: noop, fillText: noop };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    openLeafTextures(meshes, restingProject(), { createCanvas: () => canvas, loadFont: () => new Promise<void>(noop) });
    try {
      syncLeafTextures('open', 'idle', false);
      render(<BookPageOverlay project={restingProject()} />);
      const content = screen.getByTestId('book-page-content');
      const end = (propertyName: string): void => {
        const event = new Event('transitionend', { bubbles: true });
        Object.defineProperty(event, 'propertyName', { value: propertyName });
        act(() => {
          content.dispatchEvent(event);
        });
      };
      // Another property, or a bubbled event from a child, is not the page reaching full opacity.
      end('transform');
      expect(leafCrossfadeState().textureVisible).toBe(true);
      act(() => {
        screen.getByRole('heading').dispatchEvent(new Event('animationend', { bubbles: true }));
      });
      expect(leafCrossfadeState().textureVisible).toBe(true);
      // While a leaf moves the content is hidden and a report is ignored.
      act(() => turnPage('next'));
      syncLeafTextures('open', 'settling', false);
      end('opacity');
      expect(leafCrossfadeState()).toEqual({ textureVisible: true, overlay: 'hidden' });
      act(settleTurn);
      syncLeafTextures('open', 'idle', false);
      expect(leafCrossfadeState().overlay).toBe('fading');
      end('opacity');
      expect(leafCrossfadeState()).toEqual({ textureVisible: false, overlay: 'opaque' });
    } finally {
      closeLeafTextures();
    }
  });

  it('shows the page at full opacity at once, with no fade, when reduced motion is on', () => {
    appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, reducedMotion: true } } }));
    try {
      render(<BookPageOverlay project={restingProject()} />);
      const content = screen.getByTestId('book-page-content');
      expect(content.style.opacity).toBe('1');
      expect(content.style.transition).toBe('none');
      expect(content.style.animation).toBe('none');
    } finally {
      act(() => {
        appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, reducedMotion: false } } }));
      });
    }
  });

  it('has no hex color and no bare serif in the overlay sources', () => {
    expect(Object.keys(SOURCES)).toHaveLength(2);
    for (const source of Object.values(SOURCES)) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/['"]serif['"]/);
    }
  });

  it('hides the whole overlay while the back board is dragged shut, and returns it on cancel', () => {
    render(<BookPageOverlay project={restingProject()} />);
    for (let i = 0; i < 3; i++) {
      act(() => turnPage('next'));
      act(settleTurn);
    }
    const close = screen.getByTestId('book-close-button');
    expect(close.style.opacity).toBe('1');
    act(() => {
      readingMachine.beginDrag('right');
      readingMachine.dragTo(-200, 400);
    });
    expect(close.style.opacity).toBe('0');
    expect(close.style.pointerEvents).toBe('none');
    act(() => readingMachine.cancelDrag());
    act(settleTurn);
    expect(close.style.opacity).toBe('1');
  });

  it('shows no page content in the end position, keeps the last page number, and turns back from the left zone', () => {
    render(<BookPageOverlay project={restingProject()} />);
    const content = screen.getByTestId('book-page-content');
    for (let i = 0; i < 2; i++) {
      act(() => turnPage('next'));
      act(settleTurn);
    }
    expect(content.style.opacity).toBe('1');
    expect(screen.getByTestId('book-right-zone').getAttribute('data-zone-action')).toBe('next');
    act(() => turnPage('next'));
    act(settleTurn);
    expect(readingMachine.pages.index).toBe(3);
    expect(content.style.opacity).toBe('0');
    expect(content.style.pointerEvents).toBe('none');
    expect(content.textContent).toContain('Page 3 of 3');
    expect(screen.getByTestId('book-right-zone').getAttribute('data-zone-action')).toBe('close');
    expect(screen.getByTestId('book-left-zone').getAttribute('data-zone-action')).toBe('prev');
    act(() => turnPage('prev'));
    act(settleTurn);
    expect(content.style.opacity).toBe('1');
  });
});

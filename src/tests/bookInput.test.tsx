import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { closeBook } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { createPageTurnState, settleNow, turnByKey } from '../book/pageTurn';
import { usePageDrag, useReadingInput } from '../book/useReadingInput';
import { appStore } from '../store/appStore';

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

/** Page width in pixels; a full turn is 0.8 of it (80 px), so half a turn is 40 px. */
const PAGE_WIDTH = 100;

function Harness() {
  useReadingInput();
  const drag = usePageDrag(() => PAGE_WIDTH, 'right');
  const leftDrag = usePageDrag(() => PAGE_WIDTH, 'left');
  return (
    <div>
      <div data-testid="left" {...leftDrag}>
        <input aria-label="left field" />
      </div>
      <div data-testid="surface" {...drag}>
        <input aria-label="field" />
        <textarea aria-label="area" />
        <select aria-label="choice" />
        <button>press</button>
      </div>
    </div>
  );
}

function resetMachine(): void {
  readingMachine.cancelDrag();
  readingMachine.close();
  // A close from the last page waits for its automatic turn; finishing it lets the close start.
  readingMachine.finishTurn();
  readingMachine.skip();
}

function settleTurn(): void {
  for (let i = 0; i < 8; i++) readingMachine.tick(0.05);
}

function setReducedMotion(reducedMotion: boolean): void {
  appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, reducedMotion } } }));
}

/** Presses the pointer at x, moves to x + dx and releases there. */
function dragBy(target: Element, dx: number, release = true): void {
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 300 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 300 + dx });
  if (release) fireEvent.pointerUp(target, { pointerId: 1, clientX: 300 + dx });
}

describe('page input', () => {
  beforeAll(() => {
    // jsdom has neither PointerEvent nor pointer capture.
    if (typeof window.PointerEvent === 'undefined') {
      class PointerEventForJsdom extends MouseEvent {
        readonly pointerId: number;
        constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
      Object.defineProperty(window, 'PointerEvent', { value: PointerEventForJsdom, configurable: true });
    }
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => false,
    });
  });

  beforeEach(() => {
    readingMachine.open(GUARD);
    readingMachine.skip();
    render(<Harness />);
  });

  afterEach(() => {
    cleanup();
    setReducedMotion(false);
    resetMachine();
  });

  describe('drag thresholds', () => {
    it('returns the page when less than half the turn distance was dragged', () => {
      dragBy(screen.getByTestId('surface'), -39);
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
      expect(readingMachine.pages.status).toBe('idle');
    });

    it('completes the turn at exactly half the turn distance', () => {
      dragBy(screen.getByTestId('surface'), -40);
      settleTurn();
      expect(readingMachine.pages.index).toBe(1);
    });

    it('turns back to the previous page when dragged right', () => {
      act(() => readingMachine.turnPage('next'));
      settleTurn();
      dragBy(screen.getByTestId('left'), 60);
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
    });

    it('does nothing when a zone is dragged the wrong way', () => {
      act(() => readingMachine.turnPage('next'));
      settleTurn();
      dragBy(screen.getByTestId('surface'), 70);
      settleTurn();
      dragBy(screen.getByTestId('left'), -70);
      settleTurn();
      expect(readingMachine.pages.index).toBe(1);
      expect(readingMachine.pages.status).toBe('idle');
      expect(readingMachine.phase()).toBe('open');
    });

    it('closes the book when the left zone is dragged right on the first page', () => {
      dragBy(screen.getByTestId('left'), 39);
      expect(readingMachine.phase()).toBe('open');
      settleTurn();
      dragBy(screen.getByTestId('left'), 40);
      expect(readingMachine.phase()).toBe('closing');
    });

    it('turns the last page into the end position when the right zone is dragged left, and closes from there', () => {
      for (let i = 0; i < 2; i++) {
        act(() => readingMachine.turnPage('next'));
        settleTurn();
      }
      dragBy(screen.getByTestId('surface'), -40);
      settleTurn();
      expect(readingMachine.pages.index).toBe(3);
      expect(readingMachine.phase()).toBe('open');
      dragBy(screen.getByTestId('surface'), -39);
      expect(readingMachine.phase()).toBe('open');
      settleTurn();
      dragBy(screen.getByTestId('surface'), -40);
      expect(readingMachine.phase()).toBe('closing');
      expect(readingMachine.sequence.side).toBe('back');
    });

    it('turns the last page back when the left zone is dragged right in the end position', () => {
      for (let i = 0; i < 3; i++) {
        act(() => readingMachine.turnPage('next'));
        settleTurn();
      }
      dragBy(screen.getByTestId('left'), 60);
      settleTurn();
      expect(readingMachine.pages.index).toBe(2);
      expect(readingMachine.phase()).toBe('open');
    });

    it('does not close from a closing gesture cancelled with Escape, and arrows never close at the ends', () => {
      dragBy(screen.getByTestId('left'), 70, false);
      expect(readingMachine.pages.status).toBe('dragging');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(readingMachine.phase()).toBe('open');
      settleTurn();
      expect(readingMachine.pages.status).toBe('idle');
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(readingMachine.phase()).toBe('open');
    });

    it('closes at once with reduced motion', () => {
      setReducedMotion(true);
      dragBy(screen.getByTestId('left'), 70);
      expect(readingMachine.phase()).toBe('closed');
    });

    it('never starts a left-zone drag on an input', () => {
      fireEvent.pointerDown(screen.getByLabelText('left field'), { pointerId: 1, button: 0, clientX: 300 });
      expect(readingMachine.pages.status).toBe('idle');
    });

    it('ignores a drag toward a page that does not exist', () => {
      dragBy(screen.getByTestId('surface'), 70);
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
      expect(readingMachine.pages.status).toBe('idle');
    });

    it('never starts on an input, textarea, select or button', () => {
      for (const element of [
        screen.getByLabelText('field'),
        screen.getByLabelText('area'),
        screen.getByLabelText('choice'),
        screen.getByRole('button', { name: 'press' }),
      ]) {
        fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 300 });
        expect(readingMachine.pages.status).toBe('idle');
      }
    });

    it('shows dragging while a drag is active and abandons it on pointercancel and on blur', () => {
      const surface = screen.getByTestId('surface');
      dragBy(surface, -60, false);
      expect(readingMachine.pages.status).toBe('dragging');
      fireEvent.pointerCancel(surface, { pointerId: 1 });
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);

      dragBy(surface, -60, false);
      expect(readingMachine.pages.status).toBe('dragging');
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
    });
  });

  describe('keys', () => {
    it('turns pages with the arrows, and ignores the missing direction at both ends', () => {
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      expect(readingMachine.pages.status).toBe('idle');
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      settleTurn();
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      settleTurn();
      expect(readingMachine.pages.index).toBe(2);
      // The last page turns into the end position; the arrow never closes the book from there.
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      settleTurn();
      expect(readingMachine.pages.index).toBe(3);
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(readingMachine.pages.status).toBe('idle');
      expect(readingMachine.pages.index).toBe(3);
      expect(readingMachine.phase()).toBe('open');
      fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
      settleTurn();
      expect(readingMachine.pages.index).toBe(2);
      expect(readingMachine.phase()).toBe('open');
    });

    it('closes from the last page by turning it first, then closing with the back board; Escape does the same', () => {
      for (let i = 0; i < 2; i++) {
        fireEvent.keyDown(document.body, { key: 'ArrowRight' });
        settleTurn();
      }
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(readingMachine.phase()).toBe('open');
      expect(readingMachine.pages.status).toBe('settling');
      // The automatic turn is longer than a page turn settle (0.45 s against 0.3 s).
      settleTurn();
      settleTurn();
      expect(readingMachine.pages.index).toBe(3);
      expect(readingMachine.phase()).toBe('closing');
      expect(readingMachine.sequence.side).toBe('back');
    });

    it('does nothing for the arrows inside an input or textarea', () => {
      fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowRight' });
      fireEvent.keyDown(screen.getByLabelText('area'), { key: 'ArrowRight' });
      expect(readingMachine.pages.status).toBe('idle');
      expect(readingMachine.pages.index).toBe(0);
    });

    it('cancels a drag on Escape and keeps the page; the next Escape closes', () => {
      dragBy(screen.getByTestId('surface'), -70, false);
      expect(readingMachine.pages.status).toBe('dragging');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(readingMachine.phase()).toBe('open');
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
      expect(readingMachine.pages.status).toBe('idle');

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(readingMachine.phase()).toBe('closing');
    });
  });

  describe('closing', () => {
    it('waits for a turn in progress, then closes', () => {
      act(() => readingMachine.turnPage('next'));
      closeBook();
      expect(readingMachine.phase()).toBe('open');
      settleTurn();
      expect(readingMachine.pages.index).toBe(1);
      expect(readingMachine.phase()).toBe('closing');
    });
  });

  describe('reduced motion', () => {
    it('completes an arrow turn without animation', () => {
      setReducedMotion(true);
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(readingMachine.pages.index).toBe(1);
      expect(readingMachine.pages.status).toBe('idle');
    });

    it('turns the last page and closes at once from the last page', () => {
      setReducedMotion(true);
      for (let i = 0; i < 2; i++) fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(readingMachine.pages.index).toBe(2);
      closeBook();
      expect(readingMachine.phase()).toBe('closed');
      expect(readingMachine.pages.status).toBe('idle');
    });

    it('completes and returns drags without animation', () => {
      setReducedMotion(true);
      dragBy(screen.getByTestId('surface'), -50);
      expect(readingMachine.pages.index).toBe(1);
      dragBy(screen.getByTestId('surface'), 20);
      expect(readingMachine.pages.index).toBe(1);
      expect(readingMachine.pages.status).toBe('idle');
    });
  });
});

describe('settleNow', () => {
  it('finishes a settling turn at its target and does nothing otherwise', () => {
    const state = createPageTurnState();
    settleNow(state);
    expect(state).toEqual(createPageTurnState());

    turnByKey(state, 'next');
    settleNow(state);
    expect(state.index).toBe(1);
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
  });
});

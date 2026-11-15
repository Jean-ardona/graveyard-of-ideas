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
  const drag = usePageDrag(() => PAGE_WIDTH);
  return (
    <div data-testid="surface" {...drag}>
      <input aria-label="field" />
      <textarea aria-label="area" />
      <select aria-label="choice" />
      <button>press</button>
    </div>
  );
}

function resetMachine(): void {
  readingMachine.cancelDrag();
  readingMachine.finishTurn();
  readingMachine.close();
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
      dragBy(screen.getByTestId('surface'), 60);
      settleTurn();
      expect(readingMachine.pages.index).toBe(0);
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
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(readingMachine.pages.status).toBe('idle');
      expect(readingMachine.pages.index).toBe(2);
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

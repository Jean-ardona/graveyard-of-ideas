import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { isTypingTarget } from '../interaction/typingTarget';
import { cancelPageDrag, closeBook, endPageDrag, turnPage } from './readingBook';
import { routeReadingKey } from './readingKeys';
import { readingMachine } from './readingMachine';

/**
 * Routes Escape, E and the arrow keys to the reading machine (see `routeReadingKey`).
 * The listener runs in the capture phase, before the E handler of the interaction controller,
 * so the E that starts a sequence finds the book still closed and is not taken as a close.
 */
export function useReadingInput(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const dragging = readingMachine.pages.status === 'dragging';
      const action = routeReadingKey(event.key, isTypingTarget(event.target), readingMachine.phase(), dragging);
      if (action === null) return;
      event.preventDefault();
      if (action === 'CLOSE') closeBook();
      else if (action === 'CANCEL_DRAG') cancelPageDrag();
      else turnPage(action === 'NEXT_PAGE' ? 'next' : 'prev');
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/** Elements that keep their own pointer behavior: a drag never starts on them. */
const NO_DRAG_SELECTOR = 'input, textarea, select, button';

export function startsOnControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NO_DRAG_SELECTOR) !== null;
}

export interface PageDragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Pointer handlers that turn pages by dragging. Attach them to the page surface.
 * `pageWidthPx` is read when a drag moves, so it follows window resizes.
 * The pointer is captured for the drag; pointer cancel and window blur abandon it.
 */
export function usePageDrag(pageWidthPx: () => number): PageDragHandlers {
  const activePointer = useRef<number | null>(null);
  const startX = useRef(0);

  const finish = useCallback((commit: boolean) => {
    if (activePointer.current === null) return;
    activePointer.current = null;
    if (commit) endPageDrag();
    else cancelPageDrag();
  }, []);

  useEffect(() => {
    const onBlur = (): void => finish(false);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [finish]);

  // The drag can also end by the keyboard (Escape cancels it); forget the pointer then.
  useEffect(
    () =>
      readingMachine.subscribe(() => {
        if (readingMachine.pages.status !== 'dragging') activePointer.current = null;
      }),
    [],
  );

  return {
    onPointerDown(event) {
      if (event.button !== 0 || activePointer.current !== null || startsOnControl(event.target)) return;
      if (readingMachine.phase() !== 'open' || readingMachine.pages.status !== 'idle') return;
      activePointer.current = event.pointerId;
      startX.current = event.clientX;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      event.preventDefault();
      readingMachine.beginDrag();
    },
    onPointerMove(event) {
      if (activePointer.current !== event.pointerId) return;
      readingMachine.dragTo(event.clientX - startX.current, pageWidthPx());
    },
    onPointerUp(event) {
      if (activePointer.current !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      finish(true);
    },
    onPointerCancel(event) {
      if (activePointer.current !== event.pointerId) return;
      finish(false);
    },
  };
}

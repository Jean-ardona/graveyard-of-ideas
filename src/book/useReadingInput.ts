import { useEffect } from 'react';
import { isTypingTarget } from '../interaction/typingTarget';
import { closeBook } from './readingBook';
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
      const action = routeReadingKey(event.key, isTypingTarget(event.target), readingMachine.phase());
      if (action === null) return;
      event.preventDefault();
      if (action === 'CLOSE') closeBook();
      else readingMachine.turnPage(action === 'NEXT_PAGE' ? 'next' : 'prev');
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

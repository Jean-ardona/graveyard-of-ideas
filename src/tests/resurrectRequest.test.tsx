import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BookPageOverlay from '../book/BookPageOverlay';
import { turnPage } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { checkResurrectRequest } from '../book/resurrectRequest';
import { BANNED_PATTERNS, COPY } from '../ui/copy';
import type { Project } from '../domain';

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

const BASE = {
  id: 'p1',
  title: 'A lantern',
  description: 'An idea',
  status: 'resting',
  slot: 0,
  notes: '',
  links: [],
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies Project;

function withFields(fields: Partial<Project>): Project {
  return { ...BASE, ...fields };
}

function settleTurn(): void {
  for (let i = 0; i < 8; i++) readingMachine.tick(0.05);
}

describe('checkResurrectRequest', () => {
  /**
   * **Feature: graveyard-core, Requirement 5.1: a next action is required, a reduced version is encouraged but never required**
   * **Validates: Requirements 5.1**
   */
  it('requires a non-blank next action and never requires a reduced version', () => {
    const blank = fc.array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 5 }).map((a) => a.join(''));
    fc.assert(
      fc.property(fc.option(blank, { nil: undefined }), fc.option(fc.string(), { nil: undefined }), (nextAction, reduced) => {
        expect(checkResurrectRequest({ nextAction, reducedVersion: reduced })).toEqual({
          ok: false,
          error: 'invalid_next_action',
        });
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
        fc.option(fc.string(), { nil: undefined }),
        (nextAction, reduced) => {
          const result = checkResurrectRequest({ nextAction, reducedVersion: reduced });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.input.nextAction).toBe(nextAction.trim());
          expect(result.encourageReduced).toBe((reduced ?? '').trim() === '');
          expect(result.input.reducedVersion).toBe((reduced ?? '').trim() === '' ? undefined : (reduced ?? '').trim());
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('resurrection copy', () => {
  it('has no blame, pressure or exclamation marks', () => {
    for (const text of Object.values(COPY.resurrection)) {
      expect(text).not.toContain('!');
      for (const pattern of BANNED_PATTERNS) expect(text).not.toMatch(pattern);
    }
  });
});

describe('resurrect flow in the book overlay', () => {
  beforeEach(() => {
    readingMachine.open(GUARD);
    readingMachine.skip();
  });

  afterEach(() => {
    cleanup();
    readingMachine.cancelDrag();
    readingMachine.close();
    readingMachine.finishTurn();
    readingMachine.skip();
  });

  function showPageThree(project: Project, onResurrect: () => void) {
    const view = render(<BookPageOverlay project={project} onResurrect={onResurrect} />);
    for (let i = 0; i < 2; i++) {
      act(() => turnPage('next'));
      act(settleTurn);
    }
    return view;
  }

  it('refuses without a next action, then asks for confirmation and encourages a smaller version', () => {
    const onResurrect = vi.fn();
    const view = showPageThree(withFields({}), onResurrect);
    const button = screen.getByRole('button', { name: COPY.book.resurrect });

    fireEvent.click(button);
    expect(screen.getByTestId('resurrect-needs-action').textContent).toBe(COPY.errors.invalid_next_action);
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
    expect(onResurrect).not.toHaveBeenCalled();

    // Once a next action is saved the message goes away and the next press opens the question.
    view.rerender(<BookPageOverlay project={withFields({ nextAction: ' Draw one sketch ' })} onResurrect={onResurrect} />);
    expect(screen.queryByTestId('resurrect-needs-action')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(screen.getByTestId('resurrect-confirm')).toBeTruthy();
    expect(screen.getByTestId('resurrect-next-action').textContent).toBe('Draw one sketch');
    expect(screen.getByTestId('resurrect-encouragement').textContent).toBe(COPY.resurrection.reducedEncouragement);
    expect(onResurrect).not.toHaveBeenCalled();

    // Going back changes nothing; confirming without a smaller version is allowed.
    fireEvent.click(screen.getByRole('button', { name: COPY.resurrection.back }));
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).toHaveBeenCalledTimes(1);
    expect(onResurrect).toHaveBeenCalledWith({ nextAction: 'Draw one sketch' });
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
  });

  it('shows the smaller version instead of the encouragement when there is one', () => {
    const onResurrect = vi.fn();
    showPageThree(withFields({ nextAction: 'Draw', reducedVersion: 'One sketch' }), onResurrect);
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(screen.queryByTestId('resurrect-encouragement')).toBeNull();
    expect(screen.getByTestId('resurrect-reduced').textContent).toBe('One sketch');
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).toHaveBeenCalledWith({ nextAction: 'Draw', reducedVersion: 'One sketch' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BookPageOverlay from '../book/BookPageOverlay';
import { turnPage } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { checkResurrectRequest } from '../book/resurrectRequest';
import { BANNED_PATTERNS, COPY } from '../ui/copy';
import type { Project } from '../domain';
import { resurrectGate } from '../book/resurrectGate';
import { useReadingInput } from '../book/useReadingInput';
import { appStore } from '../store/appStore';
import { summonController } from '../ui/summon';
import { installFrameClock } from './summonHarness';
import type { FrameClock } from './summonHarness';
import { SUMMON_MS } from './summonHarness';

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

let clock: FrameClock;
const setMotion = (flags: { reducedMotion?: boolean; calmMode?: boolean }): void => {
  act(() => {
    appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, ...flags } } }));
  });
};
/** Lets the dialog's full summon land. */
const land = (): void => clock.advance(SUMMON_MS.afterIn('full'));
/** Lets the dialog's full dismissal finish. */
const dissolve = (): void => clock.advance(SUMMON_MS.afterOut('full'));
const dialogPage = (): HTMLElement | null =>
  screen.queryByTestId('resurrect-confirm')?.closest<HTMLElement>('.summon-page') ?? null;
describe('resurrect flow in the book overlay', () => {
  beforeEach(() => {
    clock = installFrameClock();
    readingMachine.open(GUARD);
    readingMachine.skip();
  });
  afterEach(() => {
    cleanup();
    setMotion({ reducedMotion: false, calmMode: false });
    clock.restore();
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
    land();
    // Going back changes nothing; the dialog dissolves and is gone. Confirming without a smaller version is allowed.
    fireEvent.click(screen.getByRole('button', { name: COPY.resurrection.back }));
    expect(dialogPage()?.hasAttribute('inert')).toBe(true);
    dissolve();
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    land();
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).toHaveBeenCalledTimes(1);
    expect(onResurrect).toHaveBeenCalledWith({ nextAction: 'Draw one sketch' });
    expect(dialogPage()?.getAttribute('aria-hidden')).toBe('true');
    dissolve();
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
  });
  it('shows the smaller version instead of the encouragement when there is one', () => {
    const onResurrect = vi.fn();
    showPageThree(withFields({ nextAction: 'Draw', reducedVersion: 'One sketch' }), onResurrect);
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(screen.queryByTestId('resurrect-encouragement')).toBeNull();
    expect(screen.getByTestId('resurrect-reduced').textContent).toBe('One sketch');
    land();
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).toHaveBeenCalledWith({ nextAction: 'Draw', reducedVersion: 'One sketch' });
  });
  it('summons the dialog in full and dismisses it in full', () => {
    const start = vi.spyOn(summonController, 'start');
    showPageThree(withFields({ nextAction: 'Draw' }), vi.fn());
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(start.mock.calls.at(-1)?.slice(1, 3)).toEqual(['full', 'summon']);
    land();
    fireEvent.click(screen.getByRole('button', { name: COPY.resurrection.back }));
    expect(start.mock.calls.at(-1)?.slice(1, 3)).toEqual(['full', 'dismiss']);
    start.mockRestore();
  });

  it('ignores the buttons before landing: the click only lands the dialog', () => {
    const onResurrect = vi.fn();
    showPageThree(withFields({ nextAction: 'Draw' }), onResurrect);
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(dialogPage()?.dataset.landed).toBe('false');
    expect(dialogPage()?.style.pointerEvents).toBe('none');
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).not.toHaveBeenCalled();
    expect(dialogPage()?.dataset.landed).toBe('true');
    expect(dialogPage()?.style.pointerEvents).toBe('auto');
    expect(dialogPage()?.style.opacity).toBe('');
    expect(dialogPage()?.style.transform).toBe('');
    fireEvent.click(screen.getByTestId('resurrect-confirm-button'));
    expect(onResurrect).toHaveBeenCalledTimes(1);
  });

  function Keys() {
    useReadingInput();
    return null;
  }

  it.each(['Escape', 'Enter', ' '])('lands the rising dialog on %o and does not close the book', (key) => {
    render(<Keys />);
    showPageThree(withFields({ nextAction: 'Draw' }), vi.fn());
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(resurrectGate.landed()).toBe(false);
    fireEvent.keyDown(window, { key });
    expect(resurrectGate.landed()).toBe(true);
    expect(dialogPage()?.dataset.landed).toBe('true');
    expect(readingMachine.phase()).toBe('open');
  });

  it('closes the book on the next Escape once the dialog has landed, and the gate is empty without a dialog', () => {
    render(<Keys />);
    showPageThree(withFields({ nextAction: 'Draw' }), vi.fn());
    expect(resurrectGate.landed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    land();
    fireEvent.keyDown(window, { key: 'Escape' });
    // On the last page a close first turns that page automatically, then the book closes.
    const closing = readingMachine.phase() !== 'open' || readingMachine.pages.status !== 'idle';
    expect(closing).toBe(true);
  });

  it.each([{ reducedMotion: true }, { calmMode: true }])('with %o mounts and unmounts at once, landed, with no controller', (flags) => {
    setMotion(flags);
    const start = vi.spyOn(summonController, 'start');
    showPageThree(withFields({ nextAction: 'Draw' }), vi.fn());
    fireEvent.click(screen.getByRole('button', { name: COPY.book.resurrect }));
    expect(dialogPage()?.dataset.landed).toBe('true');
    expect(resurrectGate.landed()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: COPY.resurrection.back }));
    expect(screen.queryByTestId('resurrect-confirm')).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(clock.requests()).toBe(0);
    start.mockRestore();
  });
});

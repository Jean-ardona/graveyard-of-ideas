import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BookPageOverlay from '../book/BookPageOverlay';
import { BOOK_FONT_STACK } from '../book/bookFonts';
import { turnPage } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { appStore } from '../store/appStore';
import type { Project } from '../domain';

const GUARD = { playerInFront: true, mode: 'exploring', pointerAllowsMovement: true, projectResting: true } as const;

function restingProject(): Project {
  const project = appStore.getState().data.projects.find((p) => p.status === 'resting');
  if (!project) throw new Error('the demo data has no resting project');
  return project;
}

/** Brings the singleton machine back to `closed`, whatever state a test left it in. */
function resetMachine(): void {
  readingMachine.cancelDrag();
  readingMachine.finishTurn();
  readingMachine.close();
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

    // The close button dispatches CLOSE.
    fireEvent.click(screen.getByRole('button', { name: 'Close the book' }));
    expect(readingMachine.phase()).toBe('closing');

    appStore.getState().editProject(project.id, { description: project.description });
  });
});

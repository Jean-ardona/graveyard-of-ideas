/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualMachine } from '../interaction/ritualMachine';
import { appStore } from '../store/appStore';
import { COPY } from '../ui/copy';
import RitualOverlay, { PAGE_FADE_MS } from '../ui/ritual/RitualOverlay';

const GUARD = { mode: 'exploring', pointerAllowsMovement: true, slotFree: true, bookOpen: false } as const;

function started(): RitualMachine {
  const machine = createRitualMachine();
  machine.send({ type: 'START', guard: GUARD });
  return machine;
}

const field = (): HTMLInputElement | HTMLTextAreaElement => document.getElementById('ritual-field') as HTMLInputElement;
const button = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;
const typeText = (text: string): void => {
  fireEvent.change(field(), { target: { value: text } });
};
const setMotion = (reducedMotion: boolean): void => {
  act(() => {
    appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, reducedMotion } } }));
  });
};
const swapAll = (): void => {
  act(() => {
    vi.advanceTimersByTime(PAGE_FADE_MS + 5);
  });
};

describe('RitualOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    setMotion(false);
    vi.useRealTimers();
  });

  it('shows nothing until the ritual starts, then the name page with focus on the field', () => {
    const machine = createRitualMachine();
    render(<RitualOverlay machine={machine} />);
    expect(screen.queryByTestId('ritual-page')).toBeNull();
    act(() => {
      machine.send({ type: 'START', guard: GUARD });
    });
    expect(screen.getByRole('heading').textContent).toBe(COPY.ritual.steps.title.title);
    expect(screen.getByText('Page 1 of 7')).toBeTruthy();
    expect(document.activeElement).toBe(field());
    expect(field().tagName).toBe('INPUT');
  });

  it('shows an inline error on Enter with an empty required field and stays', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe(COPY.errors.invalid_title);
    expect(machine.state.step).toBe(0);
  });

  it('goes next, keeps text on Back and shows Skip only on optional pages', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    expect(screen.queryByRole('button', { name: COPY.ritual.skip })).toBeNull();
    typeText('Tide Clock');
    fireEvent.keyDown(field(), { key: 'Enter' });
    swapAll();
    expect(machine.state.step).toBe(1);
    expect(field().tagName).toBe('TEXTAREA');
    typeText('A clock for tides');
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(machine.state.step).toBe(1);
    fireEvent.click(button(COPY.ritual.next));
    swapAll();
    expect(machine.state.step).toBe(2);
    expect(button(COPY.ritual.skip)).toBeTruthy();
    fireEvent.click(button(COPY.ritual.back));
    swapAll();
    expect(machine.state.step).toBe(1);
    expect(field().value).toBe('A clock for tides');
    fireEvent.click(button(COPY.ritual.back));
    swapAll();
    expect(field().value).toBe('Tide Clock');
    expect((button(COPY.ritual.back)).disabled).toBe(true);
  });

  it('cancels with the button and with Escape', () => {
    const machine = started();
    const { unmount } = render(<RitualOverlay machine={machine} />);
    fireEvent.click(button(COPY.ritual.cancel));
    expect(machine.phase()).toBe('idle');
    expect(screen.queryByTestId('ritual-page')).toBeNull();
    unmount();

    const again = started();
    render(<RitualOverlay machine={again} />);
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(again.phase()).toBe('idle');
  });

  it('enables Seal the tomb exactly when title and description are filled, from any step', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    expect(button(COPY.ritual.seal).disabled).toBe(true);
    typeText('Name');
    expect(button(COPY.ritual.seal).disabled).toBe(true);
    fireEvent.keyDown(field(), { key: 'Enter' });
    swapAll();
    typeText('Words');
    expect(button(COPY.ritual.seal).disabled).toBe(false);
    fireEvent.keyDown(field(), { key: 'Enter' });
    swapAll();
    expect(button(COPY.ritual.seal).disabled).toBe(false);
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    expect(machine.phase()).toBe('cinematic');
    expect(screen.queryByTestId('ritual-page')).toBeNull();
  });

  it('seals with the button too', () => {
    const machine = started();
    machine.send({ type: 'EDIT', text: 'Name' });
    machine.send({ type: 'NEXT' });
    machine.send({ type: 'EDIT', text: 'Words' });
    render(<RitualOverlay machine={machine} />);
    swapAll();
    fireEvent.click(button(COPY.ritual.seal));
    expect(machine.phase()).toBe('cinematic');
  });

  it('moves to an invalid typed optional field with Ctrl+Enter and shows its error', () => {
    const machine = started();
    machine.send({ type: 'EDIT', text: 'Name' });
    machine.send({ type: 'NEXT' });
    machine.send({ type: 'EDIT', text: 'Words' });
    machine.send({ type: 'NEXT' });
    for (let i = 0; i < 4; i++) machine.send({ type: 'SKIP_STEP' });
    render(<RitualOverlay machine={machine} />);
    swapAll();
    expect(machine.state.step).toBe(6);
    typeText('javascript:alert(1)');
    expect(button(COPY.ritual.seal).disabled).toBe(true);
    fireEvent.click(button(COPY.ritual.back));
    swapAll();
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    swapAll();
    expect(machine.state.step).toBe(6);
    expect(screen.getByRole('alert').textContent).toBe(COPY.errors.invalid_link);
    expect(document.querySelector('a')).toBeNull();
    expect(field().value).toBe('javascript:alert(1)');
  });

  it('hides the old page before it shows the new one', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    typeText('Name');
    fireEvent.keyDown(field(), { key: 'Enter' });
    const sheet = screen.getByTestId('ritual-sheet');
    expect(sheet.getAttribute('data-phase')).toBe('out');
    expect(sheet.getAttribute('data-step')).toBe('0');
    act(() => {
      vi.advanceTimersByTime(PAGE_FADE_MS - 10);
    });
    expect(sheet.getAttribute('data-phase')).toBe('out');
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(sheet.getAttribute('data-phase')).toBe('in');
    expect(sheet.getAttribute('data-step')).toBe('1');
  });

  it('swaps at once with reduced motion', () => {
    setMotion(true);
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    typeText('Name');
    fireEvent.keyDown(field(), { key: 'Enter' });
    const sheet = screen.getByTestId('ritual-sheet');
    expect(sheet.getAttribute('data-phase')).toBe('in');
    expect(sheet.getAttribute('data-step')).toBe('1');
    expect(screen.getByTestId('ritual-page').getAttribute('data-still')).toBe('true');
  });

  it('never sends typed text to the store', () => {
    const projects = appStore.getState().data.projects;
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    typeText('Name');
    fireEvent.keyDown(field(), { key: 'Enter' });
    swapAll();
    typeText('Words');
    fireEvent.click(button(COPY.ritual.seal));
    expect(appStore.getState().data.projects).toBe(projects);
  });
});

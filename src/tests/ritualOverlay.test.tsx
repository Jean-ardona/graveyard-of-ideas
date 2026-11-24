/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualMachine } from '../interaction/ritualMachine';
import { appStore } from '../store/appStore';
import { COPY } from '../ui/copy';
import RitualOverlay from '../ui/ritual/RitualOverlay';
import { summonController } from '../ui/summon';
import { installFrameClock } from './summonHarness';
import type { FrameClock } from './summonHarness';
import { SUMMON_MS } from './summonHarness';

const GUARD = { mode: 'exploring', pointerAllowsMovement: true, slotFree: true, bookOpen: false } as const;

function started(): RitualMachine {
  const machine = createRitualMachine();
  machine.send({ type: 'START', guard: GUARD });
  return machine;
}

let clock: FrameClock;

const field = (): HTMLInputElement | HTMLTextAreaElement => document.getElementById('ritual-field') as HTMLInputElement;
const button = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement;
const typeText = (text: string): void => {
  fireEvent.change(field(), { target: { value: text } });
};
const setMotion = (flags: { reducedMotion?: boolean; calmMode?: boolean }): void => {
  act(() => {
    appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, ...flags } } }));
  });
};
/** Lets the first summon land. */
const land = (): void => clock.advance(SUMMON_MS.afterIn('full'));
/** Lets a swap between two steps finish (the old page dissolves, then the new one rises). */
const swapAll = (): void => clock.advance(SUMMON_MS.afterSwap('short'));
const live = (): HTMLElement | null => document.querySelector('.summon-stage > .summon-page');
const copy = (): HTMLElement | null => document.querySelector('.summon-retiring > .summon-page');
const opacityOf = (node: HTMLElement | null): number => (node === null ? 0 : Number(node.style.opacity || 1));

describe('RitualOverlay', () => {
  beforeEach(() => {
    clock = installFrameClock();
  });
  afterEach(() => {
    cleanup();
    setMotion({ reducedMotion: false, calmMode: false });
    clock.restore();
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
    expect(live()?.dataset.landed).toBe('false');
  });

  it('summons the first page in full', () => {
    const start = vi.spyOn(summonController, 'start');
    render(<RitualOverlay machine={started()} />);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.slice(1, 3)).toEqual(['full', 'summon']);
    start.mockRestore();
  });

  describe('before the page has landed', () => {
    it('keeps typed text, lets Enter, Space and Escape only land the page, then Escape cancels', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      typeText('Tide');
      expect(field().value).toBe('Tide');
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(machine.state.step).toBe(0);
      expect(live()?.dataset.landed).toBe('true');
      expect(live()?.style.opacity).toBe('');
      cleanup();
      const second = started();
      render(<RitualOverlay machine={second} />);
      fireEvent.keyDown(field(), { key: ' ' });
      expect(live()?.dataset.landed).toBe('true');
      cleanup();
      const third = started();
      render(<RitualOverlay machine={third} />);
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(third.phase()).toBe('writing');
      expect(live()?.dataset.landed).toBe('true');
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(third.phase()).toBe('idle');
    });

    it('keeps pointer events off the page; a click on a button only lands it', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      expect(live()?.style.pointerEvents).toBe('none');
      typeText('Name');
      fireEvent.click(button(COPY.ritual.next));
      expect(machine.state.step).toBe(0);
      expect(live()?.dataset.landed).toBe('true');
      expect(live()?.style.pointerEvents).toBe('auto');
      fireEvent.click(button(COPY.ritual.next));
      expect(machine.state.step).toBe(1);
    });

    it('does not seal with Ctrl+Enter before landing', () => {
      const machine = started();
      machine.send({ type: 'EDIT', text: 'Name' });
      machine.send({ type: 'NEXT' });
      machine.send({ type: 'EDIT', text: 'Words' });
      render(<RitualOverlay machine={machine} />);
      fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
      expect(machine.phase()).toBe('writing');
      fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
      expect(machine.phase()).toBe('cinematic');
    });
  });

  it('shows an inline error on Enter with an empty required field and stays', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    land();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe(COPY.errors.invalid_title);
    expect(machine.state.step).toBe(0);
  });

  it('goes next, keeps text on Back and shows Skip only on optional pages', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    land();
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
    expect(button(COPY.ritual.back).disabled).toBe(true);
  });

  describe('swap between steps', () => {
    const swapped = () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      land();
      typeText('Name');
      const start = vi.spyOn(summonController, 'start');
      fireEvent.keyDown(field(), { key: 'Enter' });
      return { machine, start };
    };

    it('uses the short timing, freezes the old page as an inert copy and focuses the new field', () => {
      const { start } = swapped();
      expect(start.mock.calls.map((call) => `${call[1]}:${call[2]}`)).toEqual(['short:dismiss', 'short:summon']);
      const old = copy();
      expect(old?.hasAttribute('inert')).toBe(true);
      expect(old?.getAttribute('aria-hidden')).toBe('true');
      expect(old?.querySelector('[id]')).toBeNull();
      expect(document.activeElement).toBe(field());
      expect(field().tagName).toBe('TEXTAREA');
      start.mockRestore();
    });

    it('never shows two pages at once and ends on the final state', () => {
      swapped().start.mockRestore();
      for (let i = 0; i < 12; i++) {
        expect(opacityOf(copy()) > 0 && opacityOf(live()) > 0, `step ${i}`).toBe(false);
        clock.advance(SUMMON_MS.afterSwap('short') / 10);
      }
      expect(copy()).toBeNull();
      expect(live()?.dataset.landed).toBe('true');
      expect(live()?.style.transform).toBe('');
    });

    it('lands the swap on an early click', () => {
      const { machine, start } = swapped();
      start.mockRestore();
      fireEvent.click(document.body);
      expect(copy()).toBeNull();
      expect(live()?.dataset.landed).toBe('true');
      fireEvent.click(button(COPY.ritual.back));
      expect(machine.state.step).toBe(0);
    });
  });

  describe('dismiss', () => {
    it('cancels with the button: input and machine are free at once, the page dissolves in full, then goes', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      land();
      const start = vi.spyOn(summonController, 'start');
      fireEvent.click(button(COPY.ritual.cancel));
      expect(machine.phase()).toBe('idle');
      expect(machine.inputLocked()).toBe(false);
      const page = screen.getByTestId('ritual-page');
      expect(start.mock.calls.at(-1)?.slice(1, 3)).toEqual(['full', 'dismiss']);
      const retiring = live();
      expect(retiring?.hasAttribute('inert')).toBe(true);
      expect(retiring?.getAttribute('aria-hidden')).toBe('true');
      expect(retiring?.style.pointerEvents).toBe('none');
      expect(page.isConnected).toBe(true);
      clock.advance(SUMMON_MS.afterOut('full'));
      expect(screen.queryByTestId('ritual-page')).toBeNull();
      expect(document.querySelector('.ritual-layer')).toBeNull();
      start.mockRestore();
    });

    it('cancels with Escape once landed', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      land();
      fireEvent.keyDown(field(), { key: 'Escape' });
      expect(machine.phase()).toBe('idle');
      clock.advance(SUMMON_MS.afterOut('full'));
      expect(screen.queryByTestId('ritual-page')).toBeNull();
    });

    it('dissolves the last page when the tomb is sealed', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      land();
      typeText('Name');
      fireEvent.keyDown(field(), { key: 'Enter' });
      swapAll();
      typeText('Words');
      expect(button(COPY.ritual.seal).disabled).toBe(false);
      fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
      expect(machine.phase()).toBe('cinematic');
      expect(screen.getByTestId('ritual-page')).toBeTruthy();
      clock.advance(SUMMON_MS.afterOut('full'));
      expect(screen.queryByTestId('ritual-page')).toBeNull();
    });

    it('can start again while the old page is still dissolving', () => {
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      land();
      fireEvent.click(button(COPY.ritual.cancel));
      act(() => {
        machine.send({ type: 'START', guard: GUARD });
      });
      expect(live()?.dataset.landed).toBe('false');
      expect(live()?.hasAttribute('inert')).toBe(false);
      land();
      expect(screen.getAllByTestId('ritual-page')).toHaveLength(1);
      expect(field().value).toBe('');
    });
  });

  it('seals from any step once title and description are filled', () => {
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    land();
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
  });

  it('seals with the button too', () => {
    const machine = started();
    machine.send({ type: 'EDIT', text: 'Name' });
    machine.send({ type: 'NEXT' });
    machine.send({ type: 'EDIT', text: 'Words' });
    render(<RitualOverlay machine={machine} />);
    land();
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
    land();
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

  it('never sends typed text to the store', () => {
    const projects = appStore.getState().data.projects;
    const machine = started();
    render(<RitualOverlay machine={machine} />);
    land();
    typeText('Name');
    fireEvent.keyDown(field(), { key: 'Enter' });
    swapAll();
    typeText('Words');
    fireEvent.click(button(COPY.ritual.seal));
    expect(appStore.getState().data.projects).toBe(projects);
  });

  describe.each([{ reducedMotion: true }, { calmMode: true }])('instant motion %o', (flags) => {
    it('never starts the controller, draws no canvas and swaps and leaves in the same step', () => {
      setMotion(flags);
      const start = vi.spyOn(summonController, 'start');
      const machine = started();
      render(<RitualOverlay machine={machine} />);
      expect(live()?.dataset.landed).toBe('true');
      expect(live()?.getAttribute('style')).not.toMatch(/transform|opacity/);
      expect(screen.getByTestId('ritual-page').getAttribute('data-still')).toBe('true');
      typeText('Name');
      fireEvent.keyDown(field(), { key: 'Enter' });
      expect(machine.state.step).toBe(1);
      expect(screen.getByTestId('ritual-sheet').getAttribute('data-step')).toBe('1');
      expect(copy()).toBeNull();
      expect(screen.getAllByTestId('ritual-page')).toHaveLength(1);
      fireEvent.click(button(COPY.ritual.cancel));
      expect(machine.phase()).toBe('idle');
      expect(screen.queryByTestId('ritual-page')).toBeNull();
      expect(start).not.toHaveBeenCalled();
      expect(clock.requests()).toBe(0);
      expect(document.querySelector('canvas')).toBeNull();
      start.mockRestore();
    });
  });

  it('keeps the real inputs and buttons in their order with their roles', () => {
    render(<RitualOverlay machine={started()} />);
    land();
    expect(screen.getByRole('dialog', { name: COPY.ritual.dialog })).toBeTruthy();
    expect(screen.getByRole('textbox')).toBe(field());
    const names = screen.getAllByRole('button').map((node) => node.textContent);
    expect(names).toEqual([COPY.ritual.back, COPY.ritual.cancel, COPY.ritual.next, COPY.ritual.seal]);
  });
});

/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createSummonController } from '../ui/summon/summonController';
import type { SummonController } from '../ui/summon/summonController';
import SummonLayer from '../ui/summon/SummonLayer';
import SummonedPage from '../ui/summon/SummonedPage';
import { SUMMON_MS } from './summonHarness';
import ResurrectConfirm from '../book/ResurrectConfirm';
import { resurrectGate } from '../book/resurrectGate';
import { createRitualMachine } from '../interaction/ritualMachine';
import { COPY } from '../ui/copy';
import RitualOverlay from '../ui/ritual/RitualOverlay';

/**
 * Real frame semantics: fake timers drive requestAnimationFrame and performance.now from one clock,
 * as a browser does, and the page runs under StrictMode with the mote layer mounted, as in the app.
 */
let controller: SummonController;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  controller = createSummonController();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function app(onClick: () => void, onLanded?: (landed: boolean) => void) {
  return (
    <StrictMode>
      <SummonedPage pageKey="a" instant={false} quality="low" controller={controller} onLandedChange={onLanded}>
        <button type="button" onClick={onClick}>
          act
        </button>
      </SummonedPage>
      <SummonLayer controller={controller} />
    </StrictMode>
  );
}
const live = (container: HTMLElement): HTMLElement => container.querySelector('.summon-stage > .summon-page') as HTMLElement;

describe('summoned page with real frame semantics', () => {
  it('has landed after the in-duration: pointer events on, button works, no inline pose', () => {
    const clicked = vi.fn();
    const { container, getByText } = render(app(clicked));
    expect(live(container).dataset.landed).toBe('false');
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    const node = live(container);
    expect(node.dataset.landed).toBe('true');
    expect(node.style.pointerEvents).toBe('auto');
    expect(node.style.transform).toBe('');
    expect(node.style.opacity).toBe('');
    expect(controller.isAnimating()).toBe(false);
    fireEvent.click(getByText('act'));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('is landed by the frame loop itself, before the deadline would fire', () => {
    const { container } = render(app(vi.fn()));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    expect(live(container).dataset.landed).toBe('true');
    expect(controller.isAnimating()).toBe(false);
  });

  it('lands by the deadline even when no frame ever comes', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const { container } = render(app(vi.fn()));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterDeadline('full')));
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.transform).toBe('');
    vi.unstubAllGlobals();
  });

  it('lands on the first click without pressing the button under it', () => {
    const clicked = vi.fn();
    const { container, getByText } = render(app(clicked));
    act(() => vi.advanceTimersByTime(SUMMON_MS.during('full', 0.1)));
    fireEvent.click(getByText('act'));
    expect(clicked).not.toHaveBeenCalled();
    expect(live(container).dataset.landed).toBe('true');
    fireEvent.click(getByText('act'));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('reports the dismissal under StrictMode, from the frame loop and from the deadline without frames', () => {
    const dismissed = vi.fn();
    const view = (open: boolean) => (
      <StrictMode>
        <SummonedPage pageKey="a" open={open} instant={false} quality="low" controller={controller} onDismissed={dismissed}>
          <p>page</p>
        </SummonedPage>
      </StrictMode>
    );
    const { rerender } = render(view(true));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    rerender(view(false));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterOut('full')));
    expect(dismissed).toHaveBeenCalledTimes(1);
    cleanup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const again = render(view(true));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterDeadline('full')));
    again.rerender(view(false));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterOutDeadline('full')));
    expect(dismissed).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('stops swallowing clicks once landed', () => {
    const clicked = vi.fn();
    const { getByText } = render(app(clicked));
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    for (let i = 0; i < 3; i++) fireEvent.click(getByText('act'));
    expect(clicked).toHaveBeenCalledTimes(3);
  });
});

describe('ritual and dialog with real frame semantics under StrictMode', () => {
  const GUARD = { mode: 'exploring', pointerAllowsMovement: true, slotFree: true, bookOpen: false } as const;

  it('the ritual page lands after the in-duration: buttons work and Escape cancels', () => {
    const machine = createRitualMachine();
    machine.send({ type: 'START', guard: GUARD });
    const { container, getByRole } = render(
      <StrictMode>
        <RitualOverlay machine={machine} />
        <SummonLayer />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    const node = live(container);
    expect(node.dataset.landed).toBe('true');
    expect(node.style.pointerEvents).toBe('auto');
    expect(node.style.transform).toBe('');
    expect(node.style.opacity).toBe('');
    const field = document.getElementById('ritual-field') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Name' } });
    fireEvent.click(getByRole('button', { name: COPY.ritual.next }));
    expect(machine.state.step).toBe(1);
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterSwap('short')));
    fireEvent.keyDown(document.getElementById('ritual-field') as HTMLElement, { key: 'Escape' });
    expect(machine.phase()).toBe('idle');
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterOutDeadline('full')));
    expect(container.querySelector('.summon-page')).toBeNull();
  });

  it('Escape pressed twice cancels the ritual even before the page has landed', () => {
    const machine = createRitualMachine();
    machine.send({ type: 'START', guard: GUARD });
    render(
      <StrictMode>
        <RitualOverlay machine={machine} />
      </StrictMode>,
    );
    const field = document.getElementById('ritual-field') as HTMLElement;
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(machine.phase()).toBe('writing');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(machine.phase()).toBe('idle');
  });

  it('the resurrection dialog lands after the in-duration and its buttons work', () => {
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    const request = { ok: true, input: { nextAction: 'Draw' }, encourageReduced: true } as const;
    const { getByRole, container } = render(
      <StrictMode>
        <ResurrectConfirm request={request} open onBack={onBack} onConfirm={onConfirm} onDismissed={vi.fn()} />
      </StrictMode>,
    );
    expect(resurrectGate.landed()).toBe(false);
    act(() => vi.advanceTimersByTime(SUMMON_MS.afterIn('full')));
    expect(resurrectGate.landed()).toBe(true);
    expect(live(container).style.pointerEvents).toBe('auto');
    fireEvent.click(getByRole('button', { name: COPY.resurrection.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: COPY.resurrection.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
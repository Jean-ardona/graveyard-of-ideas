/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { appStore } from '../store/appStore';
import { createSummonController } from '../ui/summon/summonController';
import type { SummonController } from '../ui/summon/summonController';
import SummonLayer from '../ui/summon/SummonLayer';
import SummonedPage from '../ui/summon/SummonedPage';
import type { SummonedPageProps } from '../ui/summon/SummonedPage';
import { installFrameClock } from './summonHarness';
import type { FrameClock } from './summonHarness';
import { SUMMON_MS } from './summonHarness';

let clock: FrameClock;
let controller: SummonController;

const setMotion = (flags: { reducedMotion?: boolean; calmMode?: boolean }): void => {
  act(() => {
    appStore.setState((state) => ({ data: { ...state.data, prefs: { ...state.data.prefs, ...flags } } }));
  });
};

beforeEach(() => {
  clock = installFrameClock();
  controller = createSummonController();
});

afterEach(() => {
  cleanup();
  setMotion({ reducedMotion: false, calmMode: false });
  clock.restore();
});

type Props = Partial<SummonedPageProps>;

function page(props: Props = {}, content: string = 'one') {
  return (
    <SummonedPage pageKey="a" instant={false} quality="low" controller={controller} {...props}>
      <input aria-label="field" defaultValue="" data-content={content} />
      <button type="button">act</button>
    </SummonedPage>
  );
}

const live = (container: HTMLElement): HTMLElement =>
  container.querySelector('.summon-stage > .summon-page') as HTMLElement;
const copy = (container: HTMLElement): HTMLElement | null => container.querySelector('.summon-retiring > .summon-page');
const opacityOf = (node: HTMLElement | null): number => (node === null ? 0 : Number(node.style.opacity || 1));

describe('SummonedPage summon', () => {
  it('starts with pointer events off, the first field focused and a full summon', () => {
    const start = vi.spyOn(controller, 'start');
    const changes = vi.fn();
    const { container, getByLabelText } = render(page({ onLandedChange: changes }));
    expect(live(container).dataset.landed).toBe('false');
    expect(live(container).style.pointerEvents).toBe('none');
    expect(document.activeElement).toBe(getByLabelText('field'));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[1]).toBe('full');
    expect(start.mock.calls[0]?.[2]).toBe('summon');
    expect(changes).toHaveBeenLastCalledWith(false);
  });

  it('keeps typed characters and lands on its own: pointer events on, no inline pose left', () => {
    const changes = vi.fn();
    const { container, getByLabelText } = render(page({ onLandedChange: changes }));
    fireEvent.change(getByLabelText('field'), { target: { value: 'abc' } });
    expect((getByLabelText('field') as HTMLInputElement).value).toBe('abc');
    clock.advance(SUMMON_MS.afterIn('full'));
    const node = live(container);
    expect(node.dataset.landed).toBe('true');
    expect(node.style.pointerEvents).toBe('auto');
    expect(node.style.transform).toBe('');
    expect(node.style.opacity).toBe('');
    expect(changes).toHaveBeenLastCalledWith(true);
    expect(document.activeElement).toBe(getByLabelText('field'));
  });

  it('lands at once on a click and on the land() method, and stops the loop', () => {
    const { container } = render(page());
    fireEvent.click(document.body);
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.opacity).toBe('');
    expect(clock.pending()).toBe(0);
    cleanup();
    const ref = { current: null as SummonedPage | null };
    const second = render(
      <SummonedPage ref={(instance) => (ref.current = instance)} pageKey="a" instant={false} quality="low" controller={controller}>
        <input aria-label="f2" />
      </SummonedPage>,
    );
    act(() => ref.current?.land());
    expect(live(second.container).dataset.landed).toBe('true');
  });

  it('does not land from a click once it has landed (the listener is gone)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render(page());
    expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
    clock.advance(SUMMON_MS.afterIn('full'));
    expect(remove.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('cancels its animation on unmount and leaves no loop behind', () => {
    const { unmount } = render(page());
    unmount();
    expect(controller.isAnimating()).toBe(false);
    expect(clock.pending()).toBe(0);
  });
});

describe('SummonedPage instant', () => {
  it('never starts the controller, is landed from the first frame and leaves at once', () => {
    const start = vi.spyOn(controller, 'start');
    const changes = vi.fn();
    const dismissed = vi.fn();
    const { container, rerender } = render(page({ instant: true, onLandedChange: changes, onDismissed: dismissed }));
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.pointerEvents).toBe('auto');
    expect(live(container).getAttribute('style')).not.toMatch(/transform|opacity/);
    expect(changes).toHaveBeenCalledWith(true);
    rerender(page({ instant: true, open: false, onLandedChange: changes, onDismissed: dismissed }));
    expect(container.querySelector('.summon-stage')).toBeNull();
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(clock.requests()).toBe(0);
  });

  it('replaces a page in the same step on a key change', () => {
    const { container, rerender, queryAllByLabelText } = render(page({ instant: true }));
    rerender(page({ instant: true, pageKey: 'b' }, 'two'));
    expect(queryAllByLabelText('field')).toHaveLength(1);
    expect(copy(container)).toBeNull();
    expect(clock.requests()).toBe(0);
  });

  it('lands a page that was animating when motion becomes instant', () => {
    const { container, rerender } = render(page());
    rerender(page({ instant: true }));
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.opacity).toBe('');
    expect(controller.isAnimating()).toBe(false);
  });
});

describe('SummonedPage swap', () => {
  const swap = () => {
    const rendered = render(page({}, 'one'));
    clock.advance(SUMMON_MS.afterIn('full'));
    rendered.rerender(page({ pageKey: 'b' }, 'two'));
    return rendered;
  };

  it('keeps a frozen inert copy, summons the new page short and focuses its field', () => {
    const start = vi.spyOn(controller, 'start');
    const { container, getAllByLabelText } = swap();
    const old = copy(container);
    expect(old).not.toBeNull();
    expect(old?.hasAttribute('inert')).toBe(true);
    expect(old?.getAttribute('aria-hidden')).toBe('true');
    expect(old?.style.pointerEvents).toBe('none');
    expect(old?.querySelector('[data-content="one"]')).not.toBeNull();
    expect(live(container).querySelector('[data-content="two"]')).not.toBeNull();
    expect(live(container).dataset.landed).toBe('false');
    expect(document.activeElement).toBe(live(container).querySelector('input'));
    expect(getAllByLabelText('field')).toHaveLength(2);
    const kinds = start.mock.calls.map((call) => `${call[1]}:${call[2]}`);
    expect(kinds).toEqual(['full:summon', 'short:dismiss', 'short:summon']);
  });

  it('never shows two pages at once and ends on the final state', () => {
    const { container } = swap();
    for (let i = 0; i < 12; i++) {
      const outgoing = opacityOf(copy(container));
      const incoming = opacityOf(live(container));
      expect(outgoing > 0 && incoming > 0, `step ${i}`).toBe(false);
      clock.advance(SUMMON_MS.afterSwap('short') / 10);
    }
    expect(copy(container)).toBeNull();
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.opacity).toBe('');
  });

  it('lands the whole swap on an early click', () => {
    const { container } = swap();
    clock.advance(SUMMON_MS.duringOut('short', 0.3));
    fireEvent.click(document.body);
    expect(copy(container)).toBeNull();
    expect(live(container).dataset.landed).toBe('true');
    expect(live(container).style.transform).toBe('');
  });

  it('strips the ids from the frozen copy', () => {
    const rendered = render(
      <SummonedPage pageKey="a" instant={false} quality="low" controller={controller}>
        <input id="ritual-field" aria-label="field" />
      </SummonedPage>,
    );
    rendered.rerender(
      <SummonedPage pageKey="b" instant={false} quality="low" controller={controller}>
        <input id="ritual-field" aria-label="field" />
      </SummonedPage>,
    );
    expect(document.querySelectorAll('#ritual-field')).toHaveLength(1);
  });
});

describe('SummonedPage dismiss', () => {
  it('keeps the last content, is inert and aria-hidden at once, and reports the end once', () => {
    const dismissed = vi.fn();
    const start = vi.spyOn(controller, 'start');
    const { container, rerender } = render(page({ onDismissed: dismissed }));
    clock.advance(SUMMON_MS.afterIn('full'));
    rerender(page({ open: false, onDismissed: dismissed }, 'other'));
    const node = live(container);
    expect(node.hasAttribute('inert')).toBe(true);
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.style.pointerEvents).toBe('none');
    expect(node.querySelector('[data-content="one"]')).not.toBeNull();
    expect(start.mock.calls.at(-1)?.slice(1, 3)).toEqual(['full', 'dismiss']);
    clock.advance(SUMMON_MS.duringOut('full', 0.5));
    expect(dismissed).not.toHaveBeenCalled();
    expect(opacityOf(node)).toBeLessThan(1);
    clock.advance(SUMMON_MS.afterOut('full'));
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(node.style.opacity).toBe('0');
    expect(controller.isAnimating()).toBe(false);
  });
});

describe('SummonLayer', () => {
  it('renders one aria-hidden canvas without pointer events, hands it over and takes it back', () => {
    const fake = { attachLayer: vi.fn(), detachLayer: vi.fn() } as unknown as SummonController;
    const { container, unmount } = render(<SummonLayer controller={fake} />);
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(canvases[0]?.style.pointerEvents).toBe('none');
    expect(fake.attachLayer).toHaveBeenCalledWith(canvases[0]);
    unmount();
    expect(fake.detachLayer).toHaveBeenCalledTimes(1);
  });

  it.each([{ reducedMotion: true }, { calmMode: true }])('renders no canvas and attaches nothing for %o', (flags) => {
    setMotion(flags);
    const fake = { attachLayer: vi.fn(), detachLayer: vi.fn() } as unknown as SummonController;
    const { container } = render(<SummonLayer controller={fake} />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(fake.attachLayer).not.toHaveBeenCalled();
  });

  it('detaches when motion becomes instant', () => {
    const fake = { attachLayer: vi.fn(), detachLayer: vi.fn() } as unknown as SummonController;
    const { container } = render(<SummonLayer controller={fake} />);
    setMotion({ calmMode: true });
    expect(container.querySelector('canvas')).toBeNull();
    expect(fake.detachLayer).toHaveBeenCalledTimes(1);
  });
});

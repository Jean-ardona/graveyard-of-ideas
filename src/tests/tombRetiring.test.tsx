import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createBookAssets } from '../book/bookAssets';
import { getBookHandle } from '../book/bookHandles';
import { getColliders } from '../interaction/colliderRegistry';
import { createTombAssets } from '../world/tombAssets';
import { getTombHandle } from '../world/tombHandles';
import Tomb from '../world/Tomb';
import type { TombDescriptor } from '../world/tombLogic';

const DESCRIPTOR: TombDescriptor = {
  id: 'held-1',
  slot: 2,
  shape: 'rectangular',
  title: 'Moss Radio',
  x: 3,
  z: -4,
  rotation: 0.3,
  lean: 0,
  label: 'Open Moss Radio',
};

beforeEach(() => {
  // The tomb is drawn with react-three-fiber tags; react-dom only warns about them and the effects still run.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a tomb kept for the resurrection', () => {
  it('keeps its collider and book while retiring, then removes collider, book and handle at unmount', () => {
    const tomb = createTombAssets();
    const books = createBookAssets();
    const fixed = getColliders().length;

    const view = render(<Tomb descriptor={DESCRIPTOR} assets={tomb} bookAssets={books} retiring={false} />);
    expect(getColliders()).toHaveLength(fixed + 1);
    expect(getBookHandle(DESCRIPTOR.id)).toBeDefined();

    view.rerender(<Tomb descriptor={DESCRIPTOR} assets={tomb} bookAssets={books} retiring />);
    expect(getColliders()).toHaveLength(fixed + 1);
    expect(getBookHandle(DESCRIPTOR.id)).toBeDefined();
    expect(getTombHandle(DESCRIPTOR.id)).toBeDefined();

    view.unmount();
    expect(getColliders()).toHaveLength(fixed);
    expect(getBookHandle(DESCRIPTOR.id)).toBeUndefined();
    expect(getTombHandle(DESCRIPTOR.id)).toBeUndefined();
    tomb.dispose();
    books.dispose();
  });
});

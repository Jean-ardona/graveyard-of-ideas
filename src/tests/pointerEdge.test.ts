import { describe, expect, it } from 'vitest';
import { pointerEdge } from '../interaction/pointerLock';
import type { PointerMode } from '../interaction/pointerLock';

const MODES: PointerMode[] = ['idle', 'locked', 'lost', 'released', 'fallback'];

describe('pointerEdge', () => {
  it.each<[PointerMode, PointerMode, 'freed' | 'taken' | null]>([
    ['locked', 'released', 'freed'],
    ['idle', 'released', 'freed'],
    ['lost', 'released', 'freed'],
    ['released', 'locked', 'taken'],
    ['released', 'lost', 'taken'],
    ['released', 'idle', 'taken'],
    ['released', 'fallback', 'taken'],
    ['locked', 'lost', null],
    ['lost', 'locked', null],
    ['idle', 'locked', null],
    ['idle', 'fallback', null],
  ])('%s to %s is %s', (prev, next, edge) => {
    expect(pointerEdge(prev, next)).toBe(edge);
  });

  it('reports no edge when the mode does not change', () => {
    for (const mode of MODES) expect(pointerEdge(mode, mode)).toBeNull();
  });
});

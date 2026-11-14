import { describe, expect, it } from 'vitest';
import {
  COS_VIEW_HALF_ANGLE,
  allowsInteraction,
  cosAngleTo,
  distanceSq,
  selectFocus,
  type Interactable,
} from '../interaction/interactables';

const ORIGIN = { x: 0, y: 0, z: 0 };
const AHEAD = { x: 0, y: 0, z: -1 };

function item(id: string, x: number, y: number, z: number, extra: Partial<Interactable> = {}) {
  return { id, position: { x, y, z }, radius: 3, label: id, action: id, enabled: true, ...extra };
}

describe('distance and angle', () => {
  it('computes squared distance', () => {
    expect(distanceSq(ORIGIN, { x: 1, y: 2, z: 2 })).toBe(9);
  });

  it('computes the cosine of the angle to a target', () => {
    expect(cosAngleTo(ORIGIN, AHEAD, { x: 0, y: 0, z: -5 })).toBeCloseTo(1);
    expect(cosAngleTo(ORIGIN, AHEAD, { x: 5, y: 0, z: 0 })).toBeCloseTo(0);
    expect(cosAngleTo(ORIGIN, AHEAD, { x: 0, y: 0, z: 5 })).toBeCloseTo(-1);
    expect(cosAngleTo(ORIGIN, AHEAD, ORIGIN)).toBe(1);
  });
});

describe('selectFocus', () => {
  it('returns null with nothing registered', () => {
    expect(selectFocus([], ORIGIN, AHEAD)).toBeNull();
  });

  it('ignores disabled interactables', () => {
    expect(selectFocus([item('a', 0, 0, -1, { enabled: false })], ORIGIN, AHEAD)).toBeNull();
  });

  it('ignores interactables beyond their radius', () => {
    expect(selectFocus([item('a', 0, 0, -3.1)], ORIGIN, AHEAD)).toBeNull();
    expect(selectFocus([item('a', 0, 0, -3)], ORIGIN, AHEAD)?.id).toBe('a');
  });

  it('keeps only targets inside the 35 degree cone', () => {
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const at = (deg: number) => item('a', Math.sin(rad(deg)) * 2, 0, -Math.cos(rad(deg)) * 2);
    expect(selectFocus([at(30)], ORIGIN, AHEAD)?.id).toBe('a');
    expect(selectFocus([at(40)], ORIGIN, AHEAD)).toBeNull();
    expect(selectFocus([item('b', 0, 0, 2)], ORIGIN, AHEAD)).toBeNull();
    expect(COS_VIEW_HALF_ANGLE).toBeCloseTo(Math.cos(rad(35)));
  });

  it('prefers the nearest candidate', () => {
    const items = [item('far', 0, 0, -2.5), item('near', 0, 0, -1)];
    expect(selectFocus(items, ORIGIN, AHEAD)?.id).toBe('near');
  });

  it('breaks distance ties by smaller angle, then by id', () => {
    const offAxis = item('a', 1, 0, -1);
    const onAxis = item('b', 0, 0, -Math.SQRT2);
    expect(selectFocus([offAxis, onAxis], ORIGIN, AHEAD)?.id).toBe('b');
    expect(selectFocus([onAxis, offAxis], ORIGIN, AHEAD)?.id).toBe('b');
    const twinB = item('b', 0, 0, -1);
    const twinA = item('a', 0, 0, -1);
    expect(selectFocus([twinB, twinA], ORIGIN, AHEAD)?.id).toBe('a');
    expect(selectFocus([twinA, twinB], ORIGIN, AHEAD)?.id).toBe('a');
  });

  it('skips a nearer target outside the cone for a farther one inside it', () => {
    const items = [item('side', 1.5, 0, 0), item('front', 0, 0, -2)];
    expect(selectFocus(items, ORIGIN, AHEAD)?.id).toBe('front');
  });
});

describe('allowsInteraction', () => {
  it('is true only while looking is active', () => {
    expect(allowsInteraction('locked')).toBe(true);
    expect(allowsInteraction('fallback')).toBe(true);
    for (const mode of ['idle', 'lost', 'released'] as const) {
      expect(allowsInteraction(mode)).toBe(false);
    }
  });
});

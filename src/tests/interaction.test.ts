import { afterEach, describe, expect, it } from 'vitest';
import { closeBook, getReadingProjectId, openBook } from '../book/readingBook';
import { readingMachine } from '../book/readingMachine';
import { canWalk, isLooking } from '../interaction/inputLock';
import { appStore } from '../store/appStore';
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

describe('selectFocus with tombs', () => {
  // Tombs at x = +-2 face -z, toward the player at the origin side of z = -1.
  const tomb = (id: string, x: number, facingZ: number) =>
    item(id, x, 0, -1, { tomb: { x, z: -2, facing: { x: 0, z: facingZ } } });

  it('never picks a tomb the player stands behind', () => {
    expect(selectFocus([tomb('behind', 0, -1)], ORIGIN, AHEAD)).toBeNull();
  });

  it('still picks a tomb the player is in front of, when another is behind', () => {
    const items = [tomb('behind', 0, -1), tomb('front', 0.2, 1)];
    expect(selectFocus(items, ORIGIN, AHEAD)?.id).toBe('front');
    expect(selectFocus([...items].reverse(), ORIGIN, AHEAD)?.id).toBe('front');
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

describe('opening and closing a book through readingBook', () => {
  const id = (() => {
    const result = appStore.getState().buryNewProject({ title: 'Lantern', description: 'A lantern that learns' });
    if (!result.ok) throw new Error(result.error);
    return result.project.id;
  })();

  function setReducedMotion(reducedMotion: boolean): void {
    const { data } = appStore.getState();
    appStore.setState({ data: { ...data, prefs: { ...data.prefs, reducedMotion } } });
  }

  function tickUntil(done: () => boolean): void {
    for (let i = 0; i < 100 && !done(); i++) readingMachine.tick(0.05);
  }

  afterEach(() => {
    setReducedMotion(false);
    closeBook();
    readingMachine.skip();
  });

  it('toggles inputLocked exactly with the machine, and keeps only the project id', () => {
    expect(readingMachine.inputLocked()).toBe(false);
    openBook(id, true);
    expect(readingMachine.phase()).toBe('lifting');
    expect(readingMachine.inputLocked()).toBe(true);
    expect(getReadingProjectId()).toBe(id);

    tickUntil(() => readingMachine.phase() === 'open');
    expect(readingMachine.inputLocked()).toBe(true);
    expect(readingMachine.pointerLockReleased()).toBe(true);

    closeBook();
    expect(readingMachine.phase()).toBe('closing');
    expect(readingMachine.inputLocked()).toBe(true);
    tickUntil(() => readingMachine.phase() === 'closed');
    expect(readingMachine.inputLocked()).toBe(false);
    expect(getReadingProjectId()).toBeNull();
  });

  it('ignores a second open while a sequence runs, and unknown projects', () => {
    openBook('missing', true);
    expect(readingMachine.phase()).toBe('closed');
    expect(getReadingProjectId()).toBeNull();
    openBook(id, true);
    readingMachine.tick(0.3);
    const t = readingMachine.sequence.t;
    openBook(id, true);
    expect(readingMachine.sequence.t).toBe(t);
  });

  it('reaches open and closed at once with reduced motion', () => {
    setReducedMotion(true);
    openBook(id, true);
    expect(readingMachine.phase()).toBe('open');
    closeBook();
    expect(readingMachine.phase()).toBe('closed');
    expect(getReadingProjectId()).toBeNull();
  });
});

describe('input lock', () => {
  it('stops walking while locked or disabled, whatever the pointer mode', () => {
    expect(canWalk(true, false, 'locked')).toBe(true);
    expect(canWalk(true, true, 'locked')).toBe(false);
    expect(canWalk(false, false, 'locked')).toBe(false);
    expect(canWalk(true, false, 'released')).toBe(false);
  });

  it('turns the view only when unlocked, with look-drag off in the fallback', () => {
    expect(isLooking('locked', false, false)).toBe(true);
    expect(isLooking('fallback', true, false)).toBe(true);
    expect(isLooking('fallback', false, false)).toBe(false);
    expect(isLooking('locked', false, true)).toBe(false);
    expect(isLooking('fallback', true, true)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveCollisions } from '../interaction/collision';
import { MAX_LOOK_DELTA, MAX_PITCH, applyLook } from '../interaction/playerLook';
import {
  MAX_DELTA,
  SPRINT_SPEED,
  WALK_SPEED,
  keysToAxes,
  stepPlayer,
} from '../interaction/playerMovement';
import {
  allowsMovement,
  modeAfterLockChange,
  modeAfterLockFailure,
  modeOnResume,
  modeOnSuspend,
} from '../interaction/pointerLock';
import {
  DEFAULT_LOOK_SENSITIVITY,
  LOOK_SENSITIVITY_KEY,
  MAX_LOOK_SENSITIVITY,
  MIN_LOOK_SENSITIVITY,
  loadLookSensitivity,
  parseLookSensitivity,
  saveLookSensitivity,
} from '../store/lookSensitivity';
import type { StorageLike } from '../store/persistence';
import {
  COLLIDERS,
  GATE_POSITION,
  GRAVE_SLOTS,
  HUT_POSITION,
  PLAYER_BOUNDS,
  PLAYER_RADIUS,
  PLAYER_START,
  type BoxCollider,
} from '../world/config';

const NO_COLLIDERS: readonly BoxCollider[] = [];
const FORWARD = { forward: 1, strafe: 0 };

function step(
  position: { x: number; z: number },
  axes = FORWARD,
  yaw = 0,
  fast = false,
  delta = 0.1,
  colliders: readonly BoxCollider[] = COLLIDERS,
) {
  return stepPlayer(position, axes, yaw, fast, delta, PLAYER_RADIUS, colliders, PLAYER_BOUNDS);
}

describe('keysToAxes', () => {
  it('maps ZQSD, WASD and arrows to the same axes', () => {
    expect(keysToAxes(new Set(['z']))).toEqual({ forward: 1, strafe: 0 });
    expect(keysToAxes(new Set(['w']))).toEqual({ forward: 1, strafe: 0 });
    expect(keysToAxes(new Set(['arrowup']))).toEqual({ forward: 1, strafe: 0 });
    expect(keysToAxes(new Set(['q']))).toEqual({ forward: 0, strafe: -1 });
    expect(keysToAxes(new Set(['a']))).toEqual({ forward: 0, strafe: -1 });
    expect(keysToAxes(new Set(['d']))).toEqual({ forward: 0, strafe: 1 });
    expect(keysToAxes(new Set(['arrowdown']))).toEqual({ forward: -1, strafe: 0 });
  });

  it('cancels opposite keys', () => {
    expect(keysToAxes(new Set(['w', 's']))).toEqual({ forward: 0, strafe: 0 });
  });
});

describe('stepPlayer', () => {
  const open = { x: 0, z: 0 };

  it('moves forward at walk speed, toward -z at yaw 0', () => {
    const next = step(open, FORWARD, 0, false, 0.1, NO_COLLIDERS);
    expect(next.z).toBeCloseTo(-WALK_SPEED * 0.1);
    expect(next.x).toBeCloseTo(0);
  });

  it('uses 2.0 units/s to walk and 3.2 units/s to sprint', () => {
    expect(WALK_SPEED).toBe(2.0);
    expect(SPRINT_SPEED).toBe(3.2);
    expect(step(open, FORWARD, 0, false, 0.1, NO_COLLIDERS).z).toBeCloseTo(-0.2);
    expect(step(open, FORWARD, 0, true, 0.1, NO_COLLIDERS).z).toBeCloseTo(-0.32);
  });

  it('does not move faster diagonally', () => {
    const next = step(open, { forward: 1, strafe: 1 }, 0, false, 0.1, NO_COLLIDERS);
    expect(Math.hypot(next.x, next.z)).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it('covers the same distance per second at different frame rates', () => {
    let a = open;
    for (let i = 0; i < 10; i++) a = step(a, FORWARD, 0, false, 0.01, NO_COLLIDERS);
    let b = open;
    for (let i = 0; i < 5; i++) b = step(b, FORWARD, 0, false, 0.02, NO_COLLIDERS);
    expect(a.z).toBeCloseTo(b.z);
  });

  it('clamps a huge delta after a tab switch', () => {
    const next = step(open, FORWARD, 0, false, 30, NO_COLLIDERS);
    expect(-next.z).toBeCloseTo(WALK_SPEED * MAX_DELTA);
  });

  it('turns the movement direction with yaw', () => {
    const next = step(open, FORWARD, Math.PI / 2, false, 0.1, NO_COLLIDERS);
    expect(next.x).toBeCloseTo(-WALK_SPEED * 0.1);
    expect(next.z).toBeCloseTo(0);
  });
});

describe('collisions', () => {
  it('stays inside the player bounds', () => {
    const edge = { x: PLAYER_BOUNDS.maxX, z: 0 };
    const next = step(edge, { forward: 0, strafe: 1 }, 0, true, 0.1, NO_COLLIDERS);
    expect(next.x).toBe(PLAYER_BOUNDS.maxX);
  });

  it('starts inside the bounds and free of obstacles', () => {
    const start = { x: PLAYER_START.x, z: PLAYER_START.z };
    expect(resolveCollisions(start, PLAYER_RADIUS, COLLIDERS, PLAYER_BOUNDS)).toEqual(start);
  });

  it('lets the player walk through the gate opening', () => {
    let position = { x: 0, z: GATE_POSITION.z + 3 };
    for (let i = 0; i < 40; i++) position = step(position);
    expect(position.z).toBeLessThan(GATE_POSITION.z - 1);
  });

  it('blocks the gate pillars', () => {
    const pillar = { x: 4.5, z: GATE_POSITION.z + 3 };
    let position = pillar;
    for (let i = 0; i < 40; i++) position = step(position);
    expect(position.z).toBeGreaterThan(GATE_POSITION.z);
  });

  it('blocks the hut', () => {
    let position = { x: 0, z: HUT_POSITION.z + 8 };
    for (let i = 0; i < 80; i++) position = step(position);
    expect(position.z).toBeGreaterThanOrEqual(HUT_POSITION.z + 2 + PLAYER_RADIUS - 1e-6);
  });

  it('blocks every tomb footprint', () => {
    for (const slot of GRAVE_SLOTS) {
      const pushed = resolveCollisions(
        { x: slot.x, z: slot.z },
        PLAYER_RADIUS,
        COLLIDERS,
        PLAYER_BOUNDS,
      );
      expect(Math.hypot(pushed.x - slot.x, pushed.z - slot.z)).toBeGreaterThan(0.8);
    }
  });

  it('slides along a wall instead of stopping', () => {
    const wall: BoxCollider = { x: 0, z: 0, halfWidth: 5, halfDepth: 0.5, rotation: 0 };
    // Approaching the wall at an angle: z is blocked, x keeps moving.
    const start = { x: 0, z: 0.5 + PLAYER_RADIUS };
    const next = step(start, { forward: 1, strafe: 1 }, 0, false, 0.1, [wall]);
    expect(next.x).toBeGreaterThan(start.x + 0.1);
    expect(next.z).toBeGreaterThanOrEqual(0.5 + PLAYER_RADIUS - 1e-6);
  });
});

describe('applyLook', () => {
  const still = { yaw: 0, pitch: 0 };
  const S = DEFAULT_LOOK_SENSITIVITY;

  it('scales pixels by the sensitivity', () => {
    const look = applyLook(still, 100, 50, S);
    expect(look.yaw).toBeCloseTo(-100 * S);
    expect(look.pitch).toBeCloseTo(-50 * S);
    expect(applyLook(still, 10, 0, 0.01).yaw).toBeCloseTo(-0.1);
  });

  it('turns right when the mouse moves right and up when it moves up', () => {
    expect(applyLook(still, 10, 0, S).yaw).toBeLessThan(0);
    expect(applyLook(still, -10, 0, S).yaw).toBeGreaterThan(0);
    expect(applyLook(still, 0, -10, S).pitch).toBeGreaterThan(0);
    expect(applyLook(still, 0, 10, S).pitch).toBeLessThan(0);
  });

  it('does nothing for a zero delta', () => {
    const look = { yaw: 0.7, pitch: -0.3 };
    expect(applyLook(look, 0, 0, S)).toEqual(look);
  });

  it('clamps pitch at 75 degrees both ways', () => {
    expect(MAX_PITCH).toBeCloseTo((75 * Math.PI) / 180);
    let look = still;
    for (let i = 0; i < 100; i++) look = applyLook(look, 0, -MAX_LOOK_DELTA, S);
    expect(look.pitch).toBeCloseTo(MAX_PITCH);
    for (let i = 0; i < 200; i++) look = applyLook(look, 0, MAX_LOOK_DELTA, S);
    expect(look.pitch).toBeCloseTo(-MAX_PITCH);
  });

  it('accepts exactly 200 px and ignores anything larger, per axis', () => {
    expect(applyLook(still, 200, 0, S).yaw).toBeCloseTo(-200 * S);
    expect(applyLook(still, 0, 200, S).pitch).toBeCloseTo(-200 * S);
    expect(applyLook(still, 201, 0, S).yaw).toBe(0);
    expect(applyLook(still, -201, 0, S).yaw).toBe(0);
    expect(applyLook(still, 0, 201, S).pitch).toBe(0);
    expect(applyLook(still, 0, -5000, S).pitch).toBe(0);
  });

  it('filters one axis without affecting the other', () => {
    const look = applyLook(still, 5000, 10, S);
    expect(look.yaw).toBe(0);
    expect(look.pitch).toBeCloseTo(-10 * S);
  });

  it('has no smoothing: the result depends only on the current delta', () => {
    const a = applyLook({ yaw: 1, pitch: 0.2 }, 30, 20, S);
    const b = applyLook({ yaw: 1, pitch: 0.2 }, 30, 20, S);
    expect(a).toEqual(b);
    expect(a.yaw).toBeCloseTo(1 - 30 * S, 12);
    expect(a.pitch).toBeCloseTo(0.2 - 20 * S, 12);
  });
});

describe('look sensitivity storage', () => {
  function memoryStorage(initial: Record<string, string> = {}): StorageLike {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    };
  }

  it('defaults to 0.0022 rad/pixel', () => {
    expect(DEFAULT_LOOK_SENSITIVITY).toBe(0.0022);
    expect(parseLookSensitivity(null)).toBe(0.0022);
  });

  it('accepts valid stored values and rejects invalid ones', () => {
    expect(parseLookSensitivity('0.004')).toBe(0.004);
    for (const bad of ['', ' ', 'abc', 'NaN', 'Infinity', '0', '-0.002', '5']) {
      expect(parseLookSensitivity(bad)).toBe(DEFAULT_LOOK_SENSITIVITY);
    }
    expect(parseLookSensitivity(String(MIN_LOOK_SENSITIVITY))).toBe(MIN_LOOK_SENSITIVITY);
    expect(parseLookSensitivity(String(MAX_LOOK_SENSITIVITY))).toBe(MAX_LOOK_SENSITIVITY);
  });

  it('saves and loads a round trip, refusing invalid values', () => {
    const storage = memoryStorage();
    expect(saveLookSensitivity(storage, 0.003)).toBe(true);
    expect(loadLookSensitivity(storage)).toBe(0.003);
    expect(saveLookSensitivity(storage, -1)).toBe(false);
    expect(loadLookSensitivity(storage)).toBe(0.003);
  });

  it('never throws when storage is missing or broken', () => {
    expect(loadLookSensitivity(null)).toBe(DEFAULT_LOOK_SENSITIVITY);
    expect(saveLookSensitivity(null, 0.003)).toBe(false);
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    expect(loadLookSensitivity(broken)).toBe(DEFAULT_LOOK_SENSITIVITY);
    expect(saveLookSensitivity(broken, 0.003)).toBe(false);
    expect(loadLookSensitivity(memoryStorage({ [LOOK_SENSITIVITY_KEY]: 'junk' }))).toBe(
      DEFAULT_LOOK_SENSITIVITY,
    );
  });
});

describe('pointer modes', () => {
  it('allows walking except after the lock is lost or released', () => {
    expect(allowsMovement('idle')).toBe(true);
    expect(allowsMovement('locked')).toBe(true);
    expect(allowsMovement('fallback')).toBe(true);
    expect(allowsMovement('lost')).toBe(false);
    expect(allowsMovement('released')).toBe(false);
  });

  it('treats a lock that disappears as lost, but a deliberate release as released', () => {
    expect(modeAfterLockChange('idle', true)).toBe('locked');
    expect(modeAfterLockChange('lost', true)).toBe('locked');
    expect(modeAfterLockChange('released', true)).toBe('locked');
    expect(modeAfterLockChange('locked', false)).toBe('lost');
    expect(modeAfterLockChange('released', false)).toBe('released');
  });

  it('falls back to click and drag when the first lock request fails', () => {
    expect(modeAfterLockFailure('idle', false)).toBe('fallback');
    expect(modeAfterLockFailure('lost', true)).toBe('lost');
  });

  it('shows no resume overlay when suspended, and asks for a click on resume', () => {
    expect(modeOnSuspend('locked')).toBe('released');
    expect(modeOnSuspend('lost')).toBe('released');
    expect(modeOnSuspend('idle')).toBe('idle');
    expect(modeOnSuspend('fallback')).toBe('fallback');
    expect(modeOnResume('released')).toBe('lost');
    expect(modeOnResume('idle')).toBe('idle');
  });
});

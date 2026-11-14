import { describe, expect, it } from 'vitest';
import { resolveCollisions } from '../interaction/collision';
import {
  DEAD_ZONE,
  MAX_PITCH,
  MAX_YAW_RATE,
  applyLockedLook,
  stepFreeLook,
} from '../interaction/playerLook';
import {
  FAST_SPEED_FACTOR,
  MAX_DELTA,
  WALK_SPEED,
  keysToAxes,
  stepPlayer,
} from '../interaction/playerMovement';
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

  it('walks faster with shift', () => {
    const next = step(open, FORWARD, 0, true, 0.1, NO_COLLIDERS);
    expect(next.z).toBeCloseTo(-WALK_SPEED * FAST_SPEED_FACTOR * 0.1);
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

describe('look', () => {
  const still = { yaw: 0, pitch: 0 };

  it('ignores the cursor inside the dead zone', () => {
    expect(stepFreeLook(still, DEAD_ZONE * 0.9, 0, 0.1).yaw).toBe(0);
  });

  it('turns right when the cursor is on the right', () => {
    expect(stepFreeLook(still, 1, 0, 0.1).yaw).toBeCloseTo(-MAX_YAW_RATE * 0.1);
  });

  it('turns left when the cursor is on the left', () => {
    expect(stepFreeLook(still, -1, 0, 0.1).yaw).toBeGreaterThan(0);
  });

  it('never tilts beyond 30 degrees', () => {
    let look = still;
    for (let i = 0; i < 200; i++) look = stepFreeLook(look, 0, -5, 0.05);
    expect(look.pitch).toBeLessThanOrEqual(MAX_PITCH + 1e-9);
    expect(look.pitch).toBeCloseTo(MAX_PITCH);
    look = applyLockedLook(look, 0, -100000);
    expect(look.pitch).toBeCloseTo(MAX_PITCH);
    look = applyLockedLook(look, 0, 100000);
    expect(look.pitch).toBeCloseTo(-MAX_PITCH);
  });
});

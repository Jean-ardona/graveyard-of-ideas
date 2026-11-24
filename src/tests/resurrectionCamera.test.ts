/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_POSE_PITCH, createCameraPose, finiteOr, wrapPi } from '../cinematics/cameraPose';
import type { CameraPose } from '../cinematics/cameraPose';
import { FOLLOW_IN_SECONDS, FRAME_CONE, MAX_CAMERA_RATE } from '../cinematics/cameraTimings';
import { followWeight, writeResurrectionCamera } from '../cinematics/resurrectionCamera';
import type { TombFrame } from '../cinematics/resurrectionCamera';
import {
  createResurrectionEffects,
  createResurrectionProgress,
  createResurrectionState,
  finishResurrection,
  tickResurrection,
} from '../cinematics/resurrectionTimeline';
import { createSpecterBuffers, createSpecterSeeds, specterCenter, writeSpecter } from '../cinematics/specterParticles';
import { GROUP_B_TOTAL, SPECTER_BUDGET, SPECTER_TOTAL } from '../cinematics/specterTimings';
import { isInFrontOfTomb } from '../interaction/tombFront';

const SOURCE = Object.values(
  import.meta.glob<string>('../cinematics/resurrectionCamera.ts', { query: '?raw', import: 'default', eager: true }),
)[0] ?? '';

const FIELDS = ['x', 'y', 'z', 'yaw', 'pitch'] as const;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sameBits(a: CameraPose, b: CameraPose): boolean {
  return FIELDS.every((field) => Object.is(a[field], b[field]));
}

/** Closest the player can stand to a tomb center: the plinth reaches 1.21 m, plus the player radius. */
const MIN_PLAYER_DISTANCE = 1.5;
/** The front cone of the tomb, a little inside `FRONT_MIN_DOT` (about 69.5 degrees). */
const MAX_FRONT_ANGLE = (69 * Math.PI) / 180;
const EYE_HEIGHT = 1.7;

const anyNumber = fc.double({ noNaN: false });

/** A tomb frame the world can produce. */
const validTomb = fc.record({
  x: fc.double({ min: -25, max: 25, noNaN: true }),
  z: fc.double({ min: -25, max: 25, noNaN: true }),
  groundY: fc.double({ min: -2, max: 2, noNaN: true }),
  heading: fc.double({ min: -2 * Math.PI, max: 2 * Math.PI, noNaN: true }),
});

/** A tomb and a player standing in front of it, at least `MIN_PLAYER_DISTANCE` away, with any yaw. */
const scene = validTomb.chain((tomb) =>
  fc
    .record({
      distance: fc.double({ min: MIN_PLAYER_DISTANCE, max: 6, noNaN: true }),
      angle: fc.double({ min: -MAX_FRONT_ANGLE, max: MAX_FRONT_ANGLE, noNaN: true }),
      eyeOffset: fc.double({ min: -0.5, max: 0.5, noNaN: true }),
      yaw: fc.double({ min: -4 * Math.PI, max: 4 * Math.PI, noNaN: true }),
      pitch: fc.double({ min: -MAX_POSE_PITCH, max: MAX_POSE_PITCH, noNaN: true }),
    })
    .map(({ distance, angle, eyeOffset, yaw, pitch }) => {
      const player: CameraPose = {
        x: tomb.x + distance * Math.sin(tomb.heading + angle),
        y: tomb.groundY + EYE_HEIGHT + eyeOffset,
        z: tomb.z + distance * Math.cos(tomb.heading + angle),
        yaw,
        pitch,
      };
      return { tomb: tomb as TombFrame, player };
    }),
);

function expectInFront({ tomb, player }: { tomb: TombFrame; player: CameraPose }): void {
  const facing = { x: Math.sin(tomb.heading), z: Math.cos(tomb.heading) };
  expect(isInFrontOfTomb(tomb, facing, player)).toBe(true);
}

/** Group B time, including NaN, the infinities, negative values and values far beyond the end. */
const anyTime = fc.oneof(
  anyNumber,
  fc.double({ min: -2, max: GROUP_B_TOTAL + 2, noNaN: true }),
  fc.constantFrom(0, FOLLOW_IN_SECONDS, SPECTER_TOTAL, GROUP_B_TOTAL, 1e9, -1e9),
);

describe('resurrection camera is pure', () => {
  it('imports no React, Three.js, DOM, store or timers and never calls Math.random', () => {
    expect(SOURCE).not.toBe('');
    const code = withoutComments(SOURCE);
    expect(code).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
    expect(code).not.toMatch(/from\s+['"][^'"]*\/(store|interaction|world|book|ui)[^'"]*['"]/);
    expect(code).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
    expect(code).not.toMatch(/Math\.random/);
  });

  it('allocates nothing in writeResurrectionCamera or followWeight', () => {
    const code = withoutComments(SOURCE);
    for (const name of ['writeResurrectionCamera', 'followWeight']) {
      const body = new RegExp(`export function ${name}\\([\\s\\S]*?\\): \\w+ \\{([\\s\\S]*?)\\r?\\n\\}`).exec(code)?.[1] ?? '';
      expect(body, name).not.toBe('');
      expect(body, name).not.toMatch(/\bnew\b|=>|\[|\{\s*\w+\s*:/);
    }
  });

  it('has a follow weight of 0 at the ends, 1 on stage, and in [0, 1] everywhere', () => {
    expect(followWeight(0)).toBe(0);
    expect(followWeight(Number.NaN)).toBe(0);
    expect(followWeight(-Infinity)).toBe(0);
    expect(followWeight(Infinity)).toBe(0);
    expect(followWeight(GROUP_B_TOTAL)).toBe(0);
    expect(followWeight(FOLLOW_IN_SECONDS)).toBe(1);
    expect(followWeight(SPECTER_TOTAL)).toBe(1);
    fc.assert(
      fc.property(anyTime, (u) => {
        const w = followWeight(u);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('resurrection camera properties', () => {
  it('Feature: graveyard-core, Property 86: The resurrection camera pose is finite for any input', () => {
    const hostilePose = fc.record({ x: anyNumber, y: anyNumber, z: anyNumber, yaw: anyNumber, pitch: anyNumber });
    const hostileTomb = fc.record({ x: anyNumber, z: anyNumber, groundY: anyNumber, heading: anyNumber });
    fc.assert(
      fc.property(anyTime, fc.oneof(hostilePose, scene.map((s) => s.player)), hostileTomb, (u, player, tomb) => {
        const out = createCameraPose();
        expect(writeResurrectionCamera(u, player, tomb, out)).toBe(out);
        for (const field of FIELDS) expect(Number.isFinite(out[field]), field).toBe(true);
        expect(Math.abs(out.pitch)).toBeLessThanOrEqual(MAX_POSE_PITCH);
        expect(Object.is(out.x, finiteOr(player.x, 0))).toBe(true);
        expect(Object.is(out.y, finiteOr(player.y, 0))).toBe(true);
        expect(Object.is(out.z, finiteOr(player.z, 0))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('Feature: graveyard-core, Property 87: The resurrection camera has no jump and returns to the player pose', () => {
    fc.assert(
      fc.property(
        scene,
        fc.double({ min: -0.5, max: GROUP_B_TOTAL + 0.5, noNaN: true }),
        fc.double({ min: 1e-6, max: 0.1, noNaN: true }),
        fc.oneof(fc.double({ max: 0, noNaN: true }), fc.double({ min: GROUP_B_TOTAL, noNaN: true })),
        (s, u, du, outside) => {
          expectInFront(s);
          const a = writeResurrectionCamera(u, s.player, s.tomb, createCameraPose());
          const b = writeResurrectionCamera(u + du, s.player, s.tomb, createCameraPose());
          const limit = MAX_CAMERA_RATE * du + 1e-9;
          expect(Math.abs(wrapPi(b.yaw - a.yaw))).toBeLessThanOrEqual(limit);
          expect(Math.abs(b.pitch - a.pitch)).toBeLessThanOrEqual(limit);
          expect(b.x).toBe(a.x);
          expect(b.y).toBe(a.y);
          expect(b.z).toBe(a.z);
          // Outside group B the pose is the captured player pose, bit for bit.
          expect(sameBits(writeResurrectionCamera(outside, s.player, s.tomb, createCameraPose()), s.player)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Feature: graveyard-core, Property 87: a run to the end and a skip to the end give the same final pose', () => {
    fc.assert(
      fc.property(scene, fc.array(fc.double({ min: 0.01, max: 0.2, noNaN: true }), { minLength: 1, maxLength: 40 }), (s, pattern) => {
        const state = createResurrectionState();
        const progress = createResurrectionProgress();
        const effects = createResurrectionEffects();
        for (let i = 0; i < 2000 && !effects.done; i++) tickResurrection(state, progress, effects, pattern[i % pattern.length]!, false);
        expect(effects.done).toBe(true);
        const ran = writeResurrectionCamera(progress.groupBTime, s.player, s.tomb, createCameraPose());

        const skipState = createResurrectionState();
        const skipProgress = createResurrectionProgress();
        const skipEffects = createResurrectionEffects();
        finishResurrection(skipState, skipProgress, skipEffects);
        const skipped = writeResurrectionCamera(skipProgress.groupBTime, s.player, s.tomb, createCameraPose());
        expect(sameBits(ran, skipped)).toBe(true);
        expect(sameBits(skipped, s.player)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: graveyard-core, Property 88: The specter stays framed while it is on stage', () => {
    const seeds = createSpecterSeeds(SPECTER_BUDGET.low);
    const buffers = createSpecterBuffers(SPECTER_BUDGET.low);
    const center = { x: 0, y: 0, z: 0 };
    fc.assert(
      fc.property(scene, fc.double({ min: FOLLOW_IN_SECONDS, max: SPECTER_TOTAL, noNaN: true }), (s, u) => {
        expectInFront(s);
        fc.pre(writeSpecter(seeds, Math.min(u, SPECTER_TOTAL), s.tomb.heading, buffers) > 0);
        const pose = writeResurrectionCamera(u, s.player, s.tomb, createCameraPose());
        specterCenter(u, s.tomb.heading, center);
        const dx = s.tomb.x + center.x - pose.x;
        const dy = s.tomb.groundY + center.y - pose.y;
        const dz = s.tomb.z + center.z - pose.z;
        const length = Math.hypot(dx, dy, dz);
        const fx = -Math.sin(pose.yaw) * Math.cos(pose.pitch);
        const fy = Math.sin(pose.pitch);
        const fz = -Math.cos(pose.yaw) * Math.cos(pose.pitch);
        const cosine = Math.min(1, Math.max(-1, (fx * dx + fy * dy + fz * dz) / length));
        expect(Math.acos(cosine)).toBeLessThanOrEqual(FRAME_CONE);
      }),
      { numRuns: 300 },
    );
  });

  it('Feature: graveyard-core, Property 77 (camera side): the camera stays at the player pose until group B opens', () => {
    const anyDt = fc.oneof(
      fc.double({ min: -1, max: 1, noNaN: false }),
      fc.constantFrom(0, Number.NaN, -Infinity, Infinity, 5, 1e9),
    );
    fc.assert(
      fc.property(scene, fc.array(anyDt, { maxLength: 120 }), (s, dts) => {
        const state = createResurrectionState();
        const progress = createResurrectionProgress();
        const effects = createResurrectionEffects();
        const out = createCameraPose();
        for (const dt of dts) {
          tickResurrection(state, progress, effects, dt, false);
          writeResurrectionCamera(progress.groupBTime, s.player, s.tomb, out);
          if (progress.groupBTime === 0) expect(sameBits(out, s.player)).toBe(true);
          // Group B cannot open before the embers step is complete and the book is gone.
          if (progress.groupBTime > 0) expect(effects.bookGone && state.step >= 1).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

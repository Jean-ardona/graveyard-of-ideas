import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fragment, createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import type { TombDescriptor } from '../world/tombLogic';

const rig = vi.hoisted(() => ({
  frames: [] as Array<(state: unknown, delta: number) => void>,
  camera: null as unknown,
  scene: null as unknown,
  canvas: null as unknown,
}));

const session = vi.hoisted(() => ({
  tombs: [] as unknown[],
  running: false,
  instant: false,
  ended: 0,
  listener: null as (() => void) | null,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    // Registered in mount order on the first render; both callbacks read refs, so the first ones stay valid.
    rig.frames.push(callback);
  },
  useThree: (selector: (state: { camera: unknown; scene: unknown; gl: { domElement: unknown } }) => unknown) =>
    selector({ camera: rig.camera, scene: rig.scene, gl: { domElement: rig.canvas } }),
}));

vi.mock('../cinematics/resurrectionSession', () => ({
  getHeldTombs: () => session.tombs,
  isResurrectionRunning: () => session.running,
  subscribeResurrection: (listener: () => void) => {
    session.listener = listener;
    return () => {
      session.listener = null;
    };
  },
  endResurrection: () => {
    session.ended += 1;
    session.tombs = [];
    session.running = false;
  },
  wantsInstantSequence: () => session.instant,
}));

import PlayerController from '../interaction/PlayerController';
import ResurrectionDriver from '../cinematics/ResurrectionDriver';
import { isCameraClaimed, releaseCamera } from '../interaction/cameraOverride';
import { playerSession } from '../interaction/playerSession';
import { EYE_HEIGHT } from '../world/config';
import { terrainHeight } from '../world/terrain';

let camera: THREE.PerspectiveCamera;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  rig.frames = [];
  camera = new THREE.PerspectiveCamera();
  rig.camera = camera;
  rig.scene = new THREE.Scene();
  rig.canvas = document.createElement('canvas');
  session.tombs = [];
  session.running = false;
  session.instant = false;
  session.ended = 0;
  session.listener = null;
});

afterEach(() => {
  cleanup();
  releaseCamera();
  vi.restoreAllMocks();
});

/** Mounts the controller (input locked, as during the sequence) and the driver, controller first. */
function mount(): void {
  render(
    createElement(
      Fragment,
      null,
      createElement(PlayerController, { inputLocked: true }),
      createElement(ResurrectionDriver),
    ),
  );
}

/** One frame: the controller's callback, then the driver's, as React Three Fiber runs them. */
function frame(dt = 0.1): void {
  const controller = rig.frames[0];
  const driver = rig.frames[1];
  if (!controller || !driver) throw new Error('both components must register a frame callback');
  act(() => {
    controller({}, dt);
    driver({}, dt);
  });
}

/** Starts the sequence with a tomb ahead and to the left of the player, as the session would. */
function startSequence(): void {
  const tomb: TombDescriptor = {
    id: 'p1',
    slot: 0,
    shape: 'rounded',
    title: 'Moss',
    x: playerSession.x - 3,
    z: playerSession.z - 3,
    rotation: Math.PI / 4,
    lean: 0,
    label: 'Open Moss',
  };
  session.tombs = [tomb];
  session.running = true;
  act(() => session.listener?.());
}

function playerPose(): number[] {
  return [playerSession.x, playerSession.z, playerSession.yaw, playerSession.pitch];
}

function expectCameraAtPlayer(): void {
  const { x, z, yaw, pitch } = playerSession;
  expect(camera.position.x).toBeCloseTo(x, 9);
  expect(camera.position.y).toBeCloseTo(terrainHeight(x, z) + EYE_HEIGHT, 9);
  expect(camera.position.z).toBeCloseTo(z, 9);
  expect(camera.rotation.y).toBeCloseTo(yaw, 9);
  expect(camera.rotation.x).toBeCloseTo(pitch, 9);
}

describe('resurrection driver and the camera', () => {
  it('claims at the start, follows, releases at the end, and the controller writes the camera on the next frame', () => {
    mount();
    frame();
    const before = playerPose();
    startSequence();
    expect(isCameraClaimed()).toBe(true);
    let turned = false;
    for (let i = 0; i < 300 && session.ended === 0; i++) {
      frame();
      if (Math.abs(camera.rotation.y - playerSession.yaw) > 0.05) turned = true;
    }
    expect(session.ended).toBe(1);
    expect(turned).toBe(true);
    expect(isCameraClaimed()).toBe(false);
    frame();
    expectCameraAtPlayer();
    expect(playerPose()).toEqual(before);
  });

  it('releases on skip and lands on the player pose', () => {
    mount();
    frame();
    const before = playerPose();
    startSequence();
    for (let i = 0; i < 60; i++) frame();
    expect(isCameraClaimed()).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(session.ended).toBe(1);
    expect(isCameraClaimed()).toBe(false);
    frame();
    expectCameraAtPlayer();
    expect(playerPose()).toEqual(before);
  });

  it('releases on unmount', () => {
    mount();
    frame();
    startSequence();
    for (let i = 0; i < 60; i++) frame();
    expect(isCameraClaimed()).toBe(true);
    cleanup();
    expect(isCameraClaimed()).toBe(false);
    expect(session.ended).toBe(1);
  });

  it('with reduced motion or calm mode never claims or moves the camera and ends in one frame', () => {
    session.instant = true;
    mount();
    frame();
    const position = camera.position.toArray();
    const rotation = [camera.rotation.x, camera.rotation.y];
    startSequence();
    expect(isCameraClaimed()).toBe(false);
    frame();
    expect(session.ended).toBe(1);
    expect(isCameraClaimed()).toBe(false);
    expect(camera.position.toArray()).toEqual(position);
    expect([camera.rotation.x, camera.rotation.y]).toEqual(rotation);
  });
});

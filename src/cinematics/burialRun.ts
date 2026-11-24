import * as THREE from 'three';
import { getBookHandle } from '../book/bookHandles';
import { BOOK_REST_FOOTPRINT } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { claimCamera, releaseCamera } from '../interaction/cameraOverride';
import { playerSession } from '../interaction/playerSession';
import { EYE_HEIGHT, GRAVE_SLOTS } from '../world/config';
import { terrainHeight } from '../world/terrain';
import { PLINTH } from '../world/tombAssets';
import { BURIAL_APPEAR_CUE, GLOW_LIFT, createBookReveal, createBurialGlow } from './burialAssets';
import type { BookReveal, BurialGlow } from './burialAssets';
import { holdPose, writeBurialCamera } from './burialCamera';
import { createBurialTimeline, skipBurial, tickBurial } from './burialTimeline';
import type { BurialTimeline } from './burialTimeline';
import { HOLD_DISTANCE } from './burialTimings';
import { copyPose, createCameraPose } from './cameraPose';
import type { CameraPose } from './cameraPose';
import type { Point3 } from './lookAtSlot';

export interface BurialRunInput {
  scene: THREE.Object3D;
  /** Its pose at the start is the pose the dolly starts from and returns to. */
  camera: THREE.Camera;
  projectId: string;
  /** `slot` of the saved project. */
  slot: number;
  /** Reduced animations or calm mode: the cinematic ends in one tick and the camera never moves. */
  instant: boolean;
  /** The tomb's own book. It renders after the save, so it is looked up until it is found. */
  findBook?: (id: string) => BookHandle | undefined;
}

/** One playing burial cinematic. Created on COMMIT_OK, disposed when it ends, is skipped or is torn down. */
export interface BurialRun {
  readonly timeline: BurialTimeline;
  readonly glow: BurialGlow;
  /** Optional sound cue names queued by the cinematic; nothing plays them yet. */
  readonly cues: string[];
  /** The player's pose, captured once at the start and only read. The camera starts and ends here. */
  readonly player: CameraPose;
  /** The pose the camera rests at in front of the tomb. */
  readonly hold: CameraPose;
  /** Advances the cinematic and writes every visual. Returns true once it is over. Allocates nothing per frame. */
  tick(dt: number): boolean;
  /** Jumps to the final state, writes it (the camera at the player's pose) and releases the camera. Safe to call at any time. */
  skip(): void;
  /** Releases the camera, removes and disposes every temporary object. Safe to call twice. */
  dispose(): void;
}

interface SlabPlace {
  /** The middle of the resting book, which the camera looks at. */
  point: Point3;
  /** Direction the tomb faces. */
  heading: number;
}

function slabPlace(slot: number): SlabPlace | null {
  const place = GRAVE_SLOTS[slot];
  if (place === undefined) return null;
  const front = PLINTH.bookZ - BOOK_REST_FOOTPRINT.length / 2;
  return {
    point: {
      x: place.x + Math.sin(place.rotation) * front,
      y: terrainHeight(place.x, place.z) + PLINTH.topY,
      z: place.z + Math.cos(place.rotation) * front,
    },
    heading: place.rotation,
  };
}

export function createBurialRun(input: BurialRunInput): BurialRun {
  const findBook = input.findBook ?? getBookHandle;
  const timeline = createBurialTimeline(input.instant);
  const glow = createBurialGlow();
  const cues: string[] = [];
  const { camera } = input;

  // The player's pose, captured once and only read: the run never writes `playerSession`.
  const player = createCameraPose();
  player.x = camera.position.x;
  player.y = camera.position.y;
  player.z = camera.position.z;
  player.yaw = playerSession.yaw;
  player.pitch = playerSession.pitch;

  // The hold spot is computed once, here. Without a valid slot the camera has nowhere to go and stays put.
  const slab = slabPlace(input.slot);
  const hold = createCameraPose();
  if (slab === null) {
    copyPose(player, hold);
  } else {
    const spotX = slab.point.x + Math.sin(slab.heading) * HOLD_DISTANCE;
    const spotZ = slab.point.z + Math.cos(slab.heading) * HOLD_DISTANCE;
    holdPose(slab.point, slab.heading, terrainHeight(spotX, spotZ) + EYE_HEIGHT, hold);
    glow.sprite.position.set(slab.point.x, slab.point.y + GLOW_LIFT, slab.point.z);
  }
  input.scene.add(glow.sprite);

  const pose = createCameraPose();
  // Reduced motion and calm mode never claim or move the camera.
  let ownsCamera = !input.instant && slab !== null;
  if (ownsCamera) claimCamera();

  /** Hands the camera back to the player controller. Safe to call twice. */
  function releaseOwnCamera(): void {
    if (!ownsCamera) return;
    ownsCamera = false;
    releaseCamera();
  }

  let reveal: BookReveal | null = null;
  let cued = false;
  let disposed = false;

  /** Copies the numbers of the current elapsed time into the camera, the glow and the book. */
  function write(): void {
    const { progress } = timeline;
    if (ownsCamera) {
      writeBurialCamera(timeline.elapsed, player, hold, pose);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, pose.yaw, 0);
    }
    glow.apply(progress.glow);
    if (reveal === null) {
      const book = findBook(input.projectId);
      if (book !== undefined) reveal = createBookReveal(book);
    }
    reveal?.apply(progress.appear, progress.glow);
    if (!cued && progress.appear > 0) {
      cued = true;
      cues.push(BURIAL_APPEAR_CUE);
    }
  }

  write();

  return {
    timeline,
    glow,
    cues,
    player,
    hold,
    tick(dt) {
      if (disposed) return true;
      tickBurial(timeline, dt, input.instant);
      write();
      if (timeline.effects.done) releaseOwnCamera();
      return timeline.effects.done;
    },
    skip() {
      if (disposed) return;
      skipBurial(timeline, timeline.elapsed);
      write();
      releaseOwnCamera();
    },
    dispose() {
      releaseOwnCamera();
      if (disposed) return;
      disposed = true;
      reveal?.dispose();
      glow.dispose();
    },
  };
}

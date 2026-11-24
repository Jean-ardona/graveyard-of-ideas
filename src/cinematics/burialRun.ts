import * as THREE from 'three';
import { getBookHandle } from '../book/bookHandles';
import { BOOK_REST_FOOTPRINT } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { requestLook } from '../interaction/lookRequest';
import { playerSession } from '../interaction/playerSession';
import { EYE_HEIGHT, GRAVE_SLOTS } from '../world/config';
import { terrainHeight } from '../world/terrain';
import { PLINTH } from '../world/tombAssets';
import { BURIAL_APPEAR_CUE, GLOW_LIFT, createBookReveal, createBurialGlow } from './burialAssets';
import type { BookReveal, BurialGlow } from './burialAssets';
import { createBurialTimeline, skipBurial, tickBurial } from './burialTimeline';
import type { BurialTimeline } from './burialTimeline';
import { lookAtSlot, turnLook } from './lookAtSlot';
import type { Look, Point3 } from './lookAtSlot';

export interface BurialRunInput {
  scene: THREE.Object3D;
  /** Its rotation is written in place; the player controller adopts the same look through `lookRequest`. */
  camera: THREE.Camera;
  projectId: string;
  /** `slot` of the saved project. */
  slot: number;
  /** Reduced animations or calm mode: the cinematic ends in one tick. */
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
  /** The look the camera ends on: the saved project's slot. */
  readonly target: Look;
  /** Advances the cinematic and writes every visual. Returns true once it is over. Allocates nothing per frame. */
  tick(dt: number): boolean;
  /** Jumps to the final state and writes it. Safe to call at any time. */
  skip(): void;
  /** Removes and disposes every temporary object. Safe to call twice. */
  dispose(): void;
}

/** The point on the tomb the camera turns toward: the middle of the resting book. */
function bookPoint(slot: number, out: Point3): Point3 | null {
  const place = GRAVE_SLOTS[slot];
  if (place === undefined) return null;
  const front = PLINTH.bookZ - BOOK_REST_FOOTPRINT.length / 2;
  out.x = place.x + Math.sin(place.rotation) * front;
  out.z = place.z + Math.cos(place.rotation) * front;
  out.y = terrainHeight(place.x, place.z) + PLINTH.topY;
  return out;
}

export function createBurialRun(input: BurialRunInput): BurialRun {
  const findBook = input.findBook ?? getBookHandle;
  const timeline = createBurialTimeline(input.instant);
  const glow = createBurialGlow();
  const cues: string[] = [];

  // Computed once, here: the turn starts from the look the player has and ends facing the saved slot.
  const start: Look = { yaw: playerSession.yaw, pitch: playerSession.pitch };
  const target: Look = { yaw: start.yaw, pitch: start.pitch };
  const current: Look = { yaw: start.yaw, pitch: start.pitch };
  const point = bookPoint(input.slot, { x: 0, y: 0, z: 0 });
  if (point !== null) {
    const eye: Point3 = {
      x: playerSession.x,
      y: terrainHeight(playerSession.x, playerSession.z) + EYE_HEIGHT,
      z: playerSession.z,
    };
    lookAtSlot(eye, point, start, target);
    glow.sprite.position.set(point.x, point.y + GLOW_LIFT, point.z);
  }
  input.scene.add(glow.sprite);

  let reveal: BookReveal | null = null;
  let cued = false;
  let disposed = false;

  /** Copies the numbers of the current progress into the camera, the glow and the book. */
  function write(): void {
    const { progress } = timeline;
    turnLook(start, target, progress.turn, current);
    input.camera.rotation.set(current.pitch, current.yaw, 0);
    playerSession.yaw = current.yaw;
    playerSession.pitch = current.pitch;
    requestLook(current.yaw, current.pitch);

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
    target,
    tick(dt) {
      if (disposed) return true;
      tickBurial(timeline, dt, input.instant);
      write();
      return timeline.effects.done;
    },
    skip() {
      if (disposed) return;
      skipBurial(timeline, timeline.elapsed);
      write();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reveal?.dispose();
      glow.dispose();
    },
  };
}

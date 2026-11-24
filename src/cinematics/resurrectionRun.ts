import * as THREE from 'three';
import type { BookHandle } from '../book/bookHandles';
import type { QualityLevel } from '../domain/types';
import { claimCamera, releaseCamera } from '../interaction/cameraOverride';
import { playerSession } from '../interaction/playerSession';
import { terrainHeight } from '../world/terrain';
import type { TombDescriptor } from '../world/tombLogic';
import { createBookDissolve } from './bookDissolve';
import type { BookDissolve } from './bookDissolve';
import { createCameraPose } from './cameraPose';
import { writeResurrectionCamera } from './resurrectionCamera';
import type { TombFrame } from './resurrectionCamera';
import { createResurrectionAssets } from './resurrectionAssets';
import type { ResurrectionAssets } from './resurrectionAssets';
import {
  createResurrectionEffects,
  createResurrectionProgress,
  createResurrectionState,
  finishResurrection,
  tickResurrection,
} from './resurrectionTimeline';
import type { ResurrectionEffects, ResurrectionProgress, ResurrectionState } from './resurrectionTimeline';
import { writeEmbers } from './resurrectionVisuals';
import { writeSpecter } from './specterParticles';

export interface ResurrectionRunInput {
  scene: THREE.Object3D;
  /** The player's camera. Its pose at the start is the pose the follow starts from and returns to. */
  camera: THREE.Camera;
  tomb: TombDescriptor;
  /** The book of the resurrected project, still resting on its tomb. Missing only if it never rendered. */
  book: BookHandle | undefined;
  quality: QualityLevel;
  /** Reduced animations or calm mode: the sequence ends in one tick. */
  instant: boolean;
}

/** One playing resurrection. Created when the sequence starts, disposed when it ends or is torn down. */
export interface ResurrectionRun {
  readonly state: ResurrectionState;
  readonly progress: ResurrectionProgress;
  readonly effects: ResurrectionEffects;
  readonly assets: ResurrectionAssets;
  /** Advances the sequence and writes every visual. Returns true once the sequence is over. Allocates nothing. */
  tick(dt: number): boolean;
  /**
   * Jumps to the final state (book gone, `groupBTime` 9.4, `done` set), writes it (the camera back at
   * the player's pose) and releases the camera. Safe to call at any time.
   */
  skip(): void;
  /** Releases the camera, removes and disposes every temporary object. Safe to call twice. */
  dispose(): void;
}

const BOOK_FALLBACK_HEIGHT = 0.9;

/** Builds the run: assets under one group at the tomb, and the burn of the book's four parts. */
export function createResurrectionRun(input: ResurrectionRunInput): ResurrectionRun {
  const { tomb } = input;
  const state = createResurrectionState();
  const progress = createResurrectionProgress();
  const effects = createResurrectionEffects();
  const assets = createResurrectionAssets(input.quality, input.instant);
  const { specter, specterSeeds, specterBuffers } = assets;
  const originY = terrainHeight(tomb.x, tomb.z);
  assets.group.position.set(tomb.x, originY, tomb.z);
  input.scene.add(assets.group);

  // Embers start where the book lies, expressed relative to the tomb.
  const bookPosition = new THREE.Vector3(tomb.x, originY + BOOK_FALLBACK_HEIGHT, tomb.z);
  if (input.book !== undefined) {
    input.book.root.updateWorldMatrix(true, false);
    input.book.root.getWorldPosition(bookPosition);
  }
  assets.embers.originX = bookPosition.x - tomb.x;
  assets.embers.originY = bookPosition.y - originY;
  assets.embers.originZ = bookPosition.z - tomb.z;

  const dissolve: BookDissolve | null = input.book === undefined ? null : createBookDissolve(input.book);
  let disposed = false;

  // The player's pose, captured once and only read: the run never writes `playerSession`.
  const { camera } = input;
  const player = createCameraPose();
  player.x = camera.position.x;
  player.y = camera.position.y;
  player.z = camera.position.z;
  player.yaw = playerSession.yaw;
  player.pitch = playerSession.pitch;
  const tombFrame: TombFrame = { x: tomb.x, z: tomb.z, groundY: originY, heading: tomb.rotation };
  const pose = createCameraPose();
  // Reduced motion and calm mode never claim or move the camera.
  let ownsCamera = !input.instant;
  if (ownsCamera) claimCamera();

  /** Hands the camera back to the player controller. Safe to call twice. */
  function releaseOwnCamera(): void {
    if (!ownsCamera) return;
    ownsCamera = false;
    releaseCamera();
  }

  /** Copies the numbers of the current progress into the scene objects. */
  function write(): void {
    writeEmbers(assets.embers, progress);
    assets.emberPositions.needsUpdate = true;
    assets.emberColors.needsUpdate = true;
    dissolve?.apply(progress);
    if (specter !== null && specterSeeds !== null && specterBuffers !== null) {
      specter.apply(writeSpecter(specterSeeds, progress.specterTime, tomb.rotation, specterBuffers));
    }
    if (ownsCamera) {
      writeResurrectionCamera(progress.groupBTime, player, tombFrame, pose);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, pose.yaw, 0);
    }
  }

  write();

  return {
    state,
    progress,
    effects,
    assets,
    tick(dt) {
      if (disposed) return true;
      tickResurrection(state, progress, effects, dt, input.instant);
      write();
      if (effects.done) releaseOwnCamera();
      return effects.done;
    },
    skip() {
      if (disposed) return;
      finishResurrection(state, progress, effects);
      write();
      releaseOwnCamera();
    },
    dispose() {
      releaseOwnCamera();
      if (disposed) return;
      disposed = true;
      dissolve?.dispose();
      assets.dispose();
    },
  };
}

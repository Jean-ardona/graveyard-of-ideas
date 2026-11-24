import * as THREE from 'three';
import type { BookHandle } from '../book/bookHandles';
import type { QualityLevel } from '../domain/types';
import { terrainHeight } from '../world/terrain';
import type { TombDescriptor } from '../world/tombLogic';
import { createBookDissolve } from './bookDissolve';
import type { BookDissolve } from './bookDissolve';
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
import { createSpecterPose, writeEmbers, writeSmoke, writeSpecterPose } from './resurrectionVisuals';

export interface ResurrectionRunInput {
  scene: THREE.Object3D;
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
  /** Jumps to the final state (book gone, specter faded, `done` set) and writes it. Safe to call at any time. */
  skip(): void;
  /** Removes and disposes every temporary object. Safe to call twice. */
  dispose(): void;
}

const BOOK_FALLBACK_HEIGHT = 0.9;

/** Builds the run: assets under one group at the tomb, and the burn of the book's four parts. */
export function createResurrectionRun(input: ResurrectionRunInput): ResurrectionRun {
  const { tomb } = input;
  const state = createResurrectionState();
  const progress = createResurrectionProgress();
  const effects = createResurrectionEffects();
  const assets = createResurrectionAssets(input.quality);
  const specterPose = createSpecterPose();
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

  /** Copies the numbers of the current progress into the scene objects. */
  function write(): void {
    writeEmbers(assets.embers, progress);
    assets.emberPositions.needsUpdate = true;
    assets.emberColors.needsUpdate = true;
    dissolve?.apply(progress);

    writeSmoke(assets.smoke, progress);
    const { puffs } = assets.smoke;
    assets.smokeMaterial.opacity = assets.smoke.opacity;
    for (let i = 0; i < assets.puffs.length; i++) {
      const puff = assets.puffs[i]!;
      puff.visible = assets.smoke.opacity > 0;
      puff.position.set(puffs[i * 4]!, puffs[i * 4 + 1]!, puffs[i * 4 + 2]!);
      puff.scale.setScalar(puffs[i * 4 + 3]!);
    }

    writeSpecterPose(progress, tomb.rotation, specterPose);
    assets.specterMaterial.opacity = specterPose.opacity;
    assets.specter.visible = specterPose.opacity > 0;
    assets.specter.position.set(specterPose.x, specterPose.y, specterPose.z);
    assets.specter.scale.set(specterPose.scale * 0.9, specterPose.scale * 1.5, 1);
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
      return effects.done;
    },
    skip() {
      if (disposed) return;
      finishResurrection(state, progress, effects);
      write();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      dissolve?.dispose();
      assets.dispose();
    },
  };
}

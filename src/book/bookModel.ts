import * as THREE from 'three';
import { BOOK_PIVOTS, BOOK_SIZE } from './bookAssets';
import type { BookAssets } from './bookAssets';
import type { BookParts } from './bookHandles';

/** A built book: plain objects that share the geometry and materials of the assets. */
export interface BookModel {
  readonly root: THREE.Group;
  readonly parts: BookParts;
  readonly leaves: readonly THREE.Group[];
}

/** Size of a resting book relative to the model; the reading pose uses scale 1. */
export const BOOK_REST_SCALE = 1.8;

/** Footprint of a resting book lying flat: cover up, the head of the book toward -z. */
export const BOOK_REST_FOOTPRINT = {
  width: BOOK_SIZE.width * BOOK_REST_SCALE,
  length: BOOK_SIZE.height * BOOK_REST_SCALE,
} as const;

/**
 * Lays the book flat on the surface at the parent's origin: cover up, bottom edge at the origin
 * and the book extending toward -z. Sets only the transform of the root; geometry stays shared.
 */
export function applyRestPose(root: THREE.Object3D): void {
  root.rotation.set(-Math.PI / 2, 0, 0);
  root.scale.setScalar(BOOK_REST_SCALE);
  // The origin is at mid-thickness, so the book is raised by half its scaled thickness.
  root.position.set(0, (BOOK_SIZE.depth * BOOK_REST_SCALE) / 2, 0);
}

function hinge(position: readonly [number, number, number], mesh: THREE.Mesh): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.add(mesh);
  return group;
}

/**
 * Cover, spine, page block and pages as four separate parts; the page block part also holds the back
 * board (two meshes), so the contract stays at four parts and seven meshes. The cover, the back board
 * and each leaf sit in a group on the spine axis, so setting its rotation about y turns it about the spine. No lights,
 * no shadow flags and no allocation of geometry or materials.
 */
export function createBookModel(assets: BookAssets): BookModel {
  const cover = hinge(BOOK_PIVOTS.frontBoard, new THREE.Mesh(assets.frontBoard, assets.coverMaterial));
  const spine = new THREE.Group().add(new THREE.Mesh(assets.spine, assets.spineMaterial));
  // The back board is part of the page block group: the same geometry and cover material (so the same
  // border texture) as the front board, on its own hinge on the spine axis behind the block.
  const backBoard = hinge(BOOK_PIVOTS.backBoard, new THREE.Mesh(assets.frontBoard, assets.coverMaterial));
  const pageBlock = new THREE.Group().add(new THREE.Mesh(assets.pageBlock, assets.pageBlockFaces), backBoard);
  const leaves = BOOK_PIVOTS.leaves.map((position) =>
    hinge(position, new THREE.Mesh(assets.leaf, assets.leafMaterial)),
  );
  const pages = new THREE.Group().add(...leaves);

  const root = new THREE.Group().add(cover, spine, pageBlock, pages);
  return { root, parts: { cover, spine, pageBlock, pages }, leaves };
}

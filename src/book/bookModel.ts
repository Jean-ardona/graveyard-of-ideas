import * as THREE from 'three';
import { BOOK_PIVOTS } from './bookAssets';
import type { BookAssets } from './bookAssets';
import type { BookParts } from './bookHandles';

/** A built book: plain objects that share the geometry and materials of the assets. */
export interface BookModel {
  readonly root: THREE.Group;
  readonly parts: BookParts;
  readonly leaves: readonly THREE.Group[];
}

function hinge(position: readonly [number, number, number], mesh: THREE.Mesh): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.add(mesh);
  return group;
}

/**
 * Cover, spine, page block and pages as four separate parts. The cover and each leaf sit in a
 * group on the spine axis, so setting its rotation about y turns it about the spine. No lights,
 * no shadow flags and no allocation of geometry or materials.
 */
export function createBookModel(assets: BookAssets): BookModel {
  const cover = hinge(BOOK_PIVOTS.frontBoard, new THREE.Mesh(assets.frontBoard, assets.coverMaterial));
  const spine = new THREE.Group().add(new THREE.Mesh(assets.spine, assets.spineMaterial));
  const pageBlock = new THREE.Group().add(new THREE.Mesh(assets.pageBlock, assets.pageBlockMaterial));
  const leaves = BOOK_PIVOTS.leaves.map((position) =>
    hinge(position, new THREE.Mesh(assets.leaf, assets.leafMaterial)),
  );
  const pages = new THREE.Group().add(...leaves);

  const root = new THREE.Group().add(cover, spine, pageBlock, pages);
  return { root, parts: { cover, spine, pageBlock, pages }, leaves };
}

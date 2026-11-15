import * as THREE from 'three';
import { COLORS } from '../world/config';
import { mergeParts, placed } from '../world/geometryUtils';
import { createCoverBorderTexture, createCoverMaterial, createLeafMaterial, createPageEdgeMaterial } from './bookLook';
import { BOARD_THICKNESS, BOOK_DEPTH, LEAF_COUNT, LEAF_THICKNESS, restLeafZ } from './bookStack';

/**
 * Geometry, materials and texture shared by every book. Created once, disposed once.
 * The book stands upright, its origin at the bottom center; the cover faces +z.
 * The front board and the leaves are built around the spine axis, so a pivot placed on
 * that axis turns them about the spine.
 */

export const BOOK_SIZE = { width: 0.3, height: 0.4, depth: BOOK_DEPTH } as const;

const BOARD = BOARD_THICKNESS;
const SPINE_WIDTH = 0.014;
const INNER_WIDTH = BOOK_SIZE.width - SPINE_WIDTH - 0.01;
const INNER_HEIGHT = BOOK_SIZE.height - 0.03;
const INNER_DEPTH = BOOK_SIZE.depth - 2 * BOARD;
const LEAF_DEPTH = LEAF_THICKNESS;
const HALF_WIDTH = BOOK_SIZE.width / 2;
const HALF_DEPTH = BOOK_SIZE.depth / 2;
const MIDDLE_Y = BOOK_SIZE.height / 2;
/** The page block sits against the spine and leaves a margin on the open side. */
const INNER_CENTER_X = -HALF_WIDTH + SPINE_WIDTH + INNER_WIDTH / 2;

/** The leaves lie against the front board; page 1 is the outermost one. */
const BLOCK_DEPTH = INNER_DEPTH - LEAF_COUNT * LEAF_DEPTH;

/** Vertical axis through the middle of the spine: the hinge of the front board and the leaves. */
const HINGE_X = -HALF_WIDTH + SPINE_WIDTH / 2;
const FRONT_BOARD_Z = HALF_DEPTH - BOARD / 2;

/** Pivot positions inside the book, for the model that assembles the parts. */
export const BOOK_PIVOTS = {
  frontBoard: [HINGE_X, 0, FRONT_BOARD_Z],
  leaves: Array.from({ length: LEAF_COUNT }, (_, j): [number, number, number] => [HINGE_X, 0, restLeafZ(j)]),
} as const;

/** The face of the outermost leaf in the frame of the book: the page the overlay sits on. */
export const BOOK_PAGE_FACE = {
  minX: INNER_CENTER_X - INNER_WIDTH / 2,
  maxX: INNER_CENTER_X + INNER_WIDTH / 2,
  minY: MIDDLE_Y - INNER_HEIGHT / 2,
  maxY: MIDDLE_Y + INNER_HEIGHT / 2,
  z: INNER_DEPTH / 2,
} as const;

/**
 * The flat leaf in the frame of its hinge: where its free-edge side starts (`originX`), the bottom
 * edge (`originY`) and its size. The curved leaf is built from the same numbers.
 */
export const LEAF_FRAME = {
  originX: INNER_CENTER_X - INNER_WIDTH / 2 - HINGE_X,
  originY: MIDDLE_Y - INNER_HEIGHT / 2,
  width: INNER_WIDTH,
  height: INNER_HEIGHT,
  depth: LEAF_DEPTH,
} as const;

/** A box whose center is at (x, y, z) in the frame of its pivot. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return placed(new THREE.BoxGeometry(w, h, d), [x, y, z]);
}

/** The four parts of a book. The leaf geometry and material are used by all three leaves. */
export interface BookAssets {
  frontBoard: THREE.BufferGeometry;
  spine: THREE.BufferGeometry;
  pageBlock: THREE.BufferGeometry;
  leaf: THREE.BufferGeometry;
  coverMaterial: THREE.Material;
  spineMaterial: THREE.Material;
  pageBlockMaterial: THREE.Material;
  leafMaterial: THREE.Material;
  coverTexture: THREE.Texture;
  dispose(): void;
}

export function createBookAssets(): BookAssets {
  // Front board, in the frame of its hinge: it spans from the spine to the open edge.
  const frontBoard = box(BOOK_SIZE.width - SPINE_WIDTH, BOOK_SIZE.height, BOARD, HALF_WIDTH, MIDDLE_Y, 0);
  // The binding: spine and back board in one part.
  const spine = mergeParts([
    box(SPINE_WIDTH, BOOK_SIZE.height, BOOK_SIZE.depth, HINGE_X, MIDDLE_Y, 0),
    box(BOOK_SIZE.width - SPINE_WIDTH, BOOK_SIZE.height, BOARD, SPINE_WIDTH / 2, MIDDLE_Y, -HALF_DEPTH + BOARD / 2),
  ]);
  const pageBlock = box(
    INNER_WIDTH,
    INNER_HEIGHT,
    BLOCK_DEPTH,
    INNER_CENTER_X,
    MIDDLE_Y,
    -INNER_DEPTH / 2 + BLOCK_DEPTH / 2,
  );
  // One leaf, in the frame of its hinge.
  const leaf = box(INNER_WIDTH, INNER_HEIGHT, LEAF_DEPTH, INNER_CENTER_X - HINGE_X, MIDDLE_Y, 0);

  const coverTexture = createCoverBorderTexture();
  const coverMaterial = createCoverMaterial(coverTexture);
  const spineMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bookSpine, flatShading: true, roughness: 1 });
  const pageBlockMaterial = createPageEdgeMaterial();
  const leafMaterial = createLeafMaterial();

  return {
    frontBoard,
    spine,
    pageBlock,
    leaf,
    coverMaterial,
    spineMaterial,
    pageBlockMaterial,
    leafMaterial,
    coverTexture,
    dispose() {
      [frontBoard, spine, pageBlock, leaf].forEach((geometry) => geometry.dispose());
      [coverMaterial, spineMaterial, pageBlockMaterial, leafMaterial].forEach((material) => material.dispose());
      coverTexture.dispose();
    },
  };
}

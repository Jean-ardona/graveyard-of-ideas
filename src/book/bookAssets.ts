import * as THREE from 'three';
import { COLORS } from '../world/config';
import { mergeParts, placed } from '../world/geometryUtils';

/**
 * Geometry and materials shared by every book. Created once, disposed once.
 * The book stands upright, its origin at the bottom center; the cover faces +z.
 */

export const BOOK_SIZE = { width: 0.3, height: 0.4, depth: 0.07 } as const;

const BOARD = 0.012;
const SPINE_WIDTH = 0.014;
const INNER_WIDTH = BOOK_SIZE.width - SPINE_WIDTH - 0.01;
const INNER_HEIGHT = BOOK_SIZE.height - 0.03;
const INNER_DEPTH = BOOK_SIZE.depth - 2 * BOARD;
const LEAF_DEPTH = 0.004;
const HALF_WIDTH = BOOK_SIZE.width / 2;
const HALF_DEPTH = BOOK_SIZE.depth / 2;
const MIDDLE_Y = BOOK_SIZE.height / 2;
/** The page block sits against the spine and leaves a margin on the open side. */
const INNER_CENTER_X = -HALF_WIDTH + SPINE_WIDTH + INNER_WIDTH / 2;

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return placed(new THREE.BoxGeometry(w, h, d), [x, y, z]);
}

/** The four parts of a book, each a separate mesh so a later effect can treat them one by one. */
export interface BookAssets {
  cover: THREE.BufferGeometry;
  spine: THREE.BufferGeometry;
  pageBlock: THREE.BufferGeometry;
  pages: THREE.BufferGeometry;
  coverMaterial: THREE.Material;
  spineMaterial: THREE.Material;
  pageBlockMaterial: THREE.Material;
  pagesMaterial: THREE.Material;
  dispose(): void;
}

export function createBookAssets(): BookAssets {
  const cover = mergeParts([
    box(BOOK_SIZE.width - SPINE_WIDTH, BOOK_SIZE.height, BOARD, SPINE_WIDTH / 2, MIDDLE_Y, HALF_DEPTH - BOARD / 2),
    box(BOOK_SIZE.width - SPINE_WIDTH, BOOK_SIZE.height, BOARD, SPINE_WIDTH / 2, MIDDLE_Y, -HALF_DEPTH + BOARD / 2),
  ]);
  const spine = box(SPINE_WIDTH, BOOK_SIZE.height, BOOK_SIZE.depth, -HALF_WIDTH + SPINE_WIDTH / 2, MIDDLE_Y, 0);
  const pageBlock = box(INNER_WIDTH, INNER_HEIGHT, INNER_DEPTH - 2 * LEAF_DEPTH, INNER_CENTER_X, MIDDLE_Y, 0);
  const pages = mergeParts([
    box(INNER_WIDTH, INNER_HEIGHT, LEAF_DEPTH, INNER_CENTER_X, MIDDLE_Y, INNER_DEPTH / 2 - LEAF_DEPTH / 2),
    box(INNER_WIDTH, INNER_HEIGHT, LEAF_DEPTH, INNER_CENTER_X, MIDDLE_Y, -INNER_DEPTH / 2 + LEAF_DEPTH / 2),
  ]);

  const coverMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bookCover, flatShading: true, roughness: 1 });
  const spineMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bookSpine, flatShading: true, roughness: 1 });
  const pageBlockMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bookPageBlock, roughness: 1 });
  const pagesMaterial = new THREE.MeshStandardMaterial({ color: COLORS.bookPages, roughness: 1 });

  return {
    cover,
    spine,
    pageBlock,
    pages,
    coverMaterial,
    spineMaterial,
    pageBlockMaterial,
    pagesMaterial,
    dispose() {
      [cover, spine, pageBlock, pages].forEach((geometry) => geometry.dispose());
      [coverMaterial, spineMaterial, pageBlockMaterial, pagesMaterial].forEach((material) => material.dispose());
    },
  };
}

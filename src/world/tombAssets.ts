import * as THREE from 'three';
import { BOOK_REST_FOOTPRINT } from '../book';
import { COLORS } from './config';
import { mergeParts, placed } from './geometryUtils';
import type { TombShape } from './tombLogic';

/** Geometry and material shared by every tomb. Created once, disposed once. */

const BODY_DEPTH = 0.5;
const BASE_TOP = 0.15;
/** The slab covers this vertical band of the front face, flush against the body. */
const SLAB_WIDTH = 0.76;
const SLAB_HEIGHT = 0.55;
const SLAB_CENTER_Y = 0.525;
const SLAB_DEPTH = 0.14;
/**
 * A low stone step in front of the slab. The closed book lies on top of it, in plain view.
 * Coordinates are in tomb space: `topY` is the surface, `frontZ` the edge nearest the player.
 */
const PLINTH_MARGIN = 0.05;
const PLINTH_BACK_Z = BODY_DEPTH / 2 + SLAB_DEPTH;
export const PLINTH = {
  width: 0.76,
  /** Reaches down into the base, so no gap shows under it. */
  bottomY: -0.1,
  topY: 0.2,
  depth: BOOK_REST_FOOTPRINT.length + 2 * PLINTH_MARGIN,
  backZ: PLINTH_BACK_Z,
  /** Where the book origin (its bottom edge) goes: the book extends from here toward the tomb. */
  bookZ: PLINTH_BACK_Z + PLINTH_MARGIN + BOOK_REST_FOOTPRINT.length,
} as const;
/** The engraved name sits above the slab. */
export const NAME_PLANE = { width: 0.7, height: 0.35, centerY: 1.0 } as const;

function box(w: number, h: number, d: number, x: number, y: number, z = 0): THREE.BufferGeometry {
  return placed(new THREE.BoxGeometry(w, h, d), [x, y, z]);
}

function createBase(): THREE.BufferGeometry {
  return box(1.6, 0.25, 0.9, 0, 0.025);
}

/** Body from the top of the base up. Front face is at z = BODY_DEPTH / 2. */
function createBody(shape: TombShape): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createBase()];
  switch (shape) {
    case 'rounded': {
      parts.push(box(1.2, 1.05, BODY_DEPTH, 0, BASE_TOP + 0.525));
      const arch = new THREE.CylinderGeometry(0.6, 0.6, BODY_DEPTH, 10, 1, false, Math.PI / 2, Math.PI);
      arch.rotateX(Math.PI / 2);
      parts.push(placed(arch, [0, 1.2, 0]));
      break;
    }
    case 'rectangular':
      parts.push(box(1.2, 1.25, BODY_DEPTH, 0, BASE_TOP + 0.625));
      parts.push(box(1.3, 0.1, 0.6, 0, 1.45));
      break;
    case 'worn':
      parts.push(box(1.2, 1.05, BODY_DEPTH, 0, BASE_TOP + 0.525));
      parts.push(box(0.5, 0.15, BODY_DEPTH, 0.35, 1.275));
      parts.push(box(0.3, 0.08, BODY_DEPTH, -0.4, 1.24));
      break;
    case 'cross':
      parts.push(box(1.1, 1.2, BODY_DEPTH, 0, BASE_TOP + 0.6));
      parts.push(box(0.12, 0.5, 0.12, 0, 1.6));
      parts.push(box(0.36, 0.12, 0.12, 0, 1.68));
      break;
  }
  return mergeParts(parts);
}

export interface TombAssets {
  bodies: Readonly<Record<TombShape, THREE.BufferGeometry>>;
  plinth: THREE.BufferGeometry;
  slab: THREE.BufferGeometry;
  namePlane: THREE.BufferGeometry;
  stone: THREE.Material;
  slabStone: THREE.Material;
  dispose(): void;
}

export function createTombAssets(): TombAssets {
  const bodies: Record<TombShape, THREE.BufferGeometry> = {
    rounded: createBody('rounded'),
    rectangular: createBody('rectangular'),
    worn: createBody('worn'),
    cross: createBody('cross'),
  };
  const plinth = box(
    PLINTH.width,
    PLINTH.topY - PLINTH.bottomY,
    PLINTH.depth,
    0,
    (PLINTH.topY + PLINTH.bottomY) / 2,
    PLINTH.backZ + PLINTH.depth / 2,
  );
  const slab = box(SLAB_WIDTH, SLAB_HEIGHT, SLAB_DEPTH, 0, SLAB_CENTER_Y, BODY_DEPTH / 2 + SLAB_DEPTH / 2);
  const namePlane = placed(new THREE.PlaneGeometry(NAME_PLANE.width, NAME_PLANE.height), [
    0,
    NAME_PLANE.centerY,
    BODY_DEPTH / 2 + 0.002,
  ]);
  const stone = new THREE.MeshStandardMaterial({ color: COLORS.stone, flatShading: true, roughness: 1 });
  const slabStone = new THREE.MeshStandardMaterial({ color: COLORS.stoneDark, flatShading: true, roughness: 1 });

  return {
    bodies,
    plinth,
    slab,
    namePlane,
    stone,
    slabStone,
    dispose() {
      Object.values(bodies).forEach((geometry) => geometry.dispose());
      [plinth, slab, namePlane, stone, slabStone].forEach((resource) => resource.dispose());
    },
  };
}

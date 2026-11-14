import * as THREE from 'three';
import { COLORS } from './config';
import { mergeParts, placed } from './geometryUtils';
import type { TombShape } from './tombLogic';

/** Geometry and material shared by every tomb. Created once, disposed once. */

const BODY_DEPTH = 0.5;
const BASE_TOP = 0.15;
/** Slab and recess cover this vertical band of the front face. */
const SLAB_WIDTH = 0.76;
const SLAB_HEIGHT = 0.55;
const SLAB_CENTER_Y = 0.525;
const RECESS_DEPTH = 0.04;
const SLAB_DEPTH = 0.1;
/** Floor and front of the cavity behind the slab, in tomb coordinates. */
export const CAVITY = {
  floorY: SLAB_CENTER_Y - SLAB_HEIGHT / 2,
  frontZ: BODY_DEPTH / 2 + RECESS_DEPTH,
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
  recess: THREE.BufferGeometry;
  slab: THREE.BufferGeometry;
  namePlane: THREE.BufferGeometry;
  stone: THREE.Material;
  slabStone: THREE.Material;
  recessDark: THREE.Material;
  dispose(): void;
}

export function createTombAssets(): TombAssets {
  const bodies: Record<TombShape, THREE.BufferGeometry> = {
    rounded: createBody('rounded'),
    rectangular: createBody('rectangular'),
    worn: createBody('worn'),
    cross: createBody('cross'),
  };
  const recess = box(SLAB_WIDTH, SLAB_HEIGHT, RECESS_DEPTH, 0, SLAB_CENTER_Y, BODY_DEPTH / 2 + RECESS_DEPTH / 2);
  const slab = box(
    SLAB_WIDTH,
    SLAB_HEIGHT,
    SLAB_DEPTH,
    0,
    SLAB_CENTER_Y,
    BODY_DEPTH / 2 + RECESS_DEPTH + SLAB_DEPTH / 2,
  );
  const namePlane = placed(new THREE.PlaneGeometry(NAME_PLANE.width, NAME_PLANE.height), [
    0,
    NAME_PLANE.centerY,
    BODY_DEPTH / 2 + 0.002,
  ]);
  const stone = new THREE.MeshStandardMaterial({ color: COLORS.stone, flatShading: true, roughness: 1 });
  const slabStone = new THREE.MeshStandardMaterial({ color: COLORS.stoneDark, flatShading: true, roughness: 1 });
  const recessDark = new THREE.MeshBasicMaterial({ color: COLORS.tombRecess });

  return {
    bodies,
    recess,
    slab,
    namePlane,
    stone,
    slabStone,
    recessDark,
    dispose() {
      Object.values(bodies).forEach((geometry) => geometry.dispose());
      [recess, slab, namePlane, stone, slabStone, recessDark].forEach((resource) => resource.dispose());
    },
  };
}

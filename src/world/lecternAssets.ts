import * as THREE from 'three';
import { COLORS } from './config';
import { mergeParts, placed } from './geometryUtils';

/** One merged low-poly geometry and one material for the lectern. Created once, disposed once. */

/** Height of the reading desk above the ground; the prompt aims here. */
export const LECTERN_DESK_HEIGHT = 1.05;
/** Forward tilt of the reading desk, in radians. */
export const LECTERN_DESK_TILT = 0.35;
const DESK_TILT = LECTERN_DESK_TILT;

function box(w: number, h: number, d: number, x: number, y: number, z = 0, tilt = 0): THREE.BufferGeometry {
  return placed(new THREE.BoxGeometry(w, h, d), [x, y, z], [tilt, 0, 0]);
}

export interface LecternAssets {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  dispose(): void;
}

export function createLecternAssets(): LecternAssets {
  const geometry = mergeParts([
    box(0.7, 0.12, 0.5, 0, 0.06),
    box(0.3, 0.9, 0.24, 0, 0.55),
    box(0.8, 0.07, 0.6, 0, LECTERN_DESK_HEIGHT, 0, DESK_TILT),
    box(0.8, 0.06, 0.05, 0, LECTERN_DESK_HEIGHT - 0.1, 0.27),
  ]);
  const material = new THREE.MeshStandardMaterial({ color: COLORS.wood, flatShading: true, roughness: 1 });
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

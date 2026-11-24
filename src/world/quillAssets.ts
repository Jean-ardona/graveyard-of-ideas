import * as THREE from 'three';
import { COLORS } from './config';
import { mergeParts, placed } from './geometryUtils';

/** One merged geometry and one material for the quill on the lectern. Created once, disposed once. */

const SHAFT_LENGTH = 0.34;
const SHAFT_RADIUS = 0.007;
/** The quill's axis above the desk's centre plane: half the board's thickness plus the shaft radius and a little air. */
const LIFT = 0.05;

export interface QuillAssets {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  dispose(): void;
}

export function createQuillAssets(): QuillAssets {
  const geometry = mergeParts([
    placed(new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS * 0.5, SHAFT_LENGTH, 5), [0, LIFT, 0], [0, 0, Math.PI / 2]),
    placed(new THREE.BoxGeometry(0.2, 0.004, 0.045), [0.07, LIFT + 0.006, 0.012]),
    placed(new THREE.BoxGeometry(0.12, 0.004, 0.03), [0.13, LIFT + 0.006, -0.012], [0, 0.12, 0]),
  ]);
  const material = new THREE.MeshStandardMaterial({ color: COLORS.quill, flatShading: true, roughness: 1 });
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

import * as THREE from 'three';
import { TERRAIN_SIZE } from './config';

const SEGMENTS = 40;

/** Gentle rolling height of the ground at (x, z). */
export function terrainHeight(x: number, z: number): number {
  return (
    0.35 * Math.sin(x * 0.17 + 1) * Math.cos(z * 0.13) +
    0.12 * Math.sin(x * 0.4 + z * 0.3)
  );
}

/** Low-poly ground plane displaced by terrainHeight. */
export function createTerrainGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    position.setY(i, terrainHeight(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

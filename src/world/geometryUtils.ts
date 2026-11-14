import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Moves and rotates a geometry in place, then returns it. */
export function placed(
  geometry: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  return geometry.applyMatrix4(matrix);
}

/** Merges parts into one geometry (one draw call) and frees the parts. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('Geometry parts have incompatible attributes');
  return merged;
}

/** Creates a GPU resource once and disposes it on unmount. */
export function useDisposable<T extends { dispose(): void }>(create: () => T): T {
  const resource = useMemo(create, []);
  useEffect(() => () => resource.dispose(), [resource]);
  return resource;
}

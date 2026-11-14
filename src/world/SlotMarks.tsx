import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { COLORS, GRAVE_SLOTS } from './config';
import { useDisposable } from './geometryUtils';
import { terrainHeight } from './terrain';

/** A flat dark disc stretched into an oval, one per grave slot, in a single draw call. */
function createMoundGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 10);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(1.0, 1, 1.7);
  return geometry;
}

/** Subtle ground marks showing where tombs will stand. */
export default function SlotMarks() {
  const geometry = useDisposable(createMoundGeometry);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    GRAVE_SLOTS.forEach((slot, i) => {
      dummy.position.set(slot.x, terrainHeight(slot.x, slot.z) + 0.05, slot.z);
      dummy.rotation.set(0, slot.rotation, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, GRAVE_SLOTS.length]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        color={COLORS.mound}
        transparent
        opacity={0.55}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  );
}

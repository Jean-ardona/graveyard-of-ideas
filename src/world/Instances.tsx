import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Placement } from './layout';
import { terrainHeight } from './terrain';

interface InstancesProps {
  geometry: THREE.BufferGeometry;
  color: string;
  placements: readonly Placement[];
}

/** One draw call for many copies of a geometry resting on the terrain. */
export default function Instances({ geometry, color, placements }: InstancesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      dummy.rotation.set(0, p.rotation, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [placements]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, placements.length]}
      frustumCulled={false}
    >
      <meshStandardMaterial color={color} flatShading roughness={1} />
    </instancedMesh>
  );
}

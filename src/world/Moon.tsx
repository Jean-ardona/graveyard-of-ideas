import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { COLORS, MOON_DIRECTION, MOON_DISTANCE } from './config';

const direction = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z).normalize();

/** Partial moon: a pale disc partly hidden by a sky-colored disc in front of it. */
export default function Moon() {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    groupRef.current?.lookAt(0, 0, 0);
  }, []);

  return (
    <group ref={groupRef} position={direction.clone().multiplyScalar(MOON_DISTANCE)}>
      <mesh>
        <sphereGeometry args={[6, 16, 12]} />
        <meshBasicMaterial color={COLORS.moon} fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[3, 0.8, 2]}>
        <sphereGeometry args={[5.6, 16, 12]} />
        <meshBasicMaterial color={COLORS.sky} fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

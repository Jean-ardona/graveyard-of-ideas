import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { COLORS, MOON_DIRECTION, MOON_DISTANCE } from './config';
import { createGlowTexture } from './glowTexture';
import { useDisposable } from './geometryUtils';

const direction = new THREE.Vector3(MOON_DIRECTION.x, MOON_DIRECTION.y, MOON_DIRECTION.z).normalize();

/** Partial moon: a pale disc partly hidden by a sky-colored disc, with a soft halo behind it. */
export default function Moon() {
  const groupRef = useRef<THREE.Group>(null);
  const glow = useDisposable(createGlowTexture);

  useLayoutEffect(() => {
    groupRef.current?.lookAt(0, 0, 0);
  }, []);

  return (
    <group ref={groupRef} position={direction.clone().multiplyScalar(MOON_DISTANCE)}>
      <sprite position={[0, 0, -1]} scale={[70, 70, 1]}>
        <spriteMaterial
          map={glow}
          color={COLORS.moonHalo}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
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

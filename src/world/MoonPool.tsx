import * as THREE from 'three';
import { COLORS } from './config';
import { createGlowTexture } from './glowTexture';
import { useDisposable } from './geometryUtils';
import { terrainHeight } from './terrain';

const CENTER = { x: 0, z: 10 };

/** A faint additive pool of moonlight on the main path. No light and no shadows. */
export default function MoonPool() {
  const texture = useDisposable(createGlowTexture);
  return (
    <mesh
      position={[CENTER.x, terrainHeight(CENTER.x, CENTER.z) + 0.16, CENTER.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[9, 26]} />
      <meshBasicMaterial
        map={texture}
        color={COLORS.moonPool}
        transparent
        opacity={0.28}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

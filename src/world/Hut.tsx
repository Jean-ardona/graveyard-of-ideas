import { COLORS, HUT_POSITION } from './config';
import { terrainHeight } from './terrain';

const WIDTH = 5;
const HEIGHT = 2.6;
const DEPTH = 4;

/** Keeper's hut. Faces +z, toward the gate. The interior comes later. */
export default function Hut() {
  const y = terrainHeight(HUT_POSITION.x, HUT_POSITION.z);
  const front = DEPTH / 2 + 0.03;
  return (
    <group position={[HUT_POSITION.x, y, HUT_POSITION.z]}>
      <mesh position={[0, HEIGHT / 2, 0]}>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color={COLORS.hutWall} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, HEIGHT + 0.9, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[4.3, 1.8, 4]} />
        <meshStandardMaterial color={COLORS.hutRoof} flatShading roughness={1} />
      </mesh>
      <mesh position={[-0.9, 0.9, front]}>
        <boxGeometry args={[1, 1.8, 0.08]} />
        <meshStandardMaterial color={COLORS.ironDark} roughness={1} />
      </mesh>
      {/* Pale cold glow: amber is reserved for resurrection. */}
      <mesh position={[1.2, 1.5, front]}>
        <planeGeometry args={[0.9, 0.7]} />
        <meshBasicMaterial color={COLORS.windowGlow} />
      </mesh>
      <mesh position={[1.2, 1.5, front - 0.01]}>
        <planeGeometry args={[2, 1.6]} />
        <meshBasicMaterial
          color={COLORS.windowGlow}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

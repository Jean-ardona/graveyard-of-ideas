import { COLORS } from './config';
import { useDisposable } from './geometryUtils';
import { createTerrainGeometry } from './terrain';

export default function GroundMesh() {
  const geometry = useDisposable(createTerrainGeometry);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={COLORS.ground} flatShading roughness={1} />
    </mesh>
  );
}

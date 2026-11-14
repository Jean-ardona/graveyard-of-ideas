import * as THREE from 'three';
import { COLORS } from './config';
import { useDisposable } from './geometryUtils';
import Instances from './Instances';
import { BUSH_PLACEMENTS, STONE_PLACEMENTS } from './scenery';

function createStoneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(0.35, 0);
  geometry.scale(1, 0.7, 0.85);
  geometry.translate(0, 0.1, 0);
  return geometry;
}

function createBushGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  geometry.scale(1, 0.65, 1);
  geometry.translate(0, 0.2, 0);
  return geometry;
}

export default function StonesAndBushes() {
  const stone = useDisposable(createStoneGeometry);
  const bush = useDisposable(createBushGeometry);
  return (
    <>
      <Instances geometry={stone} color={COLORS.stone} placements={STONE_PLACEMENTS} />
      <Instances geometry={bush} color={COLORS.bush} placements={BUSH_PLACEMENTS} />
    </>
  );
}

import { useMemo } from 'react';
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

/** Stones come from the preset; there is one bush for every two stones. */
export default function StonesAndBushes({ stoneCount }: { stoneCount: number }) {
  const stone = useDisposable(createStoneGeometry);
  const bush = useDisposable(createBushGeometry);
  const stones = useMemo(() => STONE_PLACEMENTS.slice(0, stoneCount), [stoneCount]);
  const bushes = useMemo(() => BUSH_PLACEMENTS.slice(0, Math.ceil(stoneCount / 2)), [stoneCount]);
  return (
    <>
      <Instances geometry={stone} color={COLORS.stone} placements={stones} />
      <Instances geometry={bush} color={COLORS.bush} placements={bushes} />
    </>
  );
}

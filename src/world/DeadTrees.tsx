import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from './config';
import { mergeParts, placed, useDisposable } from './geometryUtils';
import Instances from './Instances';
import { TREE_PLACEMENTS } from './scenery';

/** Bare trunk with three crooked branches, merged into one geometry. */
function createDeadTreeGeometry(): THREE.BufferGeometry {
  const trunk = placed(new THREE.CylinderGeometry(0.1, 0.26, 3.4, 5), [0, 1.7, 0]);
  const branch = (length: number, y: number, tilt: number, turn: number) => {
    const part = placed(new THREE.CylinderGeometry(0.03, 0.09, length, 4), [0, length / 2, 0]);
    part.rotateZ(tilt);
    part.rotateY(turn);
    return placed(part, [0, y, 0]);
  };
  return mergeParts([
    trunk,
    branch(1.6, 2.3, 0.9, 0),
    branch(1.3, 2.8, -0.8, 2.1),
    branch(1.1, 3.1, 0.7, 4.2),
  ]);
}

export default function DeadTrees({ count }: { count: number }) {
  const geometry = useDisposable(createDeadTreeGeometry);
  const placements = useMemo(() => TREE_PLACEMENTS.slice(0, count), [count]);
  return <Instances geometry={geometry} color={COLORS.wood} placements={placements} />;
}

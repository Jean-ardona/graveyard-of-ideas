import * as THREE from 'three';
import { COLORS, GATE_POSITION } from './config';
import { mergeParts, placed, useDisposable } from './geometryUtils';
import { terrainHeight } from './terrain';

const PILLAR_X = 3.2;
const PILLAR_HEIGHT = 4.2;
const ARCH_BASE_Y = 4.0;
const ARCH_RISE = 1.4;
const CROSSBAR_Y = 3.8;

/** Two stone pillars with caps and a low wall on each side. */
function createStoneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(placed(new THREE.BoxGeometry(1, PILLAR_HEIGHT, 1), [side * PILLAR_X, PILLAR_HEIGHT / 2, 0]));
    parts.push(placed(new THREE.BoxGeometry(1.4, 0.35, 1.4), [side * PILLAR_X, PILLAR_HEIGHT + 0.17, 0]));
    parts.push(placed(new THREE.BoxGeometry(6.5, 1.2, 0.6), [side * 6.95, 0.6, 0]));
  }
  return mergeParts(parts);
}

/** Half-round iron arch, a crossbar and short bars joining them. */
function createIronGeometry(): THREE.BufferGeometry {
  const arch = new THREE.TorusGeometry(PILLAR_X, 0.09, 5, 20, Math.PI);
  arch.scale(1, ARCH_RISE / PILLAR_X, 1);
  const parts: THREE.BufferGeometry[] = [placed(arch, [0, ARCH_BASE_Y, 0])];
  parts.push(placed(new THREE.BoxGeometry(PILLAR_X * 2, 0.12, 0.12), [0, CROSSBAR_Y, 0]));
  for (const x of [-2, -1, 0, 1, 2]) {
    const top = ARCH_BASE_Y + ARCH_RISE * Math.sqrt(1 - (x / PILLAR_X) ** 2);
    const height = top - CROSSBAR_Y;
    parts.push(placed(new THREE.CylinderGeometry(0.05, 0.05, height, 4), [x, CROSSBAR_Y + height / 2, 0]));
  }
  return mergeParts(parts);
}

/** Entrance gate the player looks through at the start. */
export default function Gate() {
  const stone = useDisposable(createStoneGeometry);
  const iron = useDisposable(createIronGeometry);
  const y = terrainHeight(GATE_POSITION.x, GATE_POSITION.z);
  return (
    <group position={[GATE_POSITION.x, y, GATE_POSITION.z]}>
      <mesh geometry={stone}>
        <meshStandardMaterial color={COLORS.stone} flatShading roughness={1} />
      </mesh>
      <mesh geometry={iron}>
        <meshStandardMaterial color={COLORS.ironDark} roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  );
}

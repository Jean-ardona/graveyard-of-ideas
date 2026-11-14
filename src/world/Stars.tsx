import * as THREE from 'three';
import { COLORS } from './config';
import { useDisposable } from './geometryUtils';
import { createRandom } from './layout';

const STAR_COUNT = 150;
const STAR_RADIUS = 150;

/** Stars scattered over the upper sky dome, in a single Points object. */
function createStarGeometry(): THREE.BufferGeometry {
  const random = createRandom(101);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const azimuth = random() * Math.PI * 2;
    const height = 0.12 + random() * 0.88;
    const ring = Math.sqrt(1 - height * height);
    positions[i * 3] = Math.cos(azimuth) * ring * STAR_RADIUS;
    positions[i * 3 + 1] = height * STAR_RADIUS;
    positions[i * 3 + 2] = Math.sin(azimuth) * ring * STAR_RADIUS;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export default function Stars() {
  const geometry = useDisposable(createStarGeometry);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color={COLORS.star}
        size={2}
        sizeAttenuation={false}
        fog={false}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

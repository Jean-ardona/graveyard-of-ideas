import * as THREE from 'three';
import { COLORS, PATHS } from './config';
import { useDisposable } from './geometryUtils';
import { samplePath } from './layout';
import { terrainHeight } from './terrain';

const LIFT = 0.07;

/** One flat ribbon mesh covering every path, draped over the terrain. */
function createPathsGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const path of PATHS) {
    const samples = samplePath(path);
    const start = positions.length / 3;
    samples.forEach((p, i) => {
      const prev = samples[Math.max(i - 1, 0)] ?? p;
      const next = samples[Math.min(i + 1, samples.length - 1)] ?? p;
      const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
      const nx = (-(next.z - prev.z) / length) * (path.width / 2);
      const nz = ((next.x - prev.x) / length) * (path.width / 2);
      for (const side of [-1, 1]) {
        const x = p.x + nx * side;
        const z = p.z + nz * side;
        positions.push(x, terrainHeight(x, z) + LIFT, z);
      }
      if (i > 0) {
        const a = start + (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function Paths() {
  const geometry = useDisposable(createPathsGeometry);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={COLORS.path}
        flatShading
        roughness={1}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

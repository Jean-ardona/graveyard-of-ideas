import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from './config';
import { useDisposable } from './geometryUtils';

interface MistLayer {
  x: number;
  z: number;
  y: number;
  size: number;
  speed: number;
}

const LAYERS: readonly MistLayer[] = [
  { x: -8, z: 10, y: 0.5, size: 26, speed: 0.12 },
  { x: 9, z: 0, y: 0.7, size: 30, speed: 0.09 },
  { x: -10, z: -10, y: 0.6, size: 28, speed: 0.1 },
  { x: 8, z: -14, y: 0.8, size: 24, speed: 0.07 },
  { x: 0, z: 2, y: 0.4, size: 34, speed: 0.05 },
];

/** Soft radial blob, so each plane fades out toward its edges. */
function createMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** A few translucent planes drifting slowly just above the ground. */
export default function Mist() {
  const texture = useDisposable(createMistTexture);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    LAYERS.forEach((layer, i) => {
      meshes.current[i]?.position.set(
        layer.x + Math.sin(t * layer.speed + i) * 2,
        layer.y,
        layer.z + Math.cos(t * layer.speed + i) * 2,
      );
    });
  });

  return (
    <>
      {LAYERS.map((layer, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshes.current[i] = mesh;
          }}
          position={[layer.x, layer.y, layer.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
        >
          <planeGeometry args={[layer.size, layer.size]} />
          <meshBasicMaterial
            map={texture}
            color={COLORS.mist}
            transparent
            opacity={0.16}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

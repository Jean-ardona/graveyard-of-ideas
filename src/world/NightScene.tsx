import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Bright debug colors — one per box so each is clearly distinct. */
const BOX_COLORS = ['#ff4444', '#44ff88', '#4488ff'] as const;

/** Positions for the three placeholder boxes. */
const BOX_POSITIONS: [number, number, number][] = [
  [-3, 1, -5],
  [0, 1, -5],
  [3, 1, -5],
];

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial color="#0d1117" />
    </mesh>
  );
}

function Box({
  position,
  color,
  label,
}: {
  position: [number, number, number];
  color: string;
  label: string;
}) {
  useEffect(() => {
    console.log(`[Debug] ${label} position:`, position);
  }, [position, label]);

  return (
    <mesh position={position}>
      <boxGeometry args={[1, 2, 1]} />
      {/* MeshBasicMaterial ignores lighting — always visible regardless of lights */}
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** Logs camera position and WebGL renderer info once on mount. */
function DebugLogger() {
  const { camera, gl } = useThree();
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;

    console.log('[Debug] Camera position:', camera.position.toArray());
    console.log('[Debug] Camera fov:', (camera as THREE.PerspectiveCamera).fov ?? 'n/a');

    const info = gl.info;
    console.log('[Debug] WebGL renderer info:', {
      render: { ...info.render },
      memory: { ...info.memory },
      vendor: gl.getContext().getParameter(gl.getContext().VENDOR),
      renderer: gl.getContext().getParameter(gl.getContext().RENDERER),
    });
  }, [camera, gl]);

  return null;
}

/**
 * Lives inside the Canvas — samples frame delta and writes a rolling
 * average FPS into the provided ref so the HTML overlay can display it.
 */
export function FpsTracker({
  fpsRef,
}: {
  fpsRef: React.MutableRefObject<number>;
}) {
  const samples = useRef<number[]>([]);

  useFrame((_state, delta) => {
    if (delta <= 0) return;
    samples.current.push(1 / delta);
    if (samples.current.length > 30) samples.current.shift();
    const avg =
      samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    fpsRef.current = Math.round(avg);
  });

  return null;
}

/** The full night scene: fog, lights, ground and boxes. */
export default function NightScene() {
  return (
    <>
      {/* Debug background: visible dark blue instead of near-black */}
      <color attach="background" args={['#1a2238']} />
      <fogExp2 attach="fog" args={['#1a2238', 0.025]} />

      {/* Ambient light — MeshBasicMaterial ignores it, but keep for future MeshStandard use */}
      <ambientLight color="#ffffff" intensity={1.0} />

      {/* Moon directional light */}
      <directionalLight
        color="#c8d8ff"
        intensity={0.8}
        position={[10, 20, 5]}
        castShadow={false}
      />

      <GroundPlane />

      {BOX_POSITIONS.map((pos, i) => (
        <Box
          key={i}
          position={pos}
          color={BOX_COLORS[i % BOX_COLORS.length] ?? '#ff0000'}
          label={`Box ${i}`}
        />
      ))}

      <DebugLogger />
    </>
  );
}

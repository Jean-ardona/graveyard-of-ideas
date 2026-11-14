import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RenderStats } from './renderStats';

/**
 * Lives inside the Canvas. Samples frame delta and writes a rolling
 * average FPS into the provided ref so the HTML overlay can display it.
 */
export default function FpsTracker({
  statsRef,
}: {
  statsRef: React.MutableRefObject<RenderStats>;
}) {
  const samples = useRef<number[]>([]);

  useFrame(({ gl }, delta) => {
    if (delta <= 0) return;
    samples.current.push(1 / delta);
    if (samples.current.length > 30) samples.current.shift();
    const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    statsRef.current = { fps: Math.round(avg), calls: gl.info.render.calls };
  });

  return null;
}

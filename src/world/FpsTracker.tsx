import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Lives inside the Canvas. Samples frame delta and writes a rolling
 * average FPS into the provided ref so the HTML overlay can display it.
 */
export default function FpsTracker({
  fpsRef,
}: {
  fpsRef: React.MutableRefObject<number>;
}) {
  const samples = useRef<number[]>([]);

  useFrame((_state, delta) => {
    if (delta <= 0) return;
    samples.current.push(1 / delta);
    if (samples.current.length > 30) samples.current.shift();
    const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    fpsRef.current = Math.round(avg);
  });

  return null;
}

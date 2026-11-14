import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { QualityLevel } from '../domain';
import { accumulateLowFps, adaptiveDrop } from './adaptiveQuality';
import type { RenderStats } from './renderStats';

const SAMPLE_COUNT = 30;

interface FpsTrackerProps {
  statsRef: React.MutableRefObject<RenderStats>;
  quality: QualityLevel;
  /** Called when the frame rate stayed low long enough; receives the lighter level. */
  onAutoLower: (lighter: QualityLevel) => void;
}

/**
 * Lives inside the Canvas. Keeps a rolling average FPS in the provided ref for the
 * HTML overlay and drops the quality one level when the average stays low.
 * It never raises the quality.
 */
export default function FpsTracker({ statsRef, quality, onAutoLower }: FpsTrackerProps) {
  const samples = useRef(new Float64Array(SAMPLE_COUNT));
  const filled = useRef(0);
  const cursor = useRef(0);
  const sum = useRef(0);
  const lowSeconds = useRef(0);

  // A new level starts with a clean slate: old slow frames must not count against it.
  useEffect(() => {
    filled.current = 0;
    cursor.current = 0;
    sum.current = 0;
    lowSeconds.current = 0;
  }, [quality]);

  useFrame(({ gl }, delta) => {
    if (delta <= 0) return;
    const buffer = samples.current;
    const fps = 1 / delta;
    sum.current += fps - (filled.current === SAMPLE_COUNT ? buffer[cursor.current]! : 0);
    buffer[cursor.current] = fps;
    cursor.current = (cursor.current + 1) % SAMPLE_COUNT;
    if (filled.current < SAMPLE_COUNT) filled.current++;

    const average = sum.current / filled.current;
    statsRef.current.fps = Math.round(average);
    statsRef.current.calls = gl.info.render.calls;

    if (filled.current < SAMPLE_COUNT) return;
    lowSeconds.current = accumulateLowFps(lowSeconds.current, average, delta);
    const lighter = adaptiveDrop(quality, lowSeconds.current);
    if (lighter !== null) {
      lowSeconds.current = 0;
      onAutoLower(lighter);
    }
  });

  return null;
}

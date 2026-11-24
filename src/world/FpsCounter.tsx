import { useEffect, useRef, useState } from 'react';
import type { QualityLevel } from '../domain';
import { isTypingTarget } from '../interaction/typingTarget';
import { statsLine } from '../ui/copy';
import { qualityLabel } from './quality';
import type { RenderStats } from './renderStats';

interface FpsCounterProps {
  statsRef: React.MutableRefObject<RenderStats>;
  quality: QualityLevel;
  /** Temporary developer key: F2 asks for the next quality level. */
  onCycleQuality: () => void;
}

/**
 * Reads FPS from the shared ref written by FpsTracker (inside the Canvas)
 * and renders it as a fixed HTML overlay — no Three.js involved here.
 * Also shows the quality level; F2 cycles it (temporary developer key).
 */
export default function FpsCounter({ statsRef, quality, onCycleQuality }: FpsCounterProps) {
  const [fps, setFps] = useState(0);
  const [calls, setCalls] = useState(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      setFps(statsRef.current.fps);
      setCalls(statsRef.current.calls);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [statsRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'F2' || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      onCycleQuality();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCycleQuality]);

  return <div className="hud-stats">{statsLine(fps, calls, qualityLabel(quality))}</div>;
}

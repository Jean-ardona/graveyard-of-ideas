import { useEffect, useRef, useState } from 'react';
import type { QualityLevel } from '../domain';
import { isTypingTarget } from '../interaction/typingTarget';
import { qualityLabel } from './quality';
import type { RenderStats } from './renderStats';

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '8px',
  left: '8px',
  padding: '3px 7px',
  background: 'rgba(0,0,0,0.55)',
  color: '#e8e8e8',
  fontFamily: 'monospace',
  fontSize: '12px',
  lineHeight: '1.4',
  borderRadius: '3px',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 100,
};

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

  return (
    <div style={OVERLAY_STYLE}>
      {fps} fps, {calls} draws, {qualityLabel(quality)} (F2)
    </div>
  );
}

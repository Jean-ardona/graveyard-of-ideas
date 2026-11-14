import { useEffect, useRef, useState } from 'react';
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

/**
 * Reads FPS from the shared ref written by FpsTracker (inside the Canvas)
 * and renders it as a fixed HTML overlay — no Three.js involved here.
 */
export default function FpsCounter({
  statsRef,
}: {
  statsRef: React.MutableRefObject<RenderStats>;
}) {
  const [display, setDisplay] = useState<RenderStats>({ fps: 0, calls: 0 });
  const rafId = useRef<number>(0);

  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      setDisplay(statsRef.current);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [statsRef]);

  return <div style={OVERLAY_STYLE}>{display.fps} fps, {display.calls} draws</div>;
}

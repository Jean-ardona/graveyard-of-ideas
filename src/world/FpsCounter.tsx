import { useEffect, useRef, useState } from 'react';

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
  fpsRef,
}: {
  fpsRef: React.MutableRefObject<number>;
}) {
  const [display, setDisplay] = useState(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;
      setDisplay(fpsRef.current);
      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [fpsRef]);

  return <div style={OVERLAY_STYLE}>{display} fps</div>;
}

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import NightScene, { FpsTracker } from './world/NightScene';
import FpsCounter from './world/FpsCounter';

/** Returns true if the browser can create a WebGL context. */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

const FALLBACK_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: '12px',
  width: '100vw',
  height: '100vh',
  background: '#0d1117',
  color: '#c8d8ff',
  fontFamily: 'serif',
  fontSize: '1.1rem',
  textAlign: 'center',
  padding: '2rem',
};

export default function App() {
  const fpsRef = useRef<number>(0);
  const [webglOk] = useState<boolean>(() => isWebGLAvailable());
  const [contextLost, setContextLost] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Listen for WebGL context loss on the canvas element.
  useEffect(() => {
    if (!webglOk) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    function onContextLost(e: Event) {
      e.preventDefault(); // prevent automatic restore attempt
      console.warn('[Debug] WebGL context lost.');
      setContextLost(true);
    }

    // The canvas is a child of the container div; wait one tick for R3F to mount it.
    const timer = setTimeout(() => {
      const gl = container.querySelector('canvas');
      if (gl) {
        gl.addEventListener('webglcontextlost', onContextLost);
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      const gl = container.querySelector('canvas');
      if (gl) gl.removeEventListener('webglcontextlost', onContextLost);
    };
  }, [webglOk]);

  if (!webglOk) {
    return (
      <div style={FALLBACK_STYLE}>
        <p>WebGL is not available in this browser.</p>
        <p style={{ fontSize: '0.9rem', color: '#8899aa' }}>
          Try enabling hardware acceleration in your browser settings, or use a
          different browser. All project data is still accessible below.
        </p>
      </div>
    );
  }

  if (contextLost) {
    return (
      <div style={FALLBACK_STYLE}>
        <p>The WebGL context was lost.</p>
        <p style={{ fontSize: '0.9rem', color: '#8899aa' }}>
          This can happen if the GPU driver reset or the tab was backgrounded
          too long. Reload the page to restore the scene.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px',
            padding: '8px 20px',
            background: 'transparent',
            border: '1px solid #c8d8ff',
            color: '#c8d8ff',
            fontFamily: 'serif',
            fontSize: '1rem',
            cursor: 'pointer',
            borderRadius: '4px',
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a2238' }}>
      <div ref={canvasContainerRef} style={{ width: '100%', height: '100%' }}>
        <Canvas
          dpr={[1, 1.5]}
          shadows={false}
          camera={{ fov: 60, near: 0.1, far: 300, position: [0, 1.6, 2] }}
          style={{ width: '100%', height: '100%' }}
        >
          <NightScene />
          <FpsTracker fpsRef={fpsRef} />
        </Canvas>
      </div>
      <FpsCounter fpsRef={fpsRef} />
    </div>
  );
}

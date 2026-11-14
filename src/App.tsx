import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type * as THREE from 'three';
import type { QualityLevel } from './domain';
import { appStore, useAppStore } from './store/appStore';
import NightScene from './world/NightScene';
import { nextQuality, qualityLabel, resolvePreset } from './world/quality';
import QualityNotice from './ui/QualityNotice';
import FpsTracker from './world/FpsTracker';
import FpsCounter from './world/FpsCounter';
import type { RenderStats } from './world/renderStats';
import ControlsHint from './ui/ControlsHint';
import PointerHud from './ui/PointerHud';
import InteractionPrompt from './ui/InteractionPrompt';

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

const NOTICE_MS = 5000;

export default function App() {
  const statsRef = useRef<RenderStats>({ fps: 0, calls: 0 });
  const [webglOk] = useState<boolean>(() => isWebGLAvailable());
  const [contextLost, setContextLost] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quality = useAppStore((state) => state.data.prefs.quality);
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const preset = useMemo(() => resolvePreset(quality, reducedMotion), [quality, reducedMotion]);

  const cycleQuality = useCallback(() => {
    appStore.getState().setQuality(nextQuality(appStore.getState().data.prefs.quality));
  }, []);

  const lowerQualityAutomatically = useCallback((lighter: QualityLevel) => {
    appStore.getState().setQuality(lighter);
    setNotice(`Quality lowered to ${qualityLabel(lighter)} to keep the night smooth.`);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    },
    [],
  );

  /** Tracks the live canvas and reports its context loss. A replaced canvas is ignored. */
  const watchCanvas = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const canvas = gl.domElement;
    liveCanvasRef.current = canvas;
    canvas.addEventListener('webglcontextlost', (event) => {
      if (liveCanvasRef.current !== canvas) return;
      event.preventDefault(); // prevent automatic restore attempt
      setContextLost(true);
    });
  }, []);

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
      <div style={{ width: '100%', height: '100%' }}>
        {/* Antialiasing is fixed when a WebGL context is created, so the canvas is recreated when it changes. */}
        <Canvas
          key={preset.antialias ? 'antialias' : 'plain'}
          dpr={[1, preset.pixelRatioCap]}
          gl={{ antialias: preset.antialias }}
          shadows={false}
          camera={{ fov: 60, near: 0.1, far: 200 }}
          style={{ width: '100%', height: '100%' }}
          onCreated={watchCanvas}
        >
          <NightScene preset={preset} quality={quality} />
          <FpsTracker statsRef={statsRef} quality={quality} onAutoLower={lowerQualityAutomatically} />
        </Canvas>
      </div>
      <FpsCounter statsRef={statsRef} quality={quality} onCycleQuality={cycleQuality} />
      <QualityNotice message={notice} />
      <PointerHud />
      <InteractionPrompt />
      <ControlsHint />
    </div>
  );
}

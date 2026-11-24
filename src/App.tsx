import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type * as THREE from 'three';
import type { QualityLevel } from './domain';
import {
  BookReader,
  BookSequenceDriver,
  ensureBookFont,
  useReadingInput,
  useReadingPhase,
} from './book';
import BurialDriver from './cinematics/BurialDriver';
import ResurrectionDriver from './cinematics/ResurrectionDriver';
import { useResurrecting } from './cinematics/resurrectionSession';
import { attachRitualSession, useRitualNotice, useRitualPhase } from './interaction/ritualSession';
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
import { useDemoProjectsKey } from './ui/useDemoProjectsKey';
import { COPY, qualityLowered } from './ui/copy';
import { Button } from './ui/kit';
import RitualOverlay from './ui/ritual/RitualOverlay';

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

  const ritualPhase = useRitualPhase();
  const ritualNotice = useRitualNotice();
  const resurrecting = useResurrecting();
  const inputLocked = useReadingPhase() !== 'closed' || ritualPhase !== 'idle' || resurrecting;

  useEffect(() => attachRitualSession(), []);

  const hasRestingProject = useAppStore((state) =>
    state.data.projects.some((project) => project.status === 'resting'),
  );
  const fontRequested = useRef(false);
  useEffect(() => {
    if (!hasRestingProject || fontRequested.current) return;
    fontRequested.current = true;
    void ensureBookFont();
  }, [hasRestingProject]);

  useReadingInput();
  useDemoProjectsKey();

  const cycleQuality = useCallback(() => {
    appStore.getState().setQuality(nextQuality(appStore.getState().data.prefs.quality));
  }, []);

  const lowerQualityAutomatically = useCallback((lighter: QualityLevel) => {
    appStore.getState().setQuality(lighter);
    setNotice(qualityLowered(qualityLabel(lighter)));
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
      <div className="kit-screen">
        <p>{COPY.screens.noWebgl}</p>
        <p>{COPY.screens.noWebglHelp}</p>
      </div>
    );
  }

  if (contextLost) {
    return (
      <div className="kit-screen">
        <p>{COPY.screens.contextLost}</p>
        <p>{COPY.screens.contextLostHelp}</p>
        <Button onClick={() => window.location.reload()}>{COPY.screens.reload}</Button>
      </div>
    );
  }

  return (
    <div className="kit-world">
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
          <NightScene preset={preset} quality={quality} inputLocked={inputLocked} />
          <BookSequenceDriver />
          <BurialDriver />
          <ResurrectionDriver />
          <FpsTracker statsRef={statsRef} quality={quality} onAutoLower={lowerQualityAutomatically} />
        </Canvas>
      </div>
      <FpsCounter statsRef={statsRef} quality={quality} onCycleQuality={cycleQuality} />
      <QualityNotice message={ritualNotice ?? notice} />
      <PointerHud />
      <InteractionPrompt inputLocked={inputLocked} />
      <ControlsHint />
      <BookReader />
      <RitualOverlay />
    </div>
  );
}

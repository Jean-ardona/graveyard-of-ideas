import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { summonController } from './summonController';
import type { SummonController } from './summonController';

interface SummonLayerProps {
  /** The controller to draw for. It is the app's one controller unless a test passes another. */
  controller?: SummonController;
}

/**
 * The one 2D canvas of the page motes, mounted once at the app root. It never takes the pointer and is
 * hidden from assistive technology. With reduced animations or calm mode it renders nothing at all.
 * The controller places and sizes it; this component only hands it over and takes it back.
 */
export default function SummonLayer({ controller = summonController }: SummonLayerProps) {
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const calmMode = useAppStore((state) => state.data.prefs.calmMode);
  const still = reducedMotion || calmMode;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (still || element === null) return undefined;
    controller.attachLayer(element);
    return () => controller.detachLayer();
  }, [still, controller]);
  if (still) return null;
  return (
    <canvas
      ref={canvas}
      className="summon-layer"
      aria-hidden="true"
      data-testid="summon-layer"
      style={{ pointerEvents: 'none' }}
    />
  );
}

import type { Prefs } from './types';

/** Which effects may run. Pure data derived from the saved prefs. */
export interface ComfortFlags {
  flashes: boolean;
  shakes: boolean;
  fastMist: boolean;
  /** Speed factor for ambient motion, in (0, 1]. */
  motionScale: number;
}

/** Motion speed while calm mode or reduced animations is on. */
export const COMFORT_MOTION_SCALE = 0.4;

/** Calm mode or reduced animations turns every intense effect off; both off leaves all on. */
export function comfortFlags(prefs: Pick<Prefs, 'calmMode' | 'reducedMotion'>): ComfortFlags {
  const gentle = prefs.calmMode || prefs.reducedMotion;
  return {
    flashes: !gentle,
    shakes: !gentle,
    fastMist: !gentle,
    motionScale: gentle ? COMFORT_MOTION_SCALE : 1,
  };
}

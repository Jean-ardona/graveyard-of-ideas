import type { QualityLevel } from '../domain/types';
import { RETURN_SECONDS } from './cameraTimings';

/**
 * When the specter does what, in seconds of `specterTime`. Data only: no React, Three.js, DOM, store
 * or timers. The resurrection timeline steps are built from these constants, so there is one source.
 */

export { RETURN_SECONDS };

export const SPECTER_PHASES = {
  gather: { start: 0, duration: 2.0 },
  form: { start: 2.0, duration: 1.4 },
  depart: { start: 3.4, duration: 3.4 },
  vanish: { start: 6.8, duration: 1.0 },
} as const;

/** Seconds from the first particle to the last: every alpha is 0 from here on. */
export const SPECTER_TOTAL = 7.8;

/** Seconds of group B: the specter, then the camera's return. */
export const GROUP_B_TOTAL = SPECTER_TOTAL + RETURN_SECONDS;

/** Particles per quality preset; Low is the default. */
export const SPECTER_BUDGET: Readonly<Record<QualityLevel, number>> = {
  low: 400,
  medium: 600,
  high: 800,
};

/** No buffer ever holds more particles than this. */
export const SPECTER_MAX_PARTICLES = 800;

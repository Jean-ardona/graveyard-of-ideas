import { QUALITY_LEVELS } from '../domain';
import type { QualityLevel } from '../domain';

/** Average frame rate under this counts as struggling. */
export const LOW_FPS_THRESHOLD = 30;
/** Seconds of continuous struggling before the quality drops one level. */
export const LOW_FPS_SECONDS = 5;
/** A longer frame means the page was paused or hidden, not slow rendering. */
const MAX_FRAME_SECONDS = 1;

/** One level lighter, or null when already at the lightest. */
export function lowerQuality(quality: QualityLevel): QualityLevel | null {
  const index = QUALITY_LEVELS.indexOf(quality);
  return index > 0 ? QUALITY_LEVELS[index - 1]! : null;
}

/**
 * Seconds the average frame rate has stayed under the threshold.
 * Resets to zero as soon as it recovers or a frame was paused.
 */
export function accumulateLowFps(lowSeconds: number, averageFps: number, deltaSeconds: number): number {
  if (!(deltaSeconds > 0)) return lowSeconds;
  if (deltaSeconds > MAX_FRAME_SECONDS || averageFps >= LOW_FPS_THRESHOLD) return 0;
  return lowSeconds + deltaSeconds;
}

/** The level to drop to once the slow stretch is long enough. Never returns a higher level. */
export function adaptiveDrop(quality: QualityLevel, lowSeconds: number): QualityLevel | null {
  return lowSeconds >= LOW_FPS_SECONDS ? lowerQuality(quality) : null;
}

import { COMFORT_MOTION_SCALE } from '../../domain/comfort';
import type { QualityLevel } from '../../domain/types';

/** Pure data: no React, Three.js, DOM or timers. */

export interface AtmosphereBudget {
  leaves: number;
  spectres: number;
  skulls: number;
  mistPuffs: number;
}

const BUDGETS: Readonly<Record<QualityLevel, AtmosphereBudget>> = {
  low: { leaves: 30, spectres: 3, skulls: 8, mistPuffs: 16 },
  medium: { leaves: 45, spectres: 4, skulls: 12, mistPuffs: 24 },
  high: { leaves: 60, spectres: 5, skulls: 16, mistPuffs: 40 },
};

/** Largest count of translucent sprites and puffs any quality level may use. */
export const MAX_MIST_PUFFS = 40;

/** One switch per atmosphere module. A module that misbehaves on the target machine is turned off here. */
export const MODULE_ENABLED = {
  entrance: true,
  audio: true,
  leaves: true,
  spectres: true,
  lightning: true,
  skulls: true,
  scares: true,
} as const;

export { COMFORT_MOTION_SCALE };

export function atmosphereBudget(quality: QualityLevel): AtmosphereBudget {
  return BUDGETS[quality];
}

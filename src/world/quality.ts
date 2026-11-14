import { QUALITY_LEVELS } from '../domain';
import type { QualityLevel } from '../domain';

/** Everything the scene needs to size itself for one quality level. Plain data. */
export interface QualityPreset {
  pixelRatioCap: number;
  starCount: number;
  mistLayers: number;
  treeCount: number;
  stoneCount: number;
  /** Reserved for future embers and smoke. */
  particleBudget: number;
  fogFar: number;
  antialias: boolean;
}

export const DEFAULT_QUALITY: QualityLevel = 'low';

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: {
    pixelRatioCap: 1,
    starCount: 60,
    mistLayers: 2,
    treeCount: 6,
    stoneCount: 12,
    particleBudget: 60,
    fogFar: 40,
    antialias: false,
  },
  medium: {
    pixelRatioCap: 1.25,
    starCount: 110,
    mistLayers: 4,
    treeCount: 9,
    stoneCount: 20,
    particleBudget: 150,
    fogFar: 50,
    antialias: false,
  },
  high: {
    pixelRatioCap: 1.5,
    starCount: 150,
    mistLayers: 5,
    treeCount: 12,
    stoneCount: 28,
    particleBudget: 300,
    fogFar: 60,
    antialias: true,
  },
};

/** Reduced motion keeps the preset but halves the particle budget. */
export function resolvePreset(quality: QualityLevel, reducedMotion: boolean): QualityPreset {
  const preset = QUALITY_PRESETS[quality];
  if (!reducedMotion) return preset;
  return { ...preset, particleBudget: Math.floor(preset.particleBudget / 2) };
}

/** The level after this one, wrapping from the heaviest back to the lightest. */
export function nextQuality(quality: QualityLevel): QualityLevel {
  const index = QUALITY_LEVELS.indexOf(quality);
  return QUALITY_LEVELS[(index + 1) % QUALITY_LEVELS.length]!;
}

export function qualityLabel(quality: QualityLevel): string {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

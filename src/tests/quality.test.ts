import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { exportData, QUALITY_LEVELS } from '../domain';
import type { QualityLevel } from '../domain';
import { STORAGE_KEY, createGraveyardStore, type StorageLike } from '../store';
import { emptyData } from '../store/persistence';
import {
  LOW_FPS_SECONDS,
  LOW_FPS_THRESHOLD,
  accumulateLowFps,
  adaptiveDrop,
  lowerQuality,
} from '../world/adaptiveQuality';
import { DEFAULT_QUALITY, QUALITY_PRESETS, nextQuality, resolvePreset } from '../world/quality';

class MemoryStorage implements StorageLike {
  items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const qualityArb = fc.constantFrom<QualityLevel>(...QUALITY_LEVELS);

describe('quality presets', () => {
  it('defaults to Low', () => {
    expect(DEFAULT_QUALITY).toBe('low');
    expect(emptyData().prefs.quality).toBe('low');
  });

  it('uses the specified pixel ratio caps and particle budgets', () => {
    expect(QUALITY_LEVELS.map((q) => QUALITY_PRESETS[q].pixelRatioCap)).toEqual([1, 1.25, 1.5]);
    expect(QUALITY_LEVELS.map((q) => QUALITY_PRESETS[q].particleBudget)).toEqual([60, 150, 300]);
  });

  it('never gets heavier going down a level', () => {
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const light = QUALITY_PRESETS[QUALITY_LEVELS[i - 1]!];
      const heavy = QUALITY_PRESETS[QUALITY_LEVELS[i]!];
      for (const key of ['starCount', 'mistLayers', 'treeCount', 'stoneCount', 'fogFar'] as const) {
        expect(light[key]).toBeLessThanOrEqual(heavy[key]);
      }
    }
  });
});

describe('resolvePreset', () => {
  it('returns the preset unchanged without reduced motion', () => {
    for (const quality of QUALITY_LEVELS) {
      expect(resolvePreset(quality, false)).toEqual(QUALITY_PRESETS[quality]);
    }
  });

  it('lowers only the particle budget with reduced motion', () => {
    fc.assert(
      fc.property(qualityArb, (quality) => {
        const base = QUALITY_PRESETS[quality];
        const reduced = resolvePreset(quality, true);
        expect(reduced.particleBudget).toBeLessThan(base.particleBudget);
        expect(reduced).toEqual({ ...base, particleBudget: reduced.particleBudget });
      }),
    );
  });

  it('does not mutate the shared presets', () => {
    const before = JSON.stringify(QUALITY_PRESETS);
    resolvePreset('high', true);
    expect(JSON.stringify(QUALITY_PRESETS)).toBe(before);
  });

  it('cycles low, medium, high and wraps', () => {
    expect(nextQuality('low')).toBe('medium');
    expect(nextQuality('medium')).toBe('high');
    expect(nextQuality('high')).toBe('low');
  });
});

describe('adaptive quality', () => {
  it('lowers one level at a time and stops at Low', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });

  it('accumulates slow time and resets when the frame rate recovers', () => {
    let seconds = 0;
    seconds = accumulateLowFps(seconds, LOW_FPS_THRESHOLD - 1, 0.5);
    seconds = accumulateLowFps(seconds, LOW_FPS_THRESHOLD - 1, 0.5);
    expect(seconds).toBeCloseTo(1);
    expect(accumulateLowFps(seconds, LOW_FPS_THRESHOLD, 0.5)).toBe(0);
  });

  it('treats a very long frame as a pause, not as slowness', () => {
    expect(accumulateLowFps(4, 1, 3)).toBe(0);
  });

  it('drops only after the full window of slowness', () => {
    expect(adaptiveDrop('high', LOW_FPS_SECONDS - 0.01)).toBeNull();
    expect(adaptiveDrop('high', LOW_FPS_SECONDS)).toBe('medium');
    expect(adaptiveDrop('medium', LOW_FPS_SECONDS)).toBe('low');
  });

  it('never drops below Low and never raises, whatever the history', () => {
    fc.assert(
      fc.property(
        qualityArb,
        fc.array(fc.tuple(fc.double({ min: 0, max: 120, noNaN: true }), fc.double({ min: 0.001, max: 2, noNaN: true })), {
          maxLength: 400,
        }),
        (quality, frames) => {
          let seconds = 0;
          for (const [fps, delta] of frames) {
            seconds = accumulateLowFps(seconds, fps, delta);
            const next = adaptiveDrop(quality, seconds);
            if (quality === 'low') expect(next).toBeNull();
            if (next !== null) {
              expect(QUALITY_LEVELS.indexOf(next)).toBe(QUALITY_LEVELS.indexOf(quality) - 1);
            }
          }
        },
      ),
    );
  });

  it('decides to drop after 5 seconds under 30 fps on Medium or High, not on healthy frames', () => {
    const frame = 0.25; // exactly representable, so the sum is exactly 5 after 20 frames
    let slow = 0;
    let healthy = 0;
    for (let i = 0; i < 5 / frame; i++) {
      slow = accumulateLowFps(slow, 20, frame);
      healthy = accumulateLowFps(healthy, 60, frame);
    }
    expect(adaptiveDrop('medium', slow)).toBe('low');
    expect(adaptiveDrop('high', slow)).toBe('medium');
    expect(adaptiveDrop('high', healthy)).toBeNull();
  });
});

describe('quality preference persistence', () => {
  function storageWith(quality: QualityLevel): MemoryStorage {
    const storage = new MemoryStorage();
    storage.items.set(
      STORAGE_KEY,
      exportData({ ...emptyData(), seeded: true, prefs: { quality, reducedMotion: false } }),
    );
    return storage;
  }

  it('starts on Low when nothing was saved', () => {
    expect(createGraveyardStore(new MemoryStorage()).getState().data.prefs.quality).toBe('low');
  });

  it('restores the saved level after a reload', () => {
    expect(createGraveyardStore(storageWith('high')).getState().data.prefs.quality).toBe('high');
  });

  it('setQuality changes the level, keeps the other prefs and exports it', () => {
    const storage = storageWith('low');
    const store = createGraveyardStore(storage);
    store.getState().setQuality('medium');
    expect(store.getState().data.prefs).toEqual({ quality: 'medium', reducedMotion: false });
    storage.items.set(STORAGE_KEY, store.getState().exportJson());
    expect(createGraveyardStore(storage).getState().data.prefs.quality).toBe('medium');
  });

  it('ignores unknown levels and unchanged levels', () => {
    const store = createGraveyardStore(storageWith('low'));
    const before = store.getState().data;
    store.getState().setQuality('ultra' as QualityLevel);
    store.getState().setQuality('low');
    expect(store.getState().data).toBe(before);
  });
});

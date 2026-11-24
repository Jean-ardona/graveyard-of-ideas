/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { createLecternAssets } from '../world/lecternAssets';
import { createQuillAssets } from '../world/quillAssets';

const SOURCES = import.meta.glob<string>(['../world/Quill.tsx', '../world/quillAssets.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('quill on the lectern', () => {
  it('has one merged geometry and one material, each disposed exactly once', () => {
    const assets = createQuillAssets();
    const geometry = vi.spyOn(assets.geometry, 'dispose');
    const material = vi.spyOn(assets.material, 'dispose');
    assets.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });

  it('is a separate small object from the lectern, with its own resources', () => {
    const quill = createQuillAssets();
    const lectern = createLecternAssets();
    expect(quill.geometry).not.toBe(lectern.geometry);
    expect(quill.material).not.toBe(lectern.material);
    quill.dispose();
    lectern.dispose();
  });

  it('adds no light, no shadow caster and no per-frame work, and hides while the ritual runs', () => {
    const entries = Object.entries(SOURCES);
    expect(entries).toHaveLength(2);
    for (const [file, source] of entries) {
      expect(source, file).not.toMatch(/castShadow|receiveShadow/);
      expect(source, file).not.toMatch(/[Ll]ight\b/);
      expect(source, file).not.toMatch(/useFrame/);
    }
    const component = SOURCES['../world/Quill.tsx'] as string;
    expect(component).toMatch(/useRitualPhase\(\) !== 'idle'/);
    expect(component).toMatch(/visible=\{!ritualRunning\}/);
    expect(component).toMatch(/useDisposable\(createQuillAssets\)/);
  });
});

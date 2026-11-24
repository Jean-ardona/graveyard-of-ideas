/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getColliders } from '../interaction/colliderRegistry';
import { getInteractables } from '../interaction/interactionState';
import { COPY } from '../ui/copy';
import { COLLIDERS } from '../world/config';
import { createLecternAssets } from '../world/lecternAssets';
import { LECTERN_COLLIDER, LECTERN_ID, registerLectern } from '../world/lecternLogic';

const SOURCES = import.meta.glob<string>(
  ['../world/Lectern.tsx', '../world/lecternAssets.ts', '../world/lecternLogic.ts'],
  { query: '?raw', import: 'default', eager: true },
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lectern in the world', () => {
  it('shares one geometry and one material and disposes both once', () => {
    const assets = createLecternAssets();
    const geometry = vi.spyOn(assets.geometry, 'dispose');
    const material = vi.spyOn(assets.material, 'dispose');
    assets.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });

  it('registers a collider and the ritual prompt, and removes both again', () => {
    const remove = registerLectern(0);
    expect(getColliders()).toContain(LECTERN_COLLIDER);
    const item = getInteractables().find((candidate) => candidate.id === LECTERN_ID);
    expect(item?.label).toBe(COPY.ritual.promptLabel);
    expect(`${COPY.prompts.key}${item?.label}`.replace('—', '-')).toBe(COPY.ritual.prompt);
    remove();
    expect(getColliders()).toHaveLength(COLLIDERS.length);
    expect(getInteractables().some((candidate) => candidate.id === LECTERN_ID)).toBe(false);
  });

  it('adds no light and no shadow caster', () => {
    expect(Object.keys(SOURCES)).toHaveLength(3);
    for (const [file, source] of Object.entries(SOURCES)) {
      expect(source, file).not.toMatch(/castShadow|receiveShadow/);
      expect(source, file).not.toMatch(/[Ll]ight\b/);
      expect(source, file).not.toMatch(/useFrame/);
    }
  });
});

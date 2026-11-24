/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBookAssets } from '../book/bookAssets';
import type { BookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { BURIAL_GLOW_COLOR, createBookReveal, createBurialGlow } from '../cinematics/burialAssets';
import { isAmberHue } from '../ui/theme/colorMath';

const SOURCES = import.meta.glob<string>(['../cinematics/burial*.ts', '../cinematics/BurialDriver.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

let assets: BookAssets;
let handle: BookHandle;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  assets = createBookAssets();
  const model = createBookModel(assets);
  handle = { id: 'p1', root: model.root, parts: model.parts, leaves: model.leaves };
});

afterEach(() => {
  assets.dispose();
  vi.restoreAllMocks();
});

function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const found: THREE.Material[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(...[object.material].flat());
  });
  return found;
}

describe('burial glow', () => {
  it('is one additive sprite in a pale blue-white outside the amber range, with no light', () => {
    const glow = createBurialGlow();
    expect(glow.sprite).toBeInstanceOf(THREE.Sprite);
    expect(glow.material.blending).toBe(THREE.AdditiveBlending);
    expect(glow.material.depthWrite).toBe(false);
    expect(isAmberHue(BURIAL_GLOW_COLOR)).toBe(false);
    expect(isAmberHue(`#${glow.material.color.getHexString()}`)).toBe(false);
    expect(glow.material.color.b).toBeGreaterThanOrEqual(glow.material.color.r);
    expect((glow.sprite as unknown as THREE.Light).isLight).not.toBe(true);
    expect(glow.sprite.castShadow).toBe(false);
    glow.dispose();
  });

  it('follows the glow progress and stays within 0 and 1', () => {
    const glow = createBurialGlow();
    glow.apply(0);
    expect(glow.sprite.visible).toBe(false);
    glow.apply(1);
    expect(glow.sprite.visible).toBe(true);
    expect(glow.material.opacity).toBeGreaterThan(0);
    expect(glow.material.opacity).toBeLessThanOrEqual(1);
    glow.apply(Number.NaN);
    expect(glow.material.opacity).toBe(0);
    glow.apply(9);
    expect(glow.material.opacity).toBeLessThanOrEqual(1);
    glow.dispose();
  });

  it('removes the sprite and disposes the material and the texture exactly once', () => {
    const scene = new THREE.Scene();
    const glow = createBurialGlow();
    scene.add(glow.sprite);
    const material = vi.spyOn(glow.material, 'dispose');
    const texture = vi.spyOn(glow.texture, 'dispose');
    glow.dispose();
    glow.dispose();
    expect(scene.children).toHaveLength(0);
    expect(material).toHaveBeenCalledTimes(1);
    expect(texture).toHaveBeenCalledTimes(1);
  });
});

describe('book reveal', () => {
  it('works on clones, tints pale (never amber), and puts the shared materials back', () => {
    const originals = materialsOf(handle.root);
    const reveal = createBookReveal(handle);
    const clones = materialsOf(handle.root);
    expect(clones).toHaveLength(originals.length);
    clones.forEach((clone) => expect(originals).not.toContain(clone));
    reveal.apply(0.5, 1);
    expect(handle.root.visible).toBe(true);
    for (const clone of clones) {
      expect(clone.opacity).toBe(0.5);
      if (clone instanceof THREE.MeshStandardMaterial) {
        expect(isAmberHue(`#${clone.emissive.getHexString()}`)).toBe(false);
      }
    }
    reveal.dispose();
    expect(materialsOf(handle.root)).toEqual(originals);
  });

  it('is hidden at progress 0 and disposes every clone exactly once', () => {
    const count = materialsOf(handle.root).length;
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const reveal = createBookReveal(handle);
    reveal.apply(0, 0);
    expect(handle.root.visible).toBe(false);
    reveal.dispose();
    reveal.dispose();
    expect(material).toHaveBeenCalledTimes(count);
  });
});

describe('burial sources', () => {
  it('add no light and no shadow caster', () => {
    const entries = Object.entries(SOURCES);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const [file, source] of entries) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\b(PointLight|SpotLight|DirectionalLight|AmbientLight|HemisphereLight|pointLight|spotLight)\b/);
      expect(code, file).not.toMatch(/castShadow|receiveShadow|EffectComposer|postprocessing/i);
    }
  });

  it('keep amber out of the burial colors', () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      expect(source, file).not.toMatch(/TOKENS\.ember|#ff[0-9a-f]{4}/i);
    }
  });
});

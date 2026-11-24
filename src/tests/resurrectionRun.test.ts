/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBookAssets } from '../book/bookAssets';
import type { BookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { createResurrectionRun } from '../cinematics/resurrectionRun';
import type { ResurrectionRun } from '../cinematics/resurrectionRun';
import { BOOK_PARTS } from '../cinematics/resurrectionTimeline';
import { RESURRECTION_BUDGET } from '../cinematics/resurrectionVisuals';
import { isAmberHue } from '../ui/theme/colorMath';
import type { TombDescriptor } from '../world/tombLogic';

const SOURCES = import.meta.glob<string>(['../cinematics/*.{ts,tsx}', '!../cinematics/index.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const TOMB: TombDescriptor = { id: 'p1', slot: 0, shape: 'rounded', title: 'Moss', x: 4, z: -6, rotation: 0.5, lean: 0, label: 'Open Moss' };

let assets: BookAssets;
let handle: BookHandle;
let scene: THREE.Scene;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  assets = createBookAssets();
  const model = createBookModel(assets);
  handle = { id: TOMB.id, root: model.root, parts: model.parts, leaves: model.leaves };
  scene = new THREE.Scene();
  scene.add(model.root);
});

afterEach(() => {
  assets.dispose();
  vi.restoreAllMocks();
});

function meshesOf(part: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  part.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

function play(run: ResurrectionRun, seconds: number, step = 0.05, onFrame?: () => void): boolean {
  let done = false;
  for (let t = 0; t < seconds && !done; t += step) {
    done = run.tick(step);
    onFrame?.();
  }
  return done;
}

function start(instant = false, quality: 'low' | 'medium' | 'high' = 'low'): ResurrectionRun {
  return createResurrectionRun({ scene, tomb: TOMB, book: handle, quality, instant });
}

describe('resurrection run', () => {
  it('dissolves all four parts, seven meshes in all, before the specter shows', () => {
    expect(BOOK_PARTS.map((name) => meshesOf(handle.parts[name]).length)).toEqual([1, 1, 2, 3]);
    const run = start();
    let specterSeenWithBook = false;
    const done = play(run, 20, 0.05, () => {
      const bookVisible = BOOK_PARTS.some((name) => handle.parts[name].visible);
      if (run.assets.specter.visible && bookVisible) specterSeenWithBook = true;
      if (run.assets.smokeMaterial.opacity > 0 && bookVisible) specterSeenWithBook = true;
    });
    expect(done).toBe(true);
    expect(specterSeenWithBook).toBe(false);
    expect(BOOK_PARTS.every((name) => !handle.parts[name].visible)).toBe(true);
    run.dispose();
  });

  it('burns amber, never blue, on its own clones and leaves the shared materials alone', () => {
    const sharedBefore = [assets.coverMaterial, assets.spineMaterial, assets.leafMaterial].map((m) =>
      m instanceof THREE.MeshStandardMaterial ? m.emissive.getHexString() : '',
    );
    const run = start();
    const clones = new Set<THREE.Material>();
    play(run, 1.2, 0.05, () => {
      for (const name of BOOK_PARTS) {
        for (const mesh of meshesOf(handle.parts[name])) {
          for (const material of [mesh.material].flat()) {
            expect([assets.coverMaterial, assets.spineMaterial, assets.leafMaterial, assets.pageBlockMaterial]).not.toContain(material);
            clones.add(material);
            if (material instanceof THREE.MeshStandardMaterial) {
              expect(material.emissive.r).toBeGreaterThanOrEqual(material.emissive.b);
              expect(isAmberHue(`#${material.emissive.getHexString()}`)).toBe(true);
            }
          }
        }
      }
    });
    expect(clones.size).toBeGreaterThan(0);
    const embers = run.assets.emberPoints.geometry.getAttribute('color');
    for (let i = 0; i < embers.count; i++) expect(embers.getX(i)).toBeGreaterThanOrEqual(embers.getZ(i));
    run.dispose();
    const sharedAfter = [assets.coverMaterial, assets.spineMaterial, assets.leafMaterial].map((m) =>
      m instanceof THREE.MeshStandardMaterial ? m.emissive.getHexString() : '',
    );
    expect(sharedAfter).toEqual(sharedBefore);
  });

  it('adds no light and no shadow caster, and keeps Low smaller than High', () => {
    const run = start();
    run.assets.group.traverse((object) => {
      expect((object as THREE.Light).isLight).not.toBe(true);
      expect(object.castShadow).toBe(false);
    });
    expect(run.assets.embers.count).toBe(RESURRECTION_BUDGET.low.embers);
    expect(run.assets.puffs).toHaveLength(RESURRECTION_BUDGET.low.puffs);
    run.dispose();
    const high = start(false, 'high');
    expect(high.assets.embers.count).toBe(RESURRECTION_BUDGET.high.embers);
    high.dispose();
  });

  it('removes and disposes every temporary object exactly once, and puts the shared materials back', () => {
    const originals = BOOK_PARTS.flatMap((name) => meshesOf(handle.parts[name]).map((mesh) => mesh.material));
    const meshCount = originals.flat().length;
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const children = scene.children.length;

    const run = start();
    expect(scene.children).toHaveLength(children + 1);
    expect(run.assets.group.position.x).toBe(TOMB.x);
    expect(play(run, 20)).toBe(true);
    run.dispose();
    run.dispose();

    expect(scene.children).toHaveLength(children);
    expect(geometry).toHaveBeenCalledTimes(1);
    // Ember points, smoke and specter materials, plus one clone for every material slot of the book.
    expect(material).toHaveBeenCalledTimes(3 + meshCount);
    // The glow texture (embers and smoke share it) and the specter texture.
    expect(texture).toHaveBeenCalledTimes(2);
    const restored = BOOK_PARTS.flatMap((name) => meshesOf(handle.parts[name]).map((mesh) => mesh.material));
    expect(restored).toEqual(originals);
  });

  it('reaches the end in one tick with reduced motion and is over for any later tick', () => {
    const run = start(true);
    expect(run.tick(0.016)).toBe(true);
    expect(run.assets.specter.visible).toBe(false);
    expect(run.assets.smokeMaterial.opacity).toBe(0);
    run.dispose();
    expect(run.tick(0.016)).toBe(true);
  });
});

describe('resurrection sources', () => {
  it('add no light, shadow caster or post-processing', () => {
    const entries = Object.entries(SOURCES).filter(([file]) => /resurrection|bookDissolve/i.test(file));
    expect(entries.length).toBeGreaterThanOrEqual(7);
    for (const [file, source] of entries) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\b(PointLight|SpotLight|DirectionalLight|AmbientLight|HemisphereLight|pointLight|spotLight)\b/);
      expect(code, file).not.toMatch(/castShadow|receiveShadow|EffectComposer|postprocessing/i);
    }
  });

  it('keeps the pure modules free of React, Three.js, DOM and timers', () => {
    for (const name of ['resurrectionTimeline', 'resurrectionVisuals']) {
      const source = Object.entries(SOURCES).find(([file]) => file.endsWith(`/${name}.ts`))?.[1] ?? '';
      expect(source, name).not.toBe('');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/from\s+['"](react|react-dom|three|@react-three\/[^'"]*)['"]/);
      expect(code, name).not.toMatch(/\b(window|document|setTimeout|setInterval|requestAnimationFrame|performance)\b/);
    }
  });

  it('allocates nothing inside the frame callback of the driver or the run tick', () => {
    const driver = Object.entries(SOURCES).find(([file]) => file.endsWith('/ResurrectionDriver.tsx'))?.[1] ?? '';
    const frame = /useFrame\(\(_, delta\) => \{([\s\S]*?)\r?\n  \}\);/.exec(driver)?.[1] ?? '';
    expect(frame).not.toBe('');
    expect(frame).not.toMatch(/\bnew\b|\[|\{|\.map\(|\.filter\(|\.slice\(|\.clone\(/);
    const run = Object.entries(SOURCES).find(([file]) => file.endsWith('/resurrectionRun.ts'))?.[1] ?? '';
    const write = /function write\(\): void \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  write\(\);/.exec(run)?.[1] ?? '';
    expect(write).not.toBe('');
    expect(write).not.toMatch(/\bnew\b|\.map\(|\.filter\(|\.slice\(|\.clone\(|\.concat\(/);
  });
});

/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

/** Counts the run's calls into the camera override; the flag itself is the real one. */
const overrideCalls = vi.hoisted(() => ({ claim: 0, release: 0 }));

vi.mock('../interaction/cameraOverride', async (importOriginal) => {
  const real = await importOriginal<typeof import('../interaction/cameraOverride')>();
  return {
    ...real,
    claimCamera: () => {
      overrideCalls.claim += 1;
      real.claimCamera();
    },
    releaseCamera: () => {
      overrideCalls.release += 1;
      real.releaseCamera();
    },
  };
});

// Frozen: any write by the run throws (modules are strict), so the run can only read the player's pose.
vi.mock('../interaction/playerSession', () => ({
  playerSession: Object.freeze({ x: 4 + 2 * Math.sin(0.5), z: -6 + 2 * Math.cos(0.5), yaw: 2.1, pitch: -0.2 }),
}));
import { createBookAssets } from '../book/bookAssets';
import type { BookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import type { BookHandle } from '../book/bookHandles';
import { createResurrectionRun } from '../cinematics/resurrectionRun';
import type { ResurrectionRun } from '../cinematics/resurrectionRun';
import { BOOK_PARTS } from '../cinematics/resurrectionTimeline';
import { RESURRECTION_BUDGET } from '../cinematics/resurrectionVisuals';
import * as VISUALS from '../cinematics/resurrectionVisuals';
import { GROUP_B_TOTAL, SPECTER_BUDGET, SPECTER_MAX_PARTICLES, SPECTER_TOTAL } from '../cinematics/specterTimings';
import { isCameraClaimed, releaseCamera } from '../interaction/cameraOverride';
import { playerSession } from '../interaction/playerSession';
import { isAmberHue } from '../ui/theme/colorMath';
import type { TombDescriptor } from '../world/tombLogic';

const SOURCES = import.meta.glob<string>(['../cinematics/*.{ts,tsx}', '!../cinematics/index.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const ALL_SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../tests/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const TOMB: TombDescriptor = { id: 'p1', slot: 0, shape: 'rounded', title: 'Moss', x: 4, z: -6, rotation: 0.5, lean: 0, label: 'Open Moss' };

/** The camera's pose when the run starts: the player's eye, in front of the tomb, looking away from it. */
const EYE = { x: playerSession.x, y: 1.9, z: playerSession.z };

let assets: BookAssets;
let handle: BookHandle;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
  assets = createBookAssets();
  const model = createBookModel(assets);
  handle = { id: TOMB.id, root: model.root, parts: model.parts, leaves: model.leaves };
  scene = new THREE.Scene();
  scene.add(model.root);
  camera = new THREE.PerspectiveCamera();
  camera.rotation.order = 'YXZ';
  camera.position.set(EYE.x, EYE.y, EYE.z);
  camera.rotation.set(playerSession.pitch, playerSession.yaw, 0);
  overrideCalls.claim = 0;
  overrideCalls.release = 0;
});

afterEach(() => {
  assets.dispose();
  releaseCamera();
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
  return createResurrectionRun({ scene, camera, tomb: TOMB, book: handle, quality, instant });
}

function expectCameraAtPlayer(): void {
  expect(camera.position.toArray()).toEqual([EYE.x, EYE.y, EYE.z]);
  expect(camera.rotation.y).toBe(playerSession.yaw);
  expect(camera.rotation.x).toBe(playerSession.pitch);
  expect(camera.rotation.z).toBe(0);
}

describe('resurrection camera follow in the run', () => {
  it('claims the camera at the start and releases it once at the natural end', () => {
    const run = start();
    expect(overrideCalls.claim).toBe(1);
    expect(isCameraClaimed()).toBe(true);
    let turned = false;
    const done = play(run, 20, 0.05, () => {
      if (!run.effects.done) expect(isCameraClaimed()).toBe(true);
      if (Math.abs(camera.rotation.y - playerSession.yaw) > 0.01) turned = true;
    });
    expect(done).toBe(true);
    expect(turned).toBe(true);
    expect(isCameraClaimed()).toBe(false);
    expect(overrideCalls.release).toBe(1);
    expectCameraAtPlayer();
    run.dispose();
    run.dispose();
    expect(overrideCalls.release).toBe(1);
  });

  it('never moves the camera position and keeps the player pose while group B is closed', () => {
    const run = start();
    play(run, 20, 0.05, () => {
      expect(camera.position.toArray()).toEqual([EYE.x, EYE.y, EYE.z]);
      if (run.progress.groupBTime === 0) expectCameraAtPlayer();
    });
    run.dispose();
  });

  it('releases on skip with the camera at the player pose', () => {
    const run = start();
    play(run, 6, 0.05);
    expect(run.progress.groupBTime).toBeGreaterThan(0);
    run.skip();
    expect(isCameraClaimed()).toBe(false);
    expect(overrideCalls.release).toBe(1);
    expectCameraAtPlayer();
    run.dispose();
    expect(overrideCalls.release).toBe(1);
  });

  it('releases on dispose mid-run (unmount) and writes the camera no more', () => {
    const run = start();
    play(run, 6, 0.05);
    run.dispose();
    expect(isCameraClaimed()).toBe(false);
    expect(overrideCalls.release).toBe(1);
    camera.rotation.set(0.1, 0.2, 0);
    run.tick(0.05);
    run.skip();
    expect(camera.rotation.x).toBe(0.1);
    expect(camera.rotation.y).toBe(0.2);
  });

  it('never writes the player session', () => {
    expect(Object.isFrozen(playerSession)).toBe(true);
    const before = { ...playerSession };
    const run = start();
    expect(play(run, 20)).toBe(true);
    run.dispose();
    const skipped = start();
    play(skipped, 5);
    skipped.skip();
    skipped.dispose();
    expect({ ...playerSession }).toEqual(before);
  });

  it('with reduced motion or calm mode never claims or moves the camera', () => {
    camera.rotation.set(0.25, -1.5, 0);
    const run = start(true);
    expect(run.tick(0.016)).toBe(true);
    run.skip();
    run.dispose();
    expect(overrideCalls.claim).toBe(0);
    expect(overrideCalls.release).toBe(0);
    expect(isCameraClaimed()).toBe(false);
    expect(camera.position.toArray()).toEqual([EYE.x, EYE.y, EYE.z]);
    expect(camera.rotation.x).toBe(0.25);
    expect(camera.rotation.y).toBe(-1.5);
  });
});

describe('resurrection run', () => {
  it('dissolves all four parts, seven meshes in all, before group B opens', () => {
    expect(BOOK_PARTS.map((name) => meshesOf(handle.parts[name]).length)).toEqual([1, 1, 2, 3]);
    const run = start();
    let groupBWithBook = false;
    const done = play(run, 20, 0.05, () => {
      const bookVisible = BOOK_PARTS.some((name) => handle.parts[name].visible);
      if (run.progress.groupBTime > 0 && bookVisible) groupBWithBook = true;
    });
    expect(done).toBe(true);
    expect(groupBWithBook).toBe(false);
    expect(run.progress.groupBTime).toBe(GROUP_B_TOTAL);
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
    // Ember geometry and specter geometry.
    expect(geometry).toHaveBeenCalledTimes(2);
    // The ember and specter points materials, plus one clone for every material slot of the book.
    expect(material).toHaveBeenCalledTimes(2 + meshCount);
    // The glow texture of the embers (no 2D context here, so the specter has no dot texture).
    expect(texture).toHaveBeenCalledTimes(1);
    const restored = BOOK_PARTS.flatMap((name) => meshesOf(handle.parts[name]).map((mesh) => mesh.material));
    expect(restored).toEqual(originals);
  });

  it('reaches the end in one tick with reduced motion and is over for any later tick', () => {
    const run = start(true);
    expect(run.tick(0.016)).toBe(true);
    expect(run.progress.groupBTime).toBe(GROUP_B_TOTAL);
    expect(run.progress.specterTime).toBe(SPECTER_TOTAL);
    expect(Array.from(run.assets.embers.colors).every((value) => value === 0)).toBe(true);
    // No specter at all: no object, no seeds, no buffers; only the embers are in the group.
    expect(run.assets.specter).toBeNull();
    expect(run.assets.specterSeeds).toBeNull();
    expect(run.assets.specterBuffers).toBeNull();
    expect(run.assets.group.children).toHaveLength(1);
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

  it('draws the specter as one Points object, hidden before group B opens and after the end', () => {
    const run = start();
    const specter = run.assets.specter;
    expect(specter).not.toBeNull();
    expect(run.assets.group.children).toHaveLength(2);
    expect(run.assets.group.children.every((child) => child instanceof THREE.Points)).toBe(true);
    let shownBeforeGroupB = false;
    let shownDuringGroupB = false;
    const done = play(run, 20, 0.05, () => {
      if (specter!.points.visible && run.progress.groupBTime === 0) shownBeforeGroupB = true;
      if (specter!.points.visible && run.progress.specterTime > 0) shownDuringGroupB = true;
    });
    expect(done).toBe(true);
    expect(shownBeforeGroupB).toBe(false);
    expect(shownDuringGroupB).toBe(true);
    expect(specter!.points.visible).toBe(false);
    run.dispose();
  });

  it('sizes the specter by quality from the budget constants', () => {
    const counts = (['low', 'medium', 'high'] as const).map((quality) => {
      const run = start(false, quality);
      const count = run.assets.specterBuffers!.count;
      run.dispose();
      return count;
    });
    expect(counts).toEqual([SPECTER_BUDGET.low, SPECTER_BUDGET.medium, SPECTER_BUDGET.high]);
    expect(Math.max(...counts)).toBeLessThanOrEqual(SPECTER_MAX_PARTICLES);
  });

  it('has no trace of the old flat specter, smoke sprites or their step names', () => {
    const entries = Object.entries(ALL_SOURCES);
    expect(entries.length).toBeGreaterThan(50);
    for (const [file, source] of entries) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(
        /\b(writeSmoke|writeSpecterPose|SpecterPose|createSpecterPose|createSpecterTexture|createSmokeField|SmokeField)\b/,
      );
      expect(code, file).not.toMatch(
        /\bSPECTER_(START_HEIGHT|RISE_HEIGHT|FLY_DISTANCE|FLY_CLIMB|FADE_DRIFT|SIZE|MAX_OPACITY)\b/,
      );
    }
    const timeline = Object.entries(SOURCES).find(([file]) => file.endsWith('/resurrectionTimeline.ts'))?.[1] ?? '';
    expect(timeline).not.toBe('');
    expect(timeline).not.toMatch(/['"](smoke|rise|fly|fade)['"]/);
    expect(Object.keys(VISUALS).sort()).toEqual(
      ['RESURRECTION_BUDGET', 'createEmberField', 'writeEmbers'].sort(),
    );
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

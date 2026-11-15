/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LEAF_FRAME, createBookAssets } from '../book/bookAssets';
import { createBookModel } from '../book/bookModel';
import {
  BOARD_THICKNESS,
  COVER_PIVOT_Z,
  LEAF_COUNT,
  LEAF_THICKNESS,
  leafHingeAngle,
  leafHingeZ,
  restLeafZ,
  turnedLeafAngle,
  turnedLeafZ,
} from '../book/bookStack';
import { COVER_OPEN_ANGLE, LEAF_CURL } from '../book/bookTimings';
import {
  beginLeafCurl,
  createLeafCurlMesh,
  curlHingeRotation,
  disposeLeafCurlMesh,
  endLeafCurl,
  writeLeafCurl,
} from '../book/leafCurlMesh';
import type { LeafCurlMesh } from '../book/leafCurlMesh';
import driverSource from '../book/BookSequenceDriver.tsx?raw';
import curlMeshSource from '../book/leafCurlMesh.ts?raw';

const assets = createBookAssets();
const curls: LeafCurlMesh[] = [];

function makeCurl(): LeafCurlMesh {
  const curl = createLeafCurlMesh();
  curls.push(curl);
  return curl;
}

afterEach(() => {
  curls.splice(0).forEach(disposeLeafCurlMesh);
});

function leafMeshes(model: ReturnType<typeof createBookModel>): THREE.Mesh[] {
  return model.leaves.map((leaf) => leaf.children[0] as THREE.Mesh);
}

describe('curl geometry', () => {
  it('is two strips of 13 by 2 vertices with index, uv and dynamic buffers built once', () => {
    const curl = makeCurl();
    const { geometry } = curl;
    expect(LEAF_CURL.segments).toBe(12);
    expect(geometry.getAttribute('position').count).toBe(2 * 13 * 2);
    expect(geometry.getAttribute('normal').count).toBe(52);
    expect(geometry.getAttribute('uv').count).toBe(52);
    expect(geometry.index?.count).toBe(12 * 12);
    expect(curl.positionAttribute.usage).toBe(THREE.DynamicDrawUsage);
    expect(curl.normalAttribute.usage).toBe(THREE.DynamicDrawUsage);
  });

  it('keeps the same buffer arrays across writes', () => {
    const curl = makeCurl();
    const positions = curl.geometry.getAttribute('position').array;
    const normals = curl.geometry.getAttribute('normal').array;
    for (const fraction of [0.2, 0.5, 0.9, 0.1]) writeLeafCurl(curl, fraction);
    expect(curl.geometry.getAttribute('position').array).toBe(positions);
    expect(curl.geometry.getAttribute('normal').array).toBe(normals);
    expect(curl.positions).toBe(positions);
  });

  it('writes nothing when the fraction is unchanged and flags both attributes when it changes', () => {
    const curl = makeCurl();
    expect(writeLeafCurl(curl, 0.4)).toBe(true);
    const snapshot = curl.positions.slice();
    const versions = [curl.positionAttribute.version, curl.normalAttribute.version];
    expect(writeLeafCurl(curl, 0.4)).toBe(false);
    expect([curl.positionAttribute.version, curl.normalAttribute.version]).toEqual(versions);
    expect(curl.positions).toEqual(snapshot);
    expect(writeLeafCurl(curl, 0.6)).toBe(true);
    expect(curl.positionAttribute.version).toBe(versions[0]! + 1);
    expect(curl.normalAttribute.version).toBe(versions[1]! + 1);
  });

  it('is released exactly once on dispose', () => {
    const curl = createLeafCurlMesh();
    const listener = vi.fn();
    curl.geometry.addEventListener('dispose', listener);
    disposeLeafCurlMesh(curl);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('swapping the curl onto a leaf', () => {
  it('gives the turning leaf the curl and restores the shared geometry and material after the turn', () => {
    const model = createBookModel(assets);
    const meshes = leafMeshes(model);
    const curl = makeCurl();
    beginLeafCurl(curl, meshes[1]!);
    expect(meshes[1]!.geometry).toBe(curl.geometry);
    expect(meshes[1]!.frustumCulled).toBe(false);
    expect(meshes[0]!.geometry).toBe(assets.leaf);
    expect(meshes[2]!.geometry).toBe(assets.leaf);
    expect(endLeafCurl(curl)).toBe(true);
    meshes.forEach((mesh) => {
      expect(mesh.geometry).toBe(assets.leaf);
      expect(mesh.material).toBe(assets.leafMaterial);
      expect(mesh.frustumCulled).toBe(true);
    });
    expect(endLeafCurl(curl)).toBe(false);
  });

  it('swaps at most one leaf at a time', () => {
    const model = createBookModel(assets);
    const meshes = leafMeshes(model);
    const curl = makeCurl();
    beginLeafCurl(curl, meshes[0]!);
    beginLeafCurl(curl, meshes[2]!);
    expect(meshes.filter((mesh) => mesh.geometry === curl.geometry)).toEqual([meshes[0]]);
    expect(meshes[2]!.geometry).toBe(assets.leaf);
  });

  it('restores the flat geometry when the curl is disposed while showing', () => {
    const model = createBookModel(assets);
    const mesh = leafMeshes(model)[0]!;
    const curl = createLeafCurlMesh();
    beginLeafCurl(curl, mesh);
    disposeLeafCurlMesh(curl);
    expect(mesh.geometry).toBe(assets.leaf);
  });

  it('forces the first write after a swap, and adds no light, no mesh and no shadow', () => {
    const model = createBookModel(assets);
    const meshes = leafMeshes(model);
    const curl = makeCurl();
    writeLeafCurl(curl, 0.3);
    beginLeafCurl(curl, meshes[0]!);
    expect(writeLeafCurl(curl, 0.3)).toBe(true);
    model.root.traverse((object) => {
      expect(object).not.toBeInstanceOf(THREE.Light);
      expect(object.castShadow).toBe(false);
    });
    expect(meshes[0]!.castShadow).toBe(false);
    let meshCount = 0;
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshCount += 1;
    });
    expect(meshCount).toBe(6);
  });
});

describe('curved leaf and the page model', () => {
  it('keeps the spine angle equal to the rigid leaf angle', () => {
    for (let j = 0; j < LEAF_COUNT; j++) {
      for (let step = 0; step <= 20; step++) {
        const f = step / 20;
        // The strip carries pi * f at the spine; the hinge adds -rotation.y.
        const spine = Math.PI * f - curlHingeRotation(j, f);
        expect(spine).toBeCloseTo(leafHingeAngle(j, f), 12);
      }
    }
    expect(curlHingeRotation(0, 0)).toBe(0);
    expect(curlHingeRotation(1, 1)).toBeCloseTo(Math.PI - turnedLeafAngle(1), 12);
  });

  it('matches the flat leaf at both ends', () => {
    const curl = makeCurl();
    for (let j = 0; j < LEAF_COUNT; j++) {
      for (const f of [0, 1]) {
        writeLeafCurl(curl, f);
        const angle = leafHingeAngle(j, f);
        const rotate = f * (turnedLeafAngle(j) - Math.PI);
        // Free-edge corner of the front face of the flat box, turned by the rigid hinge angle.
        const cornerX = LEAF_FRAME.originX + LEAF_FRAME.width;
        const cornerZ = LEAF_THICKNESS / 2;
        const flatX = cornerX * Math.cos(angle) - cornerZ * Math.sin(angle);
        const flatZ = cornerX * Math.sin(angle) + cornerZ * Math.cos(angle);
        // Same corner of the strip (front face, last column, bottom row), turned by the hinge offset.
        const at = (LEAF_CURL.segments * 2) * 3;
        const x = curl.positions[at]!;
        const z = curl.positions[at + 2]!;
        expect(x * Math.cos(rotate) - z * Math.sin(rotate)).toBeCloseTo(flatX, 5);
        expect(x * Math.sin(rotate) + z * Math.cos(rotate)).toBeCloseTo(flatZ, 5);
      }
    }
  });
});

interface Plane {
  hingeZ: number;
  angle: number;
  thickness: number;
}

/** Signed distance of point (x, z) above the upper face of a plate hinged on the spine axis. */
function heightAbove(plane: Plane, x: number, z: number): number {
  const { angle, hingeZ, thickness } = plane;
  const nx = angle > Math.PI / 2 ? Math.sin(angle) : -Math.sin(angle);
  const nz = angle > Math.PI / 2 ? -Math.cos(angle) : Math.cos(angle);
  return (x - (nx * thickness) / 2) * nx + (z - hingeZ - (nz * thickness) / 2) * nz;
}

/** Distance along the plate from the spine axis; negative means the point is past the hinge, off the plate. */
function alongPlate(plane: Plane, x: number, z: number): number {
  return x * Math.cos(plane.angle) + (z - plane.hingeZ) * Math.sin(plane.angle);
}

describe('curved leaf never passes through the cover or the other leaves', () => {
  it('stays above the cover, the turned leaves and the unturned leaves at every progress', () => {
    const curl = makeCurl();
    for (let j = 0; j < LEAF_COUNT; j++) {
      const others: Plane[] = [{ hingeZ: COVER_PIVOT_Z, angle: COVER_OPEN_ANGLE, thickness: BOARD_THICKNESS }];
      for (let k = 0; k < LEAF_COUNT; k++) {
        if (k < j) others.push({ hingeZ: turnedLeafZ(k), angle: turnedLeafAngle(k), thickness: LEAF_THICKNESS });
        if (k > j) others.push({ hingeZ: restLeafZ(k), angle: 0, thickness: LEAF_THICKNESS });
      }
      for (let step = 0; step <= 100; step++) {
        const f = step / 100;
        writeLeafCurl(curl, f);
        const rotate = f * (turnedLeafAngle(j) - Math.PI);
        const hingeZ = leafHingeZ(j, f);
        for (let v = 0; v < 52; v++) {
          // The root column sits in the hinge, where the rigid leaf meets the other plates too.
          if (v % 26 < 2) continue;
          const x0 = curl.positions[v * 3]!;
          const z0 = curl.positions[v * 3 + 2]!;
          const x = x0 * Math.cos(rotate) - z0 * Math.sin(rotate);
          const z = hingeZ + x0 * Math.sin(rotate) + z0 * Math.cos(rotate);
          for (const plane of others) {
            if (alongPlate(plane, x, z) < 0) continue;
            expect(heightAbove(plane, x, z)).toBeGreaterThanOrEqual(-1e-6);
          }
        }
      }
    }
  });
});

/** The text of the function whose declaration starts with `signature`, up to its closing brace. */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`${signature} not found`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unbalanced');
}

describe('per-frame code allocates nothing', () => {
  const perFrame = [
    functionBody(curlMeshSource, 'export function writeLeafCurl'),
    functionBody(driverSource, 'function syncCurl'),
    functionBody(driverSource, 'function applyCurledLeaf'),
    functionBody(driverSource, 'function applyLeaves'),
  ];

  it.each(perFrame.map((body) => [body.split('\n')[0]!, body] as const))('%s', (_name, body) => {
    expect(body).not.toMatch(/\bnew\s/);
    expect(body).not.toMatch(/=\s*[[{]/);
    expect(body).not.toMatch(/[(,]\s*[[{]/);
    expect(body).not.toMatch(/\.(map|filter|slice|from)\(/);
  });
});

describe('curl lifetime in the driver', () => {
  it('creates the curl geometry when the book leaves closed and releases it at closed', () => {
    expect(driverSource).toMatch(/wasClosed && !closed[\s\S]*?createLeafCurlMesh\(\)/);
    expect(driverSource).toMatch(/if \(closed\) \{[\s\S]*?releaseCurl\(\);/);
    expect(driverSource.match(/createLeafCurlMesh\(\)/g)).toHaveLength(1);
  });

  it('reads reduced motion from the saved preferences', () => {
    expect(driverSource).toMatch(/curledLeafIndex\(readingMachine\.pages, cover, appStore\.getState\(\)\.data\.prefs\.reducedMotion\)/);
  });
});





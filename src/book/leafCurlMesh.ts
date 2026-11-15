import * as THREE from 'three';
import { LEAF_FRAME } from './bookAssets';
import { turnedLeafAngle } from './bookStack';
import { LEAF_CURL } from './bookTimings';
import { leafCurl, leafStrip } from './leafCurl';

/**
 * The curved leaf as a mesh: one geometry per open book with two strips (front and back face) of
 * `segments + 1` columns by 2 rows. Index and UV are built once; the position and normal buffers
 * are allocated once and rewritten in place. The geometry replaces the shared flat one on the
 * single turning leaf and is put back when the turn ends. No React, no lights, no new meshes.
 */

const SEGMENTS = LEAF_CURL.segments;
const COLUMNS = SEGMENTS + 1;
const FACE_VERTICES = COLUMNS * 2;
const VERTEX_COUNT = FACE_VERTICES * 2;
/** Material slots of the box geometry for the two faces; the groups keep them for textured leaves. */
const FRONT_SLOT = 4;
const BACK_SLOT = 5;

export interface LeafCurlMesh {
  readonly geometry: THREE.BufferGeometry;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly normalAttribute: THREE.BufferAttribute;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Scratch segment directions, written by `leafCurl`. */
  readonly angles: Float64Array;
  /** Leaf fraction last written; NaN forces the next write. */
  written: number;
  /** The mesh currently showing the curl, and the flat geometry it will get back. */
  leaf: THREE.Mesh | null;
  flat: THREE.BufferGeometry | null;
}

/** Triangles of one face, columns left to right, rows bottom to top; the back face is reversed. */
function buildIndex(): Uint16Array {
  const index = new Uint16Array(SEGMENTS * 12);
  let at = 0;
  for (let face = 0; face < 2; face++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = (face * COLUMNS + k) * 2;
      const b = a + 2;
      const quad = face === 0 ? [a, b, b + 1, a, b + 1, a + 1] : [a, b + 1, b, a, a + 1, b + 1];
      for (const vertex of quad) index[at++] = vertex;
    }
  }
  return index;
}

/** Texture coordinates across the page; the back face is mirrored, since it is seen from behind. */
function buildUv(): Float32Array {
  const uv = new Float32Array(VERTEX_COUNT * 2);
  for (let face = 0; face < 2; face++) {
    for (let k = 0; k < COLUMNS; k++) {
      const u = face === 0 ? k / SEGMENTS : 1 - k / SEGMENTS;
      for (let row = 0; row < 2; row++) {
        const v = ((face * COLUMNS + k) * 2 + row) * 2;
        uv[v] = u;
        uv[v + 1] = row;
      }
    }
  }
  return uv;
}

/** Builds the curl geometry, flat at progress 0. Called when a book leaves `closed`. */
export function createLeafCurlMesh(): LeafCurlMesh {
  const positions = new Float32Array(VERTEX_COUNT * 3);
  const normals = new Float32Array(VERTEX_COUNT * 3);
  const angles = new Float64Array(SEGMENTS);
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const normalAttribute = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('normal', normalAttribute);
  geometry.setAttribute('uv', new THREE.BufferAttribute(buildUv(), 2));
  geometry.setIndex(new THREE.BufferAttribute(buildIndex(), 1));
  geometry.addGroup(0, SEGMENTS * 6, FRONT_SLOT);
  geometry.addGroup(SEGMENTS * 6, SEGMENTS * 6, BACK_SLOT);
  const curl: LeafCurlMesh = {
    geometry,
    positionAttribute,
    normalAttribute,
    positions,
    normals,
    angles,
    written: Number.NaN,
    leaf: null,
    flat: null,
  };
  writeLeafCurl(curl, 0);
  return curl;
}

/** Gives the turning leaf the curl geometry. Does nothing while a leaf already shows it. */
export function beginLeafCurl(curl: LeafCurlMesh, leaf: THREE.Mesh): void {
  if (curl.leaf !== null) return;
  curl.leaf = leaf;
  curl.flat = leaf.geometry;
  leaf.geometry = curl.geometry;
  leaf.frustumCulled = false;
  curl.written = Number.NaN;
}

/** Puts the shared flat geometry back. Returns whether a leaf was showing the curl. */
export function endLeafCurl(curl: LeafCurlMesh): boolean {
  const { leaf, flat } = curl;
  if (leaf === null || flat === null) return false;
  leaf.geometry = flat;
  leaf.frustumCulled = true;
  curl.leaf = null;
  curl.flat = null;
  return true;
}

/** Releases the geometry. Any leaf still showing it gets the flat one back first. */
export function disposeLeafCurlMesh(curl: LeafCurlMesh): void {
  endLeafCurl(curl);
  curl.geometry.dispose();
}

/**
 * Writes the shape for a leaf fraction into the existing buffers. Does nothing when the fraction
 * is the one last written. Returns whether it wrote. Allocates nothing.
 */
export function writeLeafCurl(curl: LeafCurlMesh, fraction: number): boolean {
  if (fraction === curl.written) return false;
  curl.written = fraction;
  leafCurl(fraction, SEGMENTS, curl.angles);
  leafStrip(
    curl.angles,
    SEGMENTS,
    LEAF_FRAME.width,
    LEAF_FRAME.depth,
    curl.positions,
    curl.normals,
    LEAF_FRAME.height,
    LEAF_FRAME.originX,
    LEAF_FRAME.originY,
  );
  curl.positionAttribute.needsUpdate = true;
  curl.normalAttribute.needsUpdate = true;
  return true;
}

/**
 * Rotation about y of the hinge while leaf `j` is drawn curved. The strip carries the angle
 * `pi * fraction` at the spine; the rigid leaf has `fraction * turnedLeafAngle(j)`, so the hinge
 * adds the difference and the spine angle stays the rigid one, as the page model has it.
 */
export function curlHingeRotation(j: number, fraction: number): number {
  return fraction * (Math.PI - turnedLeafAngle(j));
}

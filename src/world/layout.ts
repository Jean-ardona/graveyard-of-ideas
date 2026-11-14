import * as THREE from 'three';
import {
  GRAVE_SLOTS,
  HUT_POSITION,
  PATHS,
  TERRAIN_SIZE,
  type PathDef,
  type PathPoint,
} from './config';

export interface Placement {
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

const PATH_SAMPLE_COUNT = 40;
const EDGE_MARGIN = 2;
const GATE_ZONE_Z = 18;

/** Small deterministic random generator so the scene is identical on every load. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth centerline of a path as evenly spaced points. */
export function samplePath(path: PathDef): PathPoint[] {
  const curve = new THREE.CatmullRomCurve3(
    path.points.map((p) => new THREE.Vector3(p.x, 0, p.z)),
  );
  return curve.getSpacedPoints(PATH_SAMPLE_COUNT).map((v) => ({ x: v.x, z: v.z }));
}

const SAMPLED_PATHS = PATHS.map(samplePath);

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function distanceToPaths(x: number, z: number): number {
  let best = Infinity;
  for (const samples of SAMPLED_PATHS) {
    for (const p of samples) best = Math.min(best, distance(x, z, p.x, p.z));
  }
  return best;
}

function distanceToSlots(x: number, z: number): number {
  return Math.min(...GRAVE_SLOTS.map((s) => distance(x, z, s.x, s.z)));
}

export interface ClearanceRules {
  slot: number;
  path: number;
  hut: number;
}

function isClear(x: number, z: number, rules: ClearanceRules): boolean {
  return (
    z < GATE_ZONE_Z &&
    distanceToSlots(x, z) >= rules.slot &&
    distanceToPaths(x, z) >= rules.path &&
    distance(x, z, HUT_POSITION.x, HUT_POSITION.z) >= rules.hut
  );
}

/**
 * Picks `count` random spots on the terrain that respect the clearance rules
 * and keep `spacing` units between each other.
 */
export function scatter(
  count: number,
  seed: number,
  rules: ClearanceRules,
  spacing: number,
  scaleRange: readonly [number, number],
): Placement[] {
  const random = createRandom(seed);
  const half = TERRAIN_SIZE / 2 - EDGE_MARGIN;
  const placed: Placement[] = [];
  for (let attempt = 0; attempt < count * 200 && placed.length < count; attempt++) {
    const x = (random() * 2 - 1) * half;
    const z = (random() * 2 - 1) * half;
    const rotation = random() * Math.PI * 2;
    const scale = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
    const free = isClear(x, z, rules) && placed.every((p) => distance(x, z, p.x, p.z) >= spacing);
    if (free) placed.push({ x, z, rotation, scale });
  }
  return placed;
}

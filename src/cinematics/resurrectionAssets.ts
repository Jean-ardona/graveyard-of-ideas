import * as THREE from 'three';
import { createGlowTexture } from '../world/glowTexture';
import { RESURRECTION_BUDGET, createEmberField } from './resurrectionVisuals';
import type { EmberField } from './resurrectionVisuals';
import type { QualityLevel } from '../domain/types';
import { createSpecterBuffers, createSpecterSeeds } from './specterParticles';
import type { SpecterBuffers, SpecterSeeds } from './specterParticles';
import { SpecterPoints } from './specterPoints';
import { SPECTER_BUDGET } from './specterTimings';

/**
 * Everything the resurrection adds to the scene: one ember point cloud. No light, no shadow caster,
 * no post-processing. It hangs under one group so the run can remove it in a single step, and
 * `dispose()` frees every geometry, material and texture it made.
 *
 * The specter is one more `Points` object (two draw calls in all). With reduced motion or calm mode
 * (`instant`) none is created: the sequence lands on its final state in one tick.
 */

const EMBER_POINT_SIZE = 0.11;

export interface ResurrectionAssets {
  /** Placed at the tomb; every child is positioned relative to it. */
  readonly group: THREE.Group;
  readonly embers: EmberField;
  readonly emberPoints: THREE.Points;
  readonly emberPositions: THREE.BufferAttribute;
  readonly emberColors: THREE.BufferAttribute;
  /** The specter particles, or null when the sequence is instant. */
  readonly specter: SpecterPoints | null;
  /** Seeds and buffers of the specter, allocated once; null when the sequence is instant. */
  readonly specterSeeds: SpecterSeeds | null;
  readonly specterBuffers: SpecterBuffers | null;
  dispose(): void;
}

export function createResurrectionAssets(quality: QualityLevel, instant = false): ResurrectionAssets {
  const budget = RESURRECTION_BUDGET[quality];
  const embers = createEmberField(budget.embers);
  const glow = createGlowTexture();

  const emberGeometry = new THREE.BufferGeometry();
  const emberPositions = new THREE.BufferAttribute(embers.positions, 3);
  const emberColors = new THREE.BufferAttribute(embers.colors, 3);
  emberGeometry.setAttribute('position', emberPositions);
  emberGeometry.setAttribute('color', emberColors);
  const emberMaterial = new THREE.PointsMaterial({
    size: EMBER_POINT_SIZE,
    map: glow,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const emberPoints = new THREE.Points(emberGeometry, emberMaterial);
  // The positions move every frame, so the bounding sphere of the first frame would cull them.
  emberPoints.frustumCulled = false;

  const specterSeeds = instant ? null : createSpecterSeeds(SPECTER_BUDGET[quality]);
  const specterBuffers = instant ? null : createSpecterBuffers(SPECTER_BUDGET[quality]);
  const specter = specterBuffers === null ? null : new SpecterPoints(specterBuffers, quality);

  const group = new THREE.Group();
  group.add(emberPoints);
  if (specter !== null) group.add(specter.points);

  return {
    group,
    embers,
    emberPoints,
    emberPositions,
    emberColors,
    specter,
    specterSeeds,
    specterBuffers,
    dispose() {
      group.removeFromParent();
      specter?.dispose();
      emberGeometry.dispose();
      emberMaterial.dispose();
      glow.dispose();
    },
  };
}

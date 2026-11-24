import * as THREE from 'three';
import { createGlowTexture } from '../world/glowTexture';
import { RESURRECTION_BUDGET, createEmberField, createSmokeField } from './resurrectionVisuals';
import type { EmberField, SmokeField } from './resurrectionVisuals';
import type { QualityLevel } from '../domain/types';

/**
 * Everything the resurrection adds to the scene: one ember point cloud, a few smoke puffs sharing one
 * material, and one specter sprite. No light, no shadow caster, no post-processing. All of it hangs
 * under one group so the run can remove it in a single step, and `dispose()` frees every geometry,
 * material and texture it made.
 */

const SPECTER_TEXTURE_WIDTH = 64;
const SPECTER_TEXTURE_HEIGHT = 96;
/** Near-black smoke and silhouette; the silhouette gets a faint cold rim so it reads against the night. */
const SMOKE_COLOR = 0x07070b;
const EMBER_POINT_SIZE = 0.11;

export interface ResurrectionAssets {
  /** Placed at the tomb; every child is positioned relative to it. */
  readonly group: THREE.Group;
  readonly embers: EmberField;
  readonly emberPoints: THREE.Points;
  readonly emberPositions: THREE.BufferAttribute;
  readonly emberColors: THREE.BufferAttribute;
  readonly smoke: SmokeField;
  readonly puffs: readonly THREE.Sprite[];
  readonly smokeMaterial: THREE.SpriteMaterial;
  readonly specter: THREE.Sprite;
  readonly specterMaterial: THREE.SpriteMaterial;
  dispose(): void;
}

/** A hooded, tattered figure on a transparent canvas. A null context leaves the texture blank. */
function createSpecterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SPECTER_TEXTURE_WIDTH;
  canvas.height = SPECTER_TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (context) {
    const w = SPECTER_TEXTURE_WIDTH;
    const h = SPECTER_TEXTURE_HEIGHT;
    context.beginPath();
    context.moveTo(w * 0.5, h * 0.04);
    context.bezierCurveTo(w * 0.78, h * 0.06, w * 0.8, h * 0.3, w * 0.74, h * 0.4);
    context.bezierCurveTo(w * 0.9, h * 0.62, w * 0.98, h * 0.84, w * 0.9, h * 0.96);
    context.lineTo(w * 0.72, h * 0.88);
    context.lineTo(w * 0.58, h * 0.97);
    context.lineTo(w * 0.44, h * 0.87);
    context.lineTo(w * 0.28, h * 0.97);
    context.lineTo(w * 0.1, h * 0.94);
    context.bezierCurveTo(w * 0.02, h * 0.84, w * 0.1, h * 0.62, w * 0.26, h * 0.4);
    context.bezierCurveTo(w * 0.2, h * 0.3, w * 0.22, h * 0.06, w * 0.5, h * 0.04);
    context.closePath();
    context.fillStyle = '#05060a';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(120,140,185,0.45)';
    context.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

export function createResurrectionAssets(quality: QualityLevel): ResurrectionAssets {
  const budget = RESURRECTION_BUDGET[quality];
  const embers = createEmberField(budget.embers);
  const smoke = createSmokeField(budget.puffs);
  const glow = createGlowTexture();
  const specterTexture = createSpecterTexture();

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

  const smokeMaterial = new THREE.SpriteMaterial({
    map: glow,
    color: SMOKE_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < smoke.count; i++) {
    const puff = new THREE.Sprite(smokeMaterial);
    puff.visible = false;
    puffs.push(puff);
  }

  const specterMaterial = new THREE.SpriteMaterial({
    map: specterTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const specter = new THREE.Sprite(specterMaterial);
  specter.visible = false;

  const group = new THREE.Group();
  group.add(emberPoints, ...puffs, specter);

  return {
    group,
    embers,
    emberPoints,
    emberPositions,
    emberColors,
    smoke,
    puffs,
    smokeMaterial,
    specter,
    specterMaterial,
    dispose() {
      group.removeFromParent();
      emberGeometry.dispose();
      emberMaterial.dispose();
      smokeMaterial.dispose();
      specterMaterial.dispose();
      glow.dispose();
      specterTexture.dispose();
    },
  };
}

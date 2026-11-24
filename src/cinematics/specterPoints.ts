import * as THREE from 'three';
import type { QualityLevel } from '../domain/types';
import { hexToRgb } from '../ui/theme/colorMath';
import { SPECTER_BODY_COLOR, SPECTER_POINT_SIZE } from './specterLook';
import type { SpecterBuffers } from './specterParticles';

/**
 * The specter as one `THREE.Points` (adapter: Three.js, no React). The pure buffers of
 * `specterParticles` are the attribute arrays; the adapter only marks them for upload on the ticks where
 * they can have changed, and shows the object while at least one particle is visible.
 * One draw call, no light, no shadow caster.
 */

const DOT_SIZE = 32;

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A soft near-black dot: opaque center, smooth falloff to fully transparent, no light edge.
 * The color comes from the tokens. A missing 2D context gives `null`: the points then draw as plain dark squares.
 */
function createDotTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = DOT_SIZE;
  canvas.height = DOT_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const half = DOT_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, rgba(SPECTER_BODY_COLOR, 1));
  gradient.addColorStop(0.4, rgba(SPECTER_BODY_COLOR, 0.6));
  gradient.addColorStop(1, rgba(SPECTER_BODY_COLOR, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, DOT_SIZE, DOT_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SpecterPoints {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly texture: THREE.CanvasTexture | null;
  private readonly positions: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private lastActive = 0;
  private disposed = false;

  constructor(buffers: SpecterBuffers, quality: QualityLevel) {
    this.texture = createDotTexture();
    this.positions = new THREE.BufferAttribute(buffers.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.BufferAttribute(buffers.colors, 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('color', this.colors);
    this.material = new THREE.PointsMaterial({
      size: SPECTER_POINT_SIZE[quality],
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: false,
      toneMapped: false,
      map: this.texture,
      // Without the dot texture the white vertex colors would show: tint them to the near-black body.
      color: this.texture === null ? SPECTER_BODY_COLOR : 0xffffff,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // The particles move far from where the first frame put them.
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Marks the buffers for upload only while something can change, and shows the object while `active > 0`. */
  apply(active: number): void {
    if (this.disposed) return;
    if (active > 0 || this.lastActive > 0) {
      this.positions.needsUpdate = true;
      this.colors.needsUpdate = true;
    }
    this.lastActive = active;
    this.points.visible = active > 0;
  }

  /** Removes the object from its parent and frees geometry, material and texture once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}

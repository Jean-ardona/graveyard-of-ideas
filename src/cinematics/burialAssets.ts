import * as THREE from 'three';
import type { BookHandle } from '../book/bookHandles';
import { TOKENS } from '../ui/theme/tokens';
import { createGlowTexture } from '../world/glowTexture';

/**
 * What the burial cinematic adds to the scene: one additive glow sprite in a pale blue-white (the
 * `revealGlow` token, never amber: amber belongs to the resurrection embers), and a reveal of
 * the tomb's own book on per-mesh clones of the shared materials. No light, no shadow caster. The sprite
 * reuses the glow helper texture; `dispose()` frees the sprite material, the texture and the clones.
 */

/** Colour of the glow and of the book tint. */
export const BURIAL_GLOW_COLOR = TOKENS.color.revealGlow;
/** Highest sprite opacity, and the extra emissive strength of the book at the brightest moment. */
const GLOW_PEAK = 0.75;
const TINT_STRENGTH = 0.9;
/** Edge of the glow sprite in world units, and how far above the book it floats. */
const GLOW_SIZE = 1.4;
export const GLOW_LIFT = 0.12;

/** Name of the optional sound cue queued when the book appears. Audio comes later. */
export const BURIAL_APPEAR_CUE = 'burial-appear';

export interface BurialGlow {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly texture: THREE.Texture;
  /** Writes the opacity from the glow progress in [0, 1]. Allocates nothing. */
  apply(glow: number): void;
  /** Removes the sprite and frees its material and texture. Safe to call twice. */
  dispose(): void;
}

export function createBurialGlow(): BurialGlow {
  const texture = createGlowTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: BURIAL_GLOW_COLOR,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(GLOW_SIZE, GLOW_SIZE, 1);
  sprite.visible = false;
  let disposed = false;
  return {
    sprite,
    material,
    texture,
    apply(glow) {
      const level = glow > 0 ? Math.min(glow, 1) : 0;
      material.opacity = GLOW_PEAK * level;
      sprite.visible = level > 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sprite.removeFromParent();
      material.dispose();
      texture.dispose();
    },
  };
}

interface RevealSlot {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | THREE.Material[];
  readonly clones: THREE.Material[];
  readonly baseIntensity: number[];
}

export interface BookReveal {
  /**
   * Shows the book from the appear progress: visible from the first moment, opacity following the
   * progress and a cool tint following the glow. Allocates nothing.
   */
  apply(appear: number, glow: number): void;
  /** Puts the original materials back and frees the clones. Safe to call twice. */
  dispose(): void;
}

function standardOf(material: THREE.Material): THREE.MeshStandardMaterial | null {
  return material instanceof THREE.MeshStandardMaterial ? material : null;
}

/** Clones a material for the reveal: transparent, and tinted pale at the emissive channel when it has one. */
function revealClone(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  clone.transparent = true;
  const standard = standardOf(clone);
  if (standard !== null) standard.emissive.set(BURIAL_GLOW_COLOR);
  return clone;
}

export function createBookReveal(handle: BookHandle): BookReveal {
  const slots: RevealSlot[] = [];
  handle.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = object.material as THREE.Material | THREE.Material[];
    const originals = Array.isArray(original) ? original : [original];
    const clones = originals.map(revealClone);
    object.material = Array.isArray(original) ? clones : clones[0]!;
    slots.push({
      mesh: object,
      original,
      clones,
      baseIntensity: originals.map((material) => standardOf(material)?.emissiveIntensity ?? 0),
    });
  });
  let disposed = false;
  return {
    apply(appear, glow) {
      handle.root.visible = appear > 0;
      for (let s = 0; s < slots.length; s++) {
        const slot = slots[s]!;
        for (let c = 0; c < slot.clones.length; c++) {
          const clone = slot.clones[c]!;
          clone.opacity = appear;
          const standard = standardOf(clone);
          if (standard !== null) standard.emissiveIntensity = slot.baseIntensity[c]! + TINT_STRENGTH * glow;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) {
        slot.mesh.material = slot.original;
        slot.clones.forEach((clone) => clone.dispose());
      }
    },
  };
}

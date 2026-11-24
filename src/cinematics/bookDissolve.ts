import * as THREE from 'three';
import type { BookHandle } from '../book/bookHandles';
import { TOKENS } from '../ui/theme/tokens';
import { BOOK_PARTS } from './resurrectionTimeline';
import type { ResurrectionProgress } from './resurrectionTimeline';

/**
 * Burns one book away, part by part. Books share their materials, so each part of this book gets its
 * own clones for the burn; the originals go back on the meshes and the clones are disposed at the end.
 * The parts are reached through the handle (cover, spine, pageBlock, pages), never by name or by
 * walking the scene; each part is a group, so the meshes inside it are visited with `traverse`.
 */

/** Extra emissive strength at the hottest moment of a part's burn. */
const BURN_GLOW = 1.6;

interface BurnSlot {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | THREE.Material[];
  readonly clones: THREE.Material[];
  readonly baseIntensity: number[];
}

interface BurningPart {
  readonly root: THREE.Object3D;
  readonly slots: BurnSlot[];
}

export interface BookDissolve {
  /** Writes the burn of every part from the progress. Allocates nothing. */
  apply(progress: ResurrectionProgress): void;
  /** Puts the original materials back and disposes the clones. Part visibility is left as the burn set it. Safe to call twice. */
  dispose(): void;
}

function emissiveOf(material: THREE.Material): THREE.MeshStandardMaterial | null {
  return material instanceof THREE.MeshStandardMaterial ? material : null;
}

/** Clones a material for the burn: transparent, and tinted amber at the emissive channel when it has one. */
function burnClone(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  clone.transparent = true;
  const standard = emissiveOf(clone);
  if (standard !== null) standard.emissive.set(TOKENS.ember.glow);
  return clone;
}

function collectPart(root: THREE.Object3D): BurningPart {
  const slots: BurnSlot[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const original = object.material as THREE.Material | THREE.Material[];
    const originals = Array.isArray(original) ? original : [original];
    const clones = originals.map(burnClone);
    object.material = Array.isArray(original) ? clones : clones[0]!;
    slots.push({
      mesh: object,
      original,
      clones,
      baseIntensity: originals.map((material) => emissiveOf(material)?.emissiveIntensity ?? 0),
    });
  });
  return { root, slots };
}

export function createBookDissolve(handle: BookHandle): BookDissolve {
  const parts = BOOK_PARTS.map((name) => collectPart(handle.parts[name]));
  let disposed = false;

  return {
    apply(progress) {
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k]!;
        const burn = progress[BOOK_PARTS[k]!];
        const heat = Math.sin(Math.PI * burn);
        part.root.visible = burn < 1;
        for (let s = 0; s < part.slots.length; s++) {
          const slot = part.slots[s]!;
          for (let c = 0; c < slot.clones.length; c++) {
            const clone = slot.clones[c]!;
            clone.opacity = 1 - burn;
            const standard = emissiveOf(clone);
            if (standard !== null) standard.emissiveIntensity = slot.baseIntensity[c]! + BURN_GLOW * heat;
          }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const part of parts) {
        for (const slot of part.slots) {
          slot.mesh.material = slot.original;
          slot.clones.forEach((clone) => clone.dispose());
        }
      }
    },
  };
}

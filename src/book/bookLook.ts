import * as THREE from 'three';
import { COLORS } from '../world/config';

/**
 * How a closed book stays readable at night. Data plus one small procedural texture.
 * No amber (reserved for the resurrection embers) and no scene light: a faint emissive
 * term gives the edge glow without any extra shader cost per light.
 */

export const BOOK_LOOK = {
  /** Pale blue-gray band of the page edges; clearly lighter than the cover. */
  pageEdge: '#b7c0cf',
  /** Pale parchment blue-gray of the leaves, the color of the page overlay and of the leaf textures. */
  leafPaper: '#c3ccdb',
  /** Text on the leaves. */
  leafInk: '#141c30',
  /** Secondary text, such as the page caption. */
  leafMuted: '#3a4766',
  /** Background and border of a text field on the page. */
  fieldFill: '#dde3ee',
  fieldBorder: '#5a6a84',
  /** The resurrection button and the close button. */
  buttonFill: '#1d2740',
  buttonText: '#c8d8ff',
  buttonBorder: '#3b4d73',
  leafGlowIntensity: 0.4,
  /** Emissive strength of the textured front face of a leaf; tuned on the target machine. */
  leafTextureGlowIntensity: 0.25,
  /** One-line border drawn on the front board. */
  coverBorder: '#5f7298',
  /** Emissive tint of the page edges and the cover border. */
  rim: '#7f90b0',
  pageEdgeRimIntensity: 0.14,
  coverRimIntensity: 0.08,
  borderTextureSize: 128,
  /** Distance of the border line from the texture edge, and its thickness, in texels. */
  borderInset: 12,
  borderThickness: 3,
} as const;

function hexToBytes(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function isBorderTexel(x: number, y: number, size: number): boolean {
  const { borderInset: inset, borderThickness: thickness } = BOOK_LOOK;
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  return edge >= inset && edge < inset + thickness;
}

/** Cover color everywhere, with a one-line border in the border color. RGBA bytes, sRGB. */
export function coverBorderPixels(size: number = BOOK_LOOK.borderTextureSize): Uint8Array {
  const base = hexToBytes(COLORS.bookCover);
  const line = hexToBytes(BOOK_LOOK.coverBorder);
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = isBorderTexel(x, y, size) ? line : base;
      pixels.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return pixels;
}

/** Built from raw pixels so it needs no canvas. The caller disposes it. */
export function createCoverBorderTexture(): THREE.DataTexture {
  const size = BOOK_LOOK.borderTextureSize;
  const texture = new THREE.DataTexture(coverBorderPixels(size), size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Front board: the texture carries the cover color, so the material color stays white. */
export function createCoverMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    flatShading: true,
    roughness: 1,
    emissive: BOOK_LOOK.rim,
    emissiveIntensity: BOOK_LOOK.coverRimIntensity,
  });
}

/** Leaf face: close to the overlay page color, so the open book never flashes gray-blue. */
export function createLeafMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: BOOK_LOOK.leafPaper,
    roughness: 1,
    emissive: BOOK_LOOK.leafPaper,
    emissiveIntensity: BOOK_LOOK.leafGlowIntensity,
  });
}

export function createPageEdgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: BOOK_LOOK.pageEdge,
    roughness: 1,
    emissive: BOOK_LOOK.rim,
    emissiveIntensity: BOOK_LOOK.pageEdgeRimIntensity,
  });
}

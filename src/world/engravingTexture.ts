import * as THREE from 'three';
import { COLORS } from './config';

export const ENGRAVING_WIDTH = 256;
export const ENGRAVING_HEIGHT = 128;
const MARGIN = 14;
const FONT_SIZE = 34;

/**
 * Small canvas texture with the title cut into stone: a light edge one pixel
 * below, then darker text on top. The title is drawn as plain canvas text.
 */
export function createEngravingTexture(title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ENGRAVING_WIDTH;
  canvas.height = ENGRAVING_HEIGHT;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = COLORS.stone;
    context.fillRect(0, 0, ENGRAVING_WIDTH, ENGRAVING_HEIGHT);
    context.font = `${FONT_SIZE}px serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const x = ENGRAVING_WIDTH / 2;
    const y = ENGRAVING_HEIGHT / 2;
    const maxWidth = ENGRAVING_WIDTH - MARGIN * 2;
    context.fillStyle = COLORS.engravingEdge;
    context.fillText(title, x + 1, y + 1.5, maxWidth);
    context.fillStyle = COLORS.engraving;
    context.fillText(title, x, y, maxWidth);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

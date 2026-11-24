/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SPECTER_BODY_COLOR, SPECTER_POINT_SIZE } from '../cinematics/specterLook';
import { createSpecterBuffers } from '../cinematics/specterParticles';
import { SpecterPoints } from '../cinematics/specterPoints';
import { SPECTER_BUDGET, SPECTER_MAX_PARTICLES } from '../cinematics/specterTimings';
import { hexToRgb, isAmberHue } from '../ui/theme/colorMath';

const SOURCES = import.meta.glob<string>('../cinematics/specterPoints.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface FakeContext {
  stops: { offset: number; color: string }[];
  gradientArgs: number[][];
  fills: number[][];
}

/** Replaces the 2D context with a recorder. Returns the record of the drawing calls. */
function fakeContext(): FakeContext {
  const record: FakeContext = { stops: [], gradientArgs: [], fills: [] };
  const context = {
    fillStyle: '',
    createRadialGradient: (...args: number[]) => {
      record.gradientArgs.push(args);
      return { addColorStop: (offset: number, color: string) => record.stops.push({ offset, color }) };
    },
    fillRect: (...args: number[]) => record.fills.push(args),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
  return record;
}

function noContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
}

function hexOf(rgba: string): string {
  const [r, g, b] = /rgba\((\d+),(\d+),(\d+),/.exec(rgba)!.slice(1).map(Number) as [number, number, number];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function alphaOf(rgba: string): number {
  return Number(/,([\d.]+)\)$/.exec(rgba)![1]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('specter points adapter', () => {
  it('is one Points object over the preallocated buffers, with the material of the design', () => {
    fakeContext();
    const buffers = createSpecterBuffers(SPECTER_BUDGET.low);
    const specter = new SpecterPoints(buffers, 'low');
    const { points } = specter;
    expect(points).toBeInstanceOf(THREE.Points);
    expect(points.frustumCulled).toBe(false);
    expect(points.visible).toBe(false);
    const position = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = points.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(position.array).toBe(buffers.positions);
    expect(color.array).toBe(buffers.colors);
    expect(position.usage).toBe(THREE.DynamicDrawUsage);
    expect(color.usage).toBe(THREE.DynamicDrawUsage);
    expect(color.itemSize).toBe(4);
    const material = points.material as THREE.PointsMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.fog).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.sizeAttenuation).toBe(true);
    expect(material.size).toBe(SPECTER_POINT_SIZE.low);
    expect((points as unknown as THREE.Light).isLight).not.toBe(true);
    expect(points.castShadow).toBe(false);
    specter.dispose();
  });

  it('uses the size of each quality and the budget of each quality', () => {
    fakeContext();
    for (const quality of ['low', 'medium', 'high'] as const) {
      const specter = new SpecterPoints(createSpecterBuffers(SPECTER_BUDGET[quality]), quality);
      expect((specter.points.material as THREE.PointsMaterial).size).toBe(SPECTER_POINT_SIZE[quality]);
      specter.dispose();
    }
    const [low, medium, high] = [SPECTER_BUDGET.low, SPECTER_BUDGET.medium, SPECTER_BUDGET.high];
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    expect(high).toBeLessThanOrEqual(SPECTER_MAX_PARTICLES);
    expect(SPECTER_POINT_SIZE.low).toBeGreaterThan(SPECTER_POINT_SIZE.medium);
    expect(SPECTER_POINT_SIZE.medium).toBeGreaterThan(SPECTER_POINT_SIZE.high);
  });

  it('draws the 32 by 32 dot once: soft near-black gradient, no ring, nothing amber', () => {
    const record = fakeContext();
    const specter = new SpecterPoints(createSpecterBuffers(10), 'low');
    const texture = (specter.points.material as THREE.PointsMaterial).map as THREE.CanvasTexture;
    expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    expect((texture.image as HTMLCanvasElement).width).toBe(32);
    expect((texture.image as HTMLCanvasElement).height).toBe(32);
    expect(record.gradientArgs).toHaveLength(1);
    expect(record.fills).toEqual([[0, 0, 32, 32]]);
    const center = record.stops[0]!;
    const edge = record.stops[record.stops.length - 1]!;
    expect(center.offset).toBe(0);
    expect(alphaOf(center.color)).toBe(1);
    expect(edge.offset).toBe(1);
    expect(alphaOf(edge.color)).toBe(0);
    // Every stop is the body color, and alpha never rises again after the center: no ring.
    let previous = 1;
    for (const stop of record.stops) {
      expect(hexOf(stop.color)).toBe(SPECTER_BODY_COLOR);
      expect(isAmberHue(hexOf(stop.color))).toBe(false);
      expect(alphaOf(stop.color)).toBeLessThanOrEqual(previous);
      previous = alphaOf(stop.color);
    }
    expect(hexToRgb(SPECTER_BODY_COLOR)).toEqual(hexToRgb(hexOf(center.color)));
    specter.dispose();
  });

  it('sets needsUpdate only on ticks where something can change, and shows the object while active', () => {
    fakeContext();
    const specter = new SpecterPoints(createSpecterBuffers(20), 'low');
    const position = specter.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = specter.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    const versions = (): number[] => [position.version, color.version];
    const start = versions();

    // Nothing active before group B opens: no upload, still hidden.
    specter.apply(0);
    specter.apply(0);
    expect(versions()).toEqual(start);
    expect(specter.points.visible).toBe(false);

    specter.apply(12);
    expect(versions()).toEqual(start.map((v) => v + 1));
    expect(specter.points.visible).toBe(true);
    specter.apply(5);
    expect(versions()).toEqual(start.map((v) => v + 2));

    // The one tick that lands on 0 uploads, the next ones do not.
    specter.apply(0);
    expect(versions()).toEqual(start.map((v) => v + 3));
    expect(specter.points.visible).toBe(false);
    specter.apply(0);
    expect(versions()).toEqual(start.map((v) => v + 3));
    specter.dispose();
  });

  it('disposes geometry, material and texture exactly once, and removes the object', () => {
    fakeContext();
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const parent = new THREE.Group();
    const specter = new SpecterPoints(createSpecterBuffers(10), 'low');
    parent.add(specter.points);
    specter.dispose();
    specter.dispose();
    expect(parent.children).toHaveLength(0);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(texture).toHaveBeenCalledTimes(1);
    specter.apply(5);
    expect(specter.points.visible).toBe(false);
  });

  it('draws plain dark points with no texture, no message and no console output when there is no 2D context', () => {
    noContext();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const texture = vi.spyOn(THREE.Texture.prototype, 'dispose');
    const specter = new SpecterPoints(createSpecterBuffers(10), 'low');
    const material = specter.points.material as THREE.PointsMaterial;
    expect(material.map).toBeNull();
    expect(`#${material.color.getHexString()}`).toBe(SPECTER_BODY_COLOR);
    specter.dispose();
    expect(texture).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('allocates nothing in apply and adds no light or shadow caster', () => {
    const source = Object.values(SOURCES)[0] ?? '';
    expect(source).not.toBe('');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const apply = /\bapply\(active: number\): void \{([\s\S]*?)\r?\n  \}\r?\n/.exec(code)?.[1] ?? '';
    expect(apply).not.toBe('');
    expect(apply).not.toMatch(/\bnew\b|\[|=>|\bfunction\b|createElement|getContext|\.map\(|\.filter\(/);
    expect(code).not.toMatch(/\b(PointLight|SpotLight|DirectionalLight|AmbientLight)\b|castShadow/);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import driverSource from '../book/BookSequenceDriver.tsx?raw';

/** The text of the first `useFrame(...)` call, up to its matching parenthesis. */
function frameCallback(source: string): string {
  const start = source.indexOf('useFrame(');
  let depth = 0;
  for (let i = start + 'useFrame'.length; i < source.length; i++) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('useFrame call not found');
}

describe('BookSequenceDriver source', () => {
  const callback = frameCallback(driverSource);

  it('finds the frame callback', () => {
    expect(callback).toContain('readingMachine.tick(delta)');
  });

  it('allocates nothing inside the frame callback', () => {
    expect(callback).not.toContain('new Vector3(');
    expect(callback).not.toMatch(/\bnew\s/);
    expect(callback).not.toMatch(/=\s*[[{]/);
  });

  it('preallocates its vectors and quaternions once, at module level', () => {
    expect(driverSource).toMatch(/^const \w+ = new Vector3\(\);$/m);
    expect(driverSource).toMatch(/^const \w+ = new Quaternion\(\);$/m);
  });

  it('makes the leaf textures when the book leaves closed and disposes them where the curl is released', () => {
    expect(driverSource).toMatch(/wasClosed && !closed[\s\S]*?createLeafCurlMesh\(\);\s*openLeafTextures\(/);
    expect(driverSource).toMatch(/if \(closed\) \{[\s\S]*?releaseCurl\(\);\s*closeLeafTextures\(\);/);
    expect(driverSource.match(/openLeafTextures\(/g)).toHaveLength(1);
    expect(driverSource).toMatch(/return \(\) => \{[\s\S]*?closeLeafTextures\(\);/);
  });

  it('hands the page between texture and overlay from the machine listener, not from the frame', () => {
    expect(driverSource).toMatch(/syncLeafTextures\(readingMachine\.phase\(\), crossfadeStatus\(/);
    expect(callback).not.toMatch(/LeafTextures|setLeafProject|crossfade/i);
  });

  it('does no work while closed or open with idle pages', () => {
    expect(callback).toMatch(/phase === 'closed'/);
    expect(callback).toMatch(/phase === 'open' && isIdle\(/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimCamera, isCameraClaimed, releaseCamera } from '../interaction/cameraOverride';

beforeEach(() => {
  releaseCamera();
});

describe('camera override', () => {
  it('claims and releases', () => {
    expect(isCameraClaimed()).toBe(false);
    claimCamera();
    expect(isCameraClaimed()).toBe(true);
    releaseCamera();
    expect(isCameraClaimed()).toBe(false);
  });

  it('treats a double claim as one claim', () => {
    claimCamera();
    claimCamera();
    expect(isCameraClaimed()).toBe(true);
    releaseCamera();
    expect(isCameraClaimed()).toBe(false);
  });

  it('treats a double release, and a release without a claim, as harmless', () => {
    releaseCamera();
    expect(isCameraClaimed()).toBe(false);
    claimCamera();
    releaseCamera();
    releaseCamera();
    expect(isCameraClaimed()).toBe(false);
    claimCamera();
    expect(isCameraClaimed()).toBe(true);
  });

  it('starts unclaimed in a fresh module state, as after a reload', async () => {
    claimCamera();
    vi.resetModules();
    const fresh = await import('../interaction/cameraOverride');
    expect(fresh.isCameraClaimed()).toBe(false);
    expect(isCameraClaimed()).toBe(true);
  });
});

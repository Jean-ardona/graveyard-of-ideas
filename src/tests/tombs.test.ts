import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buryNewProject, MAX_SLOTS } from '../domain';
import type { Project } from '../domain';
import { getColliders, registerCollider } from '../interaction/colliderRegistry';
import { COLLIDERS, GRAVE_SLOTS } from '../world/config';
import {
  MAX_TOMB_TITLE_LENGTH,
  SLAB_TRAVEL,
  TOMB_SHAPES,
  slabOffset,
  toTombDescriptor,
  toTombDescriptors,
  tombCollider,
  tombShapeForSlot,
  truncateTitle,
} from '../world/tombLogic';

function bury(title: string, projects: Project[] = []): Project[] {
  const result = buryNewProject({ title, description: 'd' }, projects);
  if (!result.ok) throw new Error(result.error);
  return result.projects;
}

describe('truncateTitle', () => {
  it('keeps a short title', () => {
    expect(truncateTitle('Moss Radio')).toBe('Moss Radio');
  });

  it('cuts a long title with an ellipsis within the limit', () => {
    const cut = truncateTitle('x'.repeat(80));
    expect(Array.from(cut)).toHaveLength(MAX_TOMB_TITLE_LENGTH);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('collapses whitespace and control characters', () => {
    expect(truncateTitle('  a \n\t b\u0000c  ')).toBe('a b c');
  });

  it('never exceeds the limit and never splits a code point', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), fc.integer({ min: 1, max: 40 }), (title, max) => {
        const cut = truncateTitle(title, max);
        expect(Array.from(cut).length).toBeLessThanOrEqual(max);
        expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
      }),
    );
  });
});

describe('tombShapeForSlot', () => {
  it('is deterministic and covers all four shapes over the 12 slots', () => {
    const shapes = Array.from({ length: MAX_SLOTS }, (_, slot) => tombShapeForSlot(slot));
    expect(shapes).toEqual(Array.from({ length: MAX_SLOTS }, (_, slot) => tombShapeForSlot(slot)));
    expect(new Set(shapes)).toEqual(new Set(TOMB_SHAPES));
  });

  it('maps any integer to a known shape', () => {
    fc.assert(
      fc.property(fc.integer(), (slot) => {
        expect(TOMB_SHAPES).toContain(tombShapeForSlot(slot));
      }),
    );
  });
});

describe('toTombDescriptor', () => {
  it('places a resting project at its slot', () => {
    const [project] = bury('Tide Clock');
    const descriptor = toTombDescriptor(project as Project);
    const slot = GRAVE_SLOTS[0]!;
    expect(descriptor).toMatchObject({
      slot: 0,
      x: slot.x,
      z: slot.z,
      rotation: slot.rotation,
      title: 'Tide Clock',
      label: 'Open Tide Clock',
    });
  });

  it('gives no tomb to a project that is not resting or has no valid slot', () => {
    const [project] = bury('A');
    expect(toTombDescriptor({ ...(project as Project), status: 'resurrected' })).toBeNull();
    expect(toTombDescriptor({ ...(project as Project), slot: undefined })).toBeNull();
    expect(toTombDescriptor({ ...(project as Project), slot: MAX_SLOTS })).toBeNull();
    expect(toTombDescriptor({ ...(project as Project), slot: -1 })).toBeNull();
  });

  it('keeps one tomb per slot, ordered by slot', () => {
    let projects: Project[] = [];
    for (let i = 0; i < 5; i++) projects = bury(`P${i}`, projects);
    const copy = { ...(projects[1] as Project), id: 'dup' };
    const descriptors = toTombDescriptors([copy, ...projects]);
    expect(descriptors.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(descriptors[1]?.id).toBe('dup');
  });
});

describe('slabOffset', () => {
  it('maps progress 0..1 to the travel and clamps outside', () => {
    expect(slabOffset(0)).toBe(0);
    expect(slabOffset(1)).toBe(SLAB_TRAVEL);
    expect(slabOffset(2)).toBe(SLAB_TRAVEL);
    expect(slabOffset(-1)).toBe(0);
    expect(slabOffset(Number.NaN)).toBe(0);
  });
});

describe('tomb colliders', () => {
  it('registers and removes a collider without touching the fixed ones', () => {
    const [project] = bury('A');
    const box = tombCollider(toTombDescriptor(project as Project)!);
    const remove = registerCollider(box);
    expect(getColliders()).toContain(box);
    expect(getColliders()).toHaveLength(COLLIDERS.length + 1);
    remove();
    expect(getColliders()).not.toContain(box);
    expect(getColliders()).toHaveLength(COLLIDERS.length);
  });
});

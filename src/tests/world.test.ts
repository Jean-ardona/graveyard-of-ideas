import { describe, expect, it } from 'vitest';
import { MAX_SLOTS } from '../domain/types';
import { GRAVE_SLOTS, MIN_SLOT_SPACING } from '../world/config';
import { BUSH_PLACEMENTS, STONE_PLACEMENTS, TREE_PLACEMENTS } from '../world/scenery';

describe('world layout', () => {
  it('defines one grave slot per domain slot', () => {
    expect(GRAVE_SLOTS).toHaveLength(MAX_SLOTS);
  });

  it('keeps at least the minimum spacing between grave slots', () => {
    for (let i = 0; i < GRAVE_SLOTS.length; i++) {
      for (let j = i + 1; j < GRAVE_SLOTS.length; j++) {
        const a = GRAVE_SLOTS[i]!;
        const b = GRAVE_SLOTS[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(MIN_SLOT_SPACING);
      }
    }
  });

  it('places the requested amount of scenery', () => {
    expect(TREE_PLACEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(TREE_PLACEMENTS.length).toBeLessThanOrEqual(15);
    const small = STONE_PLACEMENTS.length + BUSH_PLACEMENTS.length;
    expect(small).toBeGreaterThanOrEqual(30);
    expect(small).toBeLessThanOrEqual(50);
  });

  it('keeps trees clear of grave slots', () => {
    for (const tree of TREE_PLACEMENTS) {
      for (const slot of GRAVE_SLOTS) {
        expect(Math.hypot(tree.x - slot.x, tree.z - slot.z)).toBeGreaterThanOrEqual(5);
      }
    }
  });
});

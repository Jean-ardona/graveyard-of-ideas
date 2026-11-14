import { describe, it, expect } from 'vitest';
import { createProject, bury, allocateSlot, MAX_SLOTS } from '../domain';
import type { Project } from '../domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRestingProject(slot: number): Project {
  return {
    id: `proj-${slot}`,
    title: `Project ${slot}`,
    description: 'desc',
    notes: '',
    links: [],
    status: 'resting',
    slot,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function allSlotsOccupied(): Project[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => makeRestingProject(i));
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

describe('createProject', () => {
  it('creates a project with the supplied title and description', () => {
    const p = createProject({ title: 'Ghost Ship', description: 'An old idea.' });
    expect(p.title).toBe('Ghost Ship');
    expect(p.description).toBe('An old idea.');
  });

  it('generates a non-empty unique id', () => {
    const a = createProject({ title: 'A', description: 'a' });
    const b = createProject({ title: 'B', description: 'b' });
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('sets status to resting', () => {
    const p = createProject({ title: 'T', description: 'D' });
    expect(p.status).toBe('resting');
  });

  it('defaults notes to empty string and links to empty array', () => {
    const p = createProject({ title: 'T', description: 'D' });
    expect(p.notes).toBe('');
    expect(p.links).toEqual([]);
  });

  it('accepts optional fields', () => {
    const p = createProject({
      title: 'T',
      description: 'D',
      goal: 'g',
      abandonReason: 'r',
      epitaph: 'e',
      notes: 'n',
      links: ['https://example.com'],
    });
    expect(p.goal).toBe('g');
    expect(p.abandonReason).toBe('r');
    expect(p.epitaph).toBe('e');
    expect(p.notes).toBe('n');
    expect(p.links).toEqual(['https://example.com']);
  });

  it('sets createdAt and updatedAt as ISO timestamps', () => {
    const before = new Date().toISOString();
    const p = createProject({ title: 'T', description: 'D' });
    const after = new Date().toISOString();
    expect(p.createdAt >= before).toBe(true);
    expect(p.createdAt <= after).toBe(true);
    expect(p.updatedAt).toBe(p.createdAt);
  });

  it('adds a created history entry', () => {
    const p = createProject({ title: 'T', description: 'D' });
    expect(p.history).toHaveLength(1);
    expect(p.history[0]?.kind).toBe('created');
  });

  it('does not assign a slot', () => {
    const p = createProject({ title: 'T', description: 'D' });
    expect(p.slot).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// allocateSlot
// ---------------------------------------------------------------------------

describe('allocateSlot', () => {
  it('returns 0 when there are no projects', () => {
    expect(allocateSlot([])).toBe(0);
  });

  it('returns the first free slot when some slots are taken', () => {
    const projects = [makeRestingProject(0), makeRestingProject(1), makeRestingProject(3)];
    expect(allocateSlot(projects)).toBe(2);
  });

  it('skips non-resting projects when allocating', () => {
    const resting = makeRestingProject(0);
    const resurrected: Project = { ...makeRestingProject(1), status: 'resurrected', slot: undefined };
    expect(allocateSlot([resting, resurrected])).toBe(1);
  });

  it('returns null when all 12 slots are occupied', () => {
    expect(allocateSlot(allSlotsOccupied())).toBeNull();
  });

  it('returns 0 when all slots above 0 are taken', () => {
    const projects = Array.from({ length: MAX_SLOTS - 1 }, (_, i) => makeRestingProject(i + 1));
    expect(allocateSlot(projects)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// bury
// ---------------------------------------------------------------------------

describe('bury', () => {
  it('returns ok:true with a slot assigned when slots are available', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const result = bury(p, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.slot).toBe(0);
    }
  });

  it('assigns the first free slot', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const existing = [makeRestingProject(0), makeRestingProject(1)];
    const result = bury(p, existing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.slot).toBe(2);
    }
  });

  it('returns no_free_slot error when all slots are taken', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const result = bury(p, allSlotsOccupied());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no_free_slot');
    }
  });

  it('does not mutate the input project', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const slotBefore = p.slot;
    const historyLengthBefore = p.history.length;
    bury(p, []);
    expect(p.slot).toBe(slotBefore);
    expect(p.history).toHaveLength(historyLengthBefore);
  });

  it('appends a buried history entry', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const result = bury(p, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const buried = result.project.history.find((h) => h.kind === 'buried');
      expect(buried).toBeDefined();
    }
  });

  it('sets buriedAt and updates updatedAt', () => {
    const before = new Date().toISOString();
    const p = createProject({ title: 'T', description: 'D' });
    const result = bury(p, []);
    const after = new Date().toISOString();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.buriedAt).toBeDefined();
      expect(result.project.buriedAt! >= before).toBe(true);
      expect(result.project.buriedAt! <= after).toBe(true);
      expect(result.project.updatedAt >= before).toBe(true);
    }
  });

  it('keeps status as resting', () => {
    const p = createProject({ title: 'T', description: 'D' });
    const result = bury(p, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.status).toBe('resting');
    }
  });
});

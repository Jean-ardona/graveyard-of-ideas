import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buryNewProject, allocateSlot, MAX_SLOTS } from '../domain';
import type { Project, ProjectInput } from '../domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-11-14T12:00:00.000Z';
const TEST_ID = 'test-id-fixed';

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
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function allSlotsOccupied(): Project[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => makeRestingProject(i));
}

function validInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return { title: 'Ghost Ship', description: 'An old idea.', ...overrides };
}

// ---------------------------------------------------------------------------
// buryNewProject — happy path
// ---------------------------------------------------------------------------

describe('buryNewProject — success', () => {
  it('returns ok:true with the project and updated projects array', () => {
    const result = buryNewProject(validInput(), [], { now: NOW, id: TEST_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.id).toBe(TEST_ID);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toBe(result.project);
  });

  it('stores trimmed title and description', () => {
    const result = buryNewProject(
      validInput({ title: '  Ghost Ship  ', description: '  An old idea.  ' }),
      [],
      { now: NOW, id: TEST_ID },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.title).toBe('Ghost Ship');
    expect(result.project.description).toBe('An old idea.');
  });

  it('assigns slot 0 on an empty graveyard', () => {
    const result = buryNewProject(validInput(), [], { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slot).toBe(0);
  });

  it('assigns the first free slot when some are taken', () => {
    const existing = [makeRestingProject(0), makeRestingProject(1)];
    const result = buryNewProject(validInput(), existing, { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slot).toBe(2);
  });

  it('status is always resting', () => {
    const result = buryNewProject(validInput(), [], { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.status).toBe('resting');
  });

  it('sets createdAt, updatedAt and buriedAt to the injected timestamp', () => {
    const result = buryNewProject(validInput(), [], { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.createdAt).toBe(NOW);
    expect(result.project.updatedAt).toBe(NOW);
    expect(result.project.buriedAt).toBe(NOW);
  });

  it('records a created and a buried history entry', () => {
    const result = buryNewProject(validInput(), [], { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = result.project.history.map((h) => h.kind);
    expect(kinds).toContain('created');
    expect(kinds).toContain('buried');
  });

  it('defaults notes to empty string and links to empty array', () => {
    const result = buryNewProject(validInput(), [], { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.notes).toBe('');
    expect(result.project.links).toEqual([]);
  });

  it('accepts optional fields', () => {
    const result = buryNewProject(
      validInput({ goal: 'g', abandonReason: 'r', epitaph: 'e', notes: 'n', links: ['https://x.com'] }),
      [],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.goal).toBe('g');
    expect(result.project.abandonReason).toBe('r');
    expect(result.project.epitaph).toBe('e');
    expect(result.project.notes).toBe('n');
    expect(result.project.links).toEqual(['https://x.com']);
  });

  it('allows an empty abandonReason (Requirement 3.5)', () => {
    const result = buryNewProject(
      validInput({ abandonReason: undefined }),
      [],
      { now: NOW },
    );
    expect(result.ok).toBe(true);
  });

  it('generates unique ids without the id override', () => {
    const a = buryNewProject(validInput({ title: 'A' }), []);
    const b = buryNewProject(validInput({ title: 'B' }), []);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.project.id).not.toBe(b.project.id);
  });
});

// ---------------------------------------------------------------------------
// buryNewProject — validation errors
// ---------------------------------------------------------------------------

describe('buryNewProject — invalid input', () => {
  it('returns invalid_title for an empty title', () => {
    const result = buryNewProject(validInput({ title: '' }), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_title');
  });

  it('returns invalid_title for a whitespace-only title', () => {
    const result = buryNewProject(validInput({ title: '   ' }), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_title');
  });

  it('returns invalid_description for an empty description', () => {
    const result = buryNewProject(validInput({ description: '' }), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_description');
  });

  it('returns invalid_description for a whitespace-only description', () => {
    const result = buryNewProject(validInput({ description: '\t\n' }), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_description');
  });

  it('does not mutate the projects array on invalid input', () => {
    const projects: Project[] = [];
    buryNewProject(validInput({ title: '' }), projects);
    expect(projects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buryNewProject — graveyard full
// ---------------------------------------------------------------------------

describe('buryNewProject — graveyard full', () => {
  it('returns graveyard_full when all 12 slots are taken', () => {
    const result = buryNewProject(validInput(), allSlotsOccupied());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('graveyard_full');
  });

  it('does not mutate the input projects array when full', () => {
    const projects = allSlotsOccupied();
    const lengthBefore = projects.length;
    buryNewProject(validInput(), projects);
    expect(projects).toHaveLength(lengthBefore);
  });

  it('succeeds after a slot is freed', () => {
    // 11 occupied (slots 1–11), slot 0 is free
    const projects = Array.from({ length: MAX_SLOTS - 1 }, (_, i) => makeRestingProject(i + 1));
    const result = buryNewProject(validInput(), projects, { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.slot).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buryNewProject — no mutation of the input array
// ---------------------------------------------------------------------------

describe('buryNewProject — immutability', () => {
  it('returns a new projects array, not the original', () => {
    const original: Project[] = [];
    const result = buryNewProject(validInput(), original, { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projects).not.toBe(original);
    expect(original).toHaveLength(0);
  });

  it('preserves existing projects in the returned array', () => {
    const existing = [makeRestingProject(0)];
    const result = buryNewProject(validInput(), existing, { now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]).toBe(existing[0]);
  });
});

// ---------------------------------------------------------------------------
// allocateSlot (unchanged, kept for regression)
// ---------------------------------------------------------------------------

describe('allocateSlot', () => {
  it('returns 0 when there are no projects', () => {
    expect(allocateSlot([])).toBe(0);
  });

  it('returns the first free slot when some are taken', () => {
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
});

// ---------------------------------------------------------------------------
// Property-based test: no resting project in the result ever lacks a slot
// ---------------------------------------------------------------------------

describe('buryNewProject — property: every resting project has a slot', () => {
  it('holds for any valid input and any starting graveyard configuration', () => {
    fc.assert(
      fc.property(
        // Arbitrary title and description (non-empty after trim, guaranteed by the generator)
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        // Arbitrary number of occupied slots (0 to MAX_SLOTS - 1) so there is always room
        fc.integer({ min: 0, max: MAX_SLOTS - 1 }),
        (title, description, occupiedCount) => {
          const existing = Array.from({ length: occupiedCount }, (_, i) => makeRestingProject(i));
          const result = buryNewProject({ title, description }, existing);
          if (!result.ok) return; // graveyard_full would only happen if occupiedCount === MAX_SLOTS, excluded above
          for (const p of result.projects) {
            if (p.status === 'resting') {
              expect(p.slot).toBeDefined();
              expect(typeof p.slot).toBe('number');
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('holds even when the call fails: the original projects array is unchanged', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_SLOTS }),
        (occupiedCount) => {
          const existing = Array.from({ length: occupiedCount }, (_, i) => makeRestingProject(i));
          const snapshot = JSON.stringify(existing);
          buryNewProject({ title: 'T', description: 'D' }, existing);
          expect(JSON.stringify(existing)).toBe(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});

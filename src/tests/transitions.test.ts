import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buryNewProject, resurrect, restAgain, honor, remove, MAX_SLOTS } from '../domain';
import type { Project } from '../domain';

const NOW = '2026-11-14T12:00:00.000Z';
const LATER = '2026-11-15T12:00:00.000Z';

function graveyardOf(count: number): Project[] {
  let projects: Project[] = [];
  for (let i = 0; i < count; i++) {
    const r = buryNewProject({ title: `T${i}`, description: 'd' }, projects, { now: NOW, id: `id-${i}` });
    if (r.ok) projects = r.projects;
  }
  return projects;
}

function resurrected(): Project[] {
  const r = resurrect('id-0', { nextAction: 'Write one page' }, graveyardOf(2), { now: LATER });
  if (!r.ok) throw new Error('setup failed');
  return r.projects;
}

describe('resurrect', () => {
  it('sets status, clears slot, stores trimmed next action and appends history', () => {
    const before = graveyardOf(2);
    const r = resurrect('id-0', { nextAction: '  Write one page ', reducedVersion: ' tiny ' }, before, { now: LATER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.status).toBe('resurrected');
    expect(r.project.slot).toBeUndefined();
    expect(r.project.nextAction).toBe('Write one page');
    expect(r.project.reducedVersion).toBe('tiny');
    expect(r.project.resurrectedAt).toBe(LATER);
    expect(r.project.history.at(-1)).toMatchObject({ kind: 'resurrected', at: LATER });
    expect(before[0]?.status).toBe('resting');
  });

  it('rejects an empty or whitespace next action', () => {
    for (const nextAction of ['', '   ']) {
      const r = resurrect('id-0', { nextAction }, graveyardOf(1));
      expect(r).toEqual({ ok: false, error: 'invalid_next_action' });
    }
  });

  it('rejects an already resurrected project and unknown ids', () => {
    expect(resurrect('id-0', { nextAction: 'x' }, resurrected())).toEqual({ ok: false, error: 'invalid_transition' });
    expect(resurrect('nope', { nextAction: 'x' }, graveyardOf(1))).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('restAgain', () => {
  it('moves a resurrected project back to a free slot and appends history', () => {
    const before = resurrected();
    const r = restAgain('id-0', before, { now: LATER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.status).toBe('resting');
    expect(r.project.slot).toBe(0);
    expect(r.project.history.length).toBeGreaterThan(before[0]?.history.length ?? 0);
    expect(before[0]?.status).toBe('resurrected');
  });

  it('rejects a project that is not resurrected', () => {
    expect(restAgain('id-1', resurrected())).toEqual({ ok: false, error: 'invalid_transition' });
  });

  it('fails when the graveyard is full', () => {
    const full = graveyardOf(MAX_SLOTS);
    const r = resurrect('id-0', { nextAction: 'x' }, full);
    if (!r.ok) throw new Error('setup failed');
    const filler = buryNewProject({ title: 'F', description: 'd' }, r.projects, { id: 'filler' });
    if (!filler.ok) throw new Error('setup failed');
    expect(restAgain('id-0', filler.projects)).toEqual({ ok: false, error: 'graveyard_full' });
  });
});

describe('honor', () => {
  it('sets accomplished, clears slot, keeps optional result and link', () => {
    const r = honor('id-0', { result: ' Shipped ', resultLink: 'https://x.com' }, resurrected(), { now: LATER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.status).toBe('accomplished');
    expect(r.project.slot).toBeUndefined();
    expect(r.project.result).toBe('Shipped');
    expect(r.project.resultLink).toBe('https://x.com');
    expect(r.project.history.at(-1)?.kind).toBe('honored');
  });

  it('works without result or link and rejects resting projects', () => {
    expect(honor('id-0', {}, resurrected()).ok).toBe(true);
    expect(honor('id-1', {}, resurrected())).toEqual({ ok: false, error: 'invalid_transition' });
  });
});

describe('remove', () => {
  it('deletes the project and frees its slot', () => {
    const before = graveyardOf(3);
    const r = remove('id-1', before);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projects.map((p) => p.id)).toEqual(['id-0', 'id-2']);
    expect(before).toHaveLength(3);
    const again = buryNewProject({ title: 'N', description: 'd' }, r.projects);
    expect(again.ok && again.project.slot).toBe(1);
  });

  it('returns not_found for an unknown id', () => {
    expect(remove('nope', graveyardOf(1))).toEqual({ ok: false, error: 'not_found' });
  });
});

// ---------------------------------------------------------------------------
// Property tests over random operation sequences
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'bury' }
  | { kind: 'resurrect'; index: number; nextAction: string }
  | { kind: 'restAgain'; index: number }
  | { kind: 'honor'; index: number }
  | { kind: 'remove'; index: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ kind: 'bury' }),
  fc.record({ kind: fc.constant('resurrect' as const), index: fc.nat(30), nextAction: fc.string() }),
  fc.record({ kind: fc.constant('restAgain' as const), index: fc.nat(30) }),
  fc.record({ kind: fc.constant('honor' as const), index: fc.nat(30) }),
  fc.record({ kind: fc.constant('remove' as const), index: fc.nat(30) }),
);

function apply(projects: Project[], op: Op, counter: number): Project[] {
  const target = projects.length > 0 ? projects[op.kind === 'bury' ? 0 : op.index % projects.length] : undefined;
  const id = target?.id ?? 'none';
  switch (op.kind) {
    case 'bury': {
      const r = buryNewProject({ title: 'T', description: 'd' }, projects, { id: `p-${counter}` });
      return r.ok ? r.projects : projects;
    }
    case 'resurrect': {
      const r = resurrect(id, { nextAction: op.nextAction }, projects);
      return r.ok ? r.projects : projects;
    }
    case 'restAgain': {
      const r = restAgain(id, projects);
      return r.ok ? r.projects : projects;
    }
    case 'honor': {
      const r = honor(id, {}, projects);
      return r.ok ? r.projects : projects;
    }
    case 'remove': {
      const r = remove(id, projects);
      return r.ok ? r.projects : projects;
    }
  }
}

describe('properties', () => {
  const opsArb = fc.array(opArb, { maxLength: 60 });

  /**
   * **Feature: graveyard-core, Property 1: Resurrect never duplicates: project count unchanged and ids stay unique**
   * **Validates: Requirements 5**
   */
  it('P1: resurrect never duplicates', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_SLOTS }), fc.nat(30), (count, index) => {
        const before = graveyardOf(count);
        const id = before[index % count]?.id ?? '';
        const r = resurrect(id, { nextAction: 'go' }, before);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projects).toHaveLength(before.length);
        expect(new Set(r.projects.map((p) => p.id)).size).toBe(r.projects.length);
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 2: Slot uniqueness: no two resting projects share a slot**
   * **Validates: Requirements 4**
   */
  it('P2: no two resting projects share a slot after any sequence', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        let projects: Project[] = [];
        ops.forEach((op, i) => {
          projects = apply(projects, op, i);
          const slots = projects.filter((p) => p.status === 'resting').map((p) => p.slot);
          expect(new Set(slots).size).toBe(slots.length);
        });
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 3: Slot ownership: only resting projects have a slot**
   * **Validates: Requirements 4**
   */
  it('P3: only resting projects have a slot', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        let projects: Project[] = [];
        ops.forEach((op, i) => {
          projects = apply(projects, op, i);
          for (const p of projects) {
            if (p.status === 'resting') {
              expect(typeof p.slot).toBe('number');
            } else {
              expect(p.slot).toBeUndefined();
            }
          }
        });
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 7: Resurrect requires a next action; failure leaves data unchanged**
   * **Validates: Requirements 5**
   */
  it('P7: resurrect without a next action fails and leaves data unchanged', () => {
    const blank = fc.array(fc.constantFrom(' ', '\t', '\n'), { maxLength: 5 }).map((a) => a.join(''));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_SLOTS }), blank, (count, nextAction) => {
        const before = graveyardOf(count);
        const snapshot = JSON.stringify(before);
        const r = resurrect('id-0', { nextAction }, before);
        expect(r.ok).toBe(false);
        expect(JSON.stringify(before)).toBe(snapshot);
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 8: History is append-only**
   * **Validates: Requirements 6, 7**
   */
  it('P8: history never shrinks for a surviving project', () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        let projects: Project[] = [];
        ops.forEach((op, i) => {
          const previous = projects;
          projects = apply(projects, op, i);
          for (const p of projects) {
            const old = previous.find((q) => q.id === p.id);
            if (!old) continue;
            expect(p.history.length).toBeGreaterThanOrEqual(old.history.length);
            expect(p.history.slice(0, old.history.length)).toEqual(old.history);
          }
        });
      }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  EDITABLE_FIELDS,
  buryNewProject,
  editProject,
  exportData,
  importData,
  maxLengthOf,
} from '../domain';
import type { Project } from '../domain';
import { BOOK_PARTS } from '../book/bookParts';
import { createBookAssets } from '../book/bookAssets';
import { emptyData } from '../store/persistence';
import { createGraveyardStore } from '../store';

function restingProjects(count: number): Project[] {
  let projects: Project[] = [];
  for (let i = 0; i < count; i++) {
    const result = buryNewProject({ title: `P${i}`, description: 'd', goal: 'g' }, projects);
    if (!result.ok) throw new Error(result.error);
    projects = result.projects;
  }
  return projects;
}

describe('BOOK_PARTS', () => {
  it('has the four parts in order', () => {
    expect(BOOK_PARTS.map((part) => part.title)).toEqual([
      'Ambition',
      'Abandonment',
      'Remains',
      'Second chance',
    ]);
  });

  it('shows every editable field exactly once', () => {
    const shown = BOOK_PARTS.flatMap((part) => part.fields.map((spec) => spec.field));
    expect([...shown].sort()).toEqual([...EDITABLE_FIELDS].sort());
  });
});

describe('editProject', () => {
  it('changes only the edited project and field, and stamps updatedAt', () => {
    const projects = restingProjects(2);
    const [first, second] = projects as [Project, Project];
    const result = editProject(first.id, { notes: 'a torn page' }, projects, { now: '2030-01-01T00:00:00.000Z' });
    if (!result.ok) throw new Error(result.error);
    expect(result.project).toEqual({ ...first, notes: 'a torn page', updatedAt: '2030-01-01T00:00:00.000Z' });
    expect(result.projects[1]).toBe(second);
    expect(result.projects).toHaveLength(2);
  });

  it('removes an optional field that is emptied', () => {
    const projects = restingProjects(1);
    const result = editProject(projects[0]!.id, { goal: '' }, projects);
    if (!result.ok) throw new Error(result.error);
    expect('goal' in result.project).toBe(false);
  });

  it('returns the same projects when nothing changes', () => {
    const projects = restingProjects(1);
    const result = editProject(projects[0]!.id, { goal: 'g', notes: '' }, projects);
    expect(result.ok && result.projects).toBe(projects);
  });

  it('rejects a blank description, unknown ids and over-long text', () => {
    const projects = restingProjects(1);
    const id = projects[0]!.id;
    expect(editProject(id, { description: '   ' }, projects)).toEqual({ ok: false, error: 'invalid_description' });
    expect(editProject('nope', { notes: 'x' }, projects)).toEqual({ ok: false, error: 'not_found' });
    expect(editProject(id, { goal: 'x'.repeat(maxLengthOf('goal') + 1) }, projects)).toEqual({
      ok: false,
      error: 'too_long',
    });
  });

  it('keeps data exportable after any accepted edit', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EDITABLE_FIELDS),
        fc.string({ maxLength: 300 }),
        (field, value) => {
          const projects = restingProjects(1);
          const result = editProject(projects[0]!.id, { [field]: value }, projects);
          const next = result.ok ? result.projects : projects;
          const data = { ...emptyData(), seeded: true, projects: next };
          expect(importData(exportData(data)).ok).toBe(true);
          if (result.ok) expect(result.project.id).toBe(projects[0]!.id);
          expect(next).toHaveLength(1);
        },
      ),
    );
  });
});

describe('store editProject', () => {
  it('saves an edit into the store data and ignores a no-op', () => {
    const store = createGraveyardStore(null);
    const created = store.getState().buryNewProject({ title: 'A', description: 'd' });
    if (!created.ok) throw new Error(created.error);

    store.getState().editProject(created.project.id, { epitaph: 'Rest well' });
    expect(store.getState().data.projects[0]?.epitaph).toBe('Rest well');

    const before = store.getState().data;
    store.getState().editProject(created.project.id, { epitaph: 'Rest well' });
    expect(store.getState().data).toBe(before);
  });
});

describe('book assets', () => {
  it('builds four separate parts and disposes them', () => {
    const assets = createBookAssets();
    const parts = [assets.cover, assets.spine, assets.pageBlock, assets.pages];
    expect(new Set(parts).size).toBe(4);
    parts.forEach((geometry) => expect(geometry.getAttribute('position').count).toBeGreaterThan(0));
    expect(() => assets.dispose()).not.toThrow();
  });
});

import { afterAll, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import * as THREE from 'three';
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
import { BOOK_SIZE, createBookAssets } from '../book/bookAssets';
import { getBookHandle, registerBookHandle } from '../book/bookHandles';
import { createBookModel } from '../book/bookModel';
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

function meshesOf(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('book assets', () => {
  it('builds four separate geometries with content', () => {
    const assets = createBookAssets();
    const geometries = [assets.frontBoard, assets.spine, assets.pageBlock, assets.leaf];
    expect(new Set(geometries).size).toBe(4);
    geometries.forEach((geometry) => expect(geometry.getAttribute('position').count).toBeGreaterThan(0));
    assets.dispose();
  });

  it('releases every geometry, material and the texture exactly once', () => {
    const assets = createBookAssets();
    const resources = [
      assets.frontBoard,
      assets.spine,
      assets.pageBlock,
      assets.leaf,
      assets.coverMaterial,
      assets.spineMaterial,
      assets.pageBlockMaterial,
      assets.leafMaterial,
      assets.coverTexture,
    ];
    const disposed = resources.map((resource) => {
      const listener = vi.fn();
      resource.addEventListener('dispose', listener);
      return listener;
    });
    assets.dispose();
    disposed.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1));
  });
});

describe('book model', () => {
  const assets = createBookAssets();
  afterAll(() => assets.dispose());

  it('has four separate parts, each holding its own meshes, and three leaves', () => {
    const model = createBookModel(assets);
    const { cover, spine, pageBlock, pages } = model.parts;
    expect(new Set([cover, spine, pageBlock, pages]).size).toBe(4);
    expect([cover, spine, pageBlock].map((part) => meshesOf(part).length)).toEqual([1, 1, 1]);
    expect(meshesOf(pages)).toHaveLength(3);
    expect(model.leaves).toHaveLength(3);
    expect(meshesOf(model.root)).toHaveLength(6);
  });

  it('shares one geometry and one material between the three leaves and between books', () => {
    const first = createBookModel(assets);
    const second = createBookModel(assets);
    const leafMeshes = meshesOf(first.parts.pages);
    expect(new Set(leafMeshes.map((mesh) => mesh.geometry)).size).toBe(1);
    expect(new Set(leafMeshes.map((mesh) => mesh.material)).size).toBe(1);
    const geometries = new Set([...meshesOf(first.root), ...meshesOf(second.root)].map((mesh) => mesh.geometry));
    expect(geometries.size).toBe(4);
    expect(meshesOf(first.root).every((mesh, i) => mesh.material === meshesOf(second.root)[i]!.material)).toBe(true);
  });

  it('uses the cover texture on the front board only', () => {
    const model = createBookModel(assets);
    const withMap = meshesOf(model.root).filter(
      (mesh) => (mesh.material as THREE.MeshStandardMaterial).map === assets.coverTexture,
    );
    expect(withMap).toEqual(meshesOf(model.parts.cover));
  });

  it('sits flush with the leaf stack at angle 0 and turns about the spine axis', () => {
    const model = createBookModel(assets);
    const { cover, pages } = model.parts;
    expect(worldBox(cover).min.z).toBeCloseTo(worldBox(pages).max.z, 6);
    expect(worldBox(cover).max.z).toBeCloseTo(BOOK_SIZE.depth / 2, 6);

    const spineAxisX = cover.position.x;
    const closed = worldBox(cover);
    cover.rotation.y = -Math.PI / 2;
    const open = worldBox(cover);
    // The free edge swings out toward +z while the hinge stays on the spine axis.
    expect(open.max.z).toBeGreaterThan(closed.max.z + 0.2);
    // Half a board thickness (0.006) either side of the axis, nothing more.
    expect(Math.abs(open.min.x - spineAxisX)).toBeLessThanOrEqual(0.0061);
    expect(Math.abs(open.max.x - spineAxisX)).toBeLessThanOrEqual(0.0061);
    expect(cover.position.x).toBe(spineAxisX);
  });

  it('adds no light and no shadow flag', () => {
    const model = createBookModel(assets);
    model.root.traverse((object) => {
      expect(object).not.toBeInstanceOf(THREE.Light);
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
    });
  });

  it('is reachable by project id through its handle', () => {
    const model = createBookModel(assets);
    const remove = registerBookHandle({ id: 'p1', root: model.root, parts: model.parts, leaves: model.leaves });
    const handle = getBookHandle('p1');
    expect(handle?.root).toBe(model.root);
    expect(handle?.leaves).toHaveLength(3);
    remove();
    expect(getBookHandle('p1')).toBeUndefined();
  });
});

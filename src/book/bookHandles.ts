import type * as THREE from 'three';

/** The four separate parts of a rendered book, for effects that treat them one by one. */
export interface BookParts {
  readonly cover: THREE.Object3D;
  readonly spine: THREE.Object3D;
  readonly pageBlock: THREE.Object3D;
  readonly pages: THREE.Object3D;
}

export interface BookHandle {
  /** Id of the project the book belongs to. */
  readonly id: string;
  readonly parts: BookParts;
}

const handles = new Map<string, BookHandle>();

/** Makes a book reachable by project id. Returns a function that removes it. */
export function registerBookHandle(handle: BookHandle): () => void {
  handles.set(handle.id, handle);
  return () => {
    if (handles.get(handle.id) === handle) handles.delete(handle.id);
  };
}

export function getBookHandle(id: string): BookHandle | undefined {
  return handles.get(id);
}

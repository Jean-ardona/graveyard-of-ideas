import type * as THREE from 'three';

/**
 * The four separate parts of a rendered book, for effects that treat them one by one.
 * `cover` is the hinge of the front board: its rotation about y turns the board about the spine.
 * Opening is a negative rotation about y (the board swings toward +z, then to the left).
 */
export interface BookParts {
  readonly cover: THREE.Object3D;
  readonly spine: THREE.Object3D;
  readonly pageBlock: THREE.Object3D;
  /** The stack of leaves. */
  readonly pages: THREE.Object3D;
}

export interface BookHandle {
  /** Id of the project the book belongs to. */
  readonly id: string;
  /** The whole book; moving it moves every part. */
  readonly root: THREE.Object3D;
  readonly parts: BookParts;
  /** The leaf hinges, page 1 first. Each turns about the spine like the cover. */
  readonly leaves: readonly THREE.Object3D[];
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

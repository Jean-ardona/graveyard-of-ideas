import { COLLIDERS } from '../world/config';
import type { BoxCollider } from '../world/config';

const dynamic: BoxCollider[] = [];
let all: readonly BoxCollider[] = COLLIDERS;

function rebuild(): void {
  all = [...COLLIDERS, ...dynamic];
}

/** Adds a temporary obstacle (a tomb). Returns a function that removes it. */
export function registerCollider(box: BoxCollider): () => void {
  dynamic.push(box);
  rebuild();
  return () => {
    const index = dynamic.indexOf(box);
    if (index < 0) return;
    dynamic.splice(index, 1);
    rebuild();
  };
}

/** Fixed colliders plus the registered ones. The array is replaced only when a collider changes. */
export function getColliders(): readonly BoxCollider[] {
  return all;
}

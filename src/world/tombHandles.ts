/** What the rest of the app can do with a rendered tomb. */
export interface TombHandle {
  readonly id: string;
  /** Slides the front slab: 0 is closed, 1 is fully open. Values outside the range are clamped. */
  setOpenProgress(progress: number): void;
  getOpenProgress(): number;
}

const handles = new Map<string, TombHandle>();

/** Makes a tomb reachable by project id. Returns a function that removes it. */
export function registerTombHandle(handle: TombHandle): () => void {
  handles.set(handle.id, handle);
  return () => {
    if (handles.get(handle.id) === handle) handles.delete(handle.id);
  };
}

export function getTombHandle(id: string): TombHandle | undefined {
  return handles.get(id);
}

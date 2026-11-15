import { useSyncExternalStore } from 'react';

/** Where a page of the open book is on screen, in CSS pixels, with the screen x of the spine. */
export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
  spineX: number;
}

/** Written by the sequence driver when the book is open and when the window resizes; never per frame. */
const rect: PageRect = { left: 0, top: 0, width: 0, height: 0, spineX: 0 };
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Writes the right-hand page rectangle and the screen x of the spine. */
export function writePageRect(left: number, top: number, width: number, height: number, spineX: number): void {
  rect.left = left;
  rect.top = top;
  rect.width = width;
  rect.height = height;
  rect.spineX = spineX;
  notify();
}

/** Forgets the rectangle, for example when the book closes. */
export function clearPageRect(): void {
  if (rect.width === 0 && rect.height === 0) return;
  writePageRect(0, 0, 0, 0, 0);
}

/**
 * The left-hand page: the right-hand rectangle mirrored around the spine. Computed from the one
 * projection of the right page, so nothing is projected again.
 */
export function mirrorPageRect(source: PageRect): PageRect {
  const left = 2 * source.spineX - (source.left + source.width);
  return { left, top: source.top, width: source.width, height: source.height, spineX: source.spineX };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The projected right-hand page rectangle, or null before the driver has written one. */
export function usePageRect(): PageRect | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

import { useSyncExternalStore } from 'react';

/** Where the right-hand page of the open book is on screen, in CSS pixels. */
export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Written by the sequence driver when the book is open and when the window resizes; never per frame. */
const rect: PageRect = { left: 0, top: 0, width: 0, height: 0 };
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function writePageRect(left: number, top: number, width: number, height: number): void {
  rect.left = left;
  rect.top = top;
  rect.width = width;
  rect.height = height;
  notify();
}

/** Forgets the rectangle, for example when the book closes. */
export function clearPageRect(): void {
  if (rect.width === 0 && rect.height === 0) return;
  writePageRect(0, 0, 0, 0);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The projected page rectangle, or null before the driver has written one. */
export function usePageRect(): PageRect | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

import { useSyncExternalStore } from 'react';
import type { Interactable } from './interactables';

const items: Interactable[] = [];
const handlers = new Map<string, () => void>();
const listeners = new Set<() => void>();
let focused: Interactable | null = null;

/** Adds an interactable. Returns a function that removes it. */
export function registerInteractable(item: Interactable): () => void {
  items.push(item);
  return () => {
    const index = items.indexOf(item);
    if (index >= 0) items.splice(index, 1);
    if (focused === item) setFocused(null);
  };
}

/** Sets the function that runs when the player presses E on an interactable with this action. */
export function registerActionHandler(action: string, handler: () => void): () => void {
  handlers.set(action, handler);
  return () => {
    if (handlers.get(action) === handler) handlers.delete(action);
  };
}

export function getInteractables(): readonly Interactable[] {
  return items;
}

export function getFocused(): Interactable | null {
  return focused;
}

export function setFocused(next: Interactable | null): void {
  if (next === focused) return;
  focused = next;
  listeners.forEach((listener) => listener());
}

function subscribeFocused(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs the handler of the focused interactable, if any. */
export function activateFocused(): void {
  if (focused) handlers.get(focused.action)?.();
}

/** Currently focused interactable for UI components. */
export function useFocused(): Interactable | null {
  return useSyncExternalStore(subscribeFocused, getFocused, getFocused);
}

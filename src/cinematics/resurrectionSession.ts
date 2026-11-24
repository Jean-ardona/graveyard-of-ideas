import { useSyncExternalStore } from 'react';
import { comfortFlags } from '../domain/comfort';
import type { Project, ResurrectInput } from '../domain';
import { readingMachine } from '../book/readingMachine';
import { ritualMachine } from '../interaction/ritualMachine';
import { canStartResurrection } from '../interaction/uiMode';
import type { UiMode } from '../interaction/uiMode';
import { appStore } from '../store/appStore';
import type { GraveyardStore } from '../store/graveyardStore';
import { toTombDescriptor } from '../world/tombLogic';
import type { TombDescriptor } from '../world/tombLogic';

/**
 * The one resurrection of the app. The save always comes first: `startResurrection` writes status
 * Resurrected, and only then does the sequence run. A resurrected project has no slot and is no longer
 * "resting", so the tomb it leaves is kept alive here (UI-only, never persisted) until the sequence ends.
 */

const NO_TOMBS: readonly TombDescriptor[] = [];

let held: readonly TombDescriptor[] = NO_TOMBS;
let running = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeResurrection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True from the start of the resurrection until its tomb is gone. */
export function isResurrecting(): boolean {
  return held.length > 0;
}

/** True once the save is done and the sequence may play. */
export function isResurrectionRunning(): boolean {
  return running;
}

/** The tombs kept on screen for the sequence. The same array until it changes. */
export function getHeldTombs(): readonly TombDescriptor[] {
  return held;
}

/** The UI mode the guards must see: `resurrecting` for the whole sequence, else the book mode. */
export function currentUiMode(): UiMode {
  return isResurrecting() ? 'resurrecting' : readingMachine.uiMode();
}

/** True when the sequence should skip its motion: reduced animations or calm mode. */
export function wantsInstantSequence(store: GraveyardStore = appStore): boolean {
  return comfortFlags(store.getState().data.prefs).motionScale < 1;
}

/**
 * Confirms a resurrection from the open book. Saves first: if the save is refused nothing changes and
 * no sequence plays. On success the book reading ends (the saved project is no longer resting), the
 * tomb is held, and listeners learn that the sequence may start.
 */
export function startResurrection(
  projectId: string,
  input: ResurrectInput,
  store: GraveyardStore = appStore,
): boolean {
  const project: Project | undefined = store.getState().data.projects.find((p) => p.id === projectId);
  const descriptor = project === undefined ? null : toTombDescriptor(project);
  const allowed = canStartResurrection({
    mode: currentUiMode(),
    ritualPhase: ritualMachine.phase(),
    projectResting: descriptor !== null,
    resurrecting: isResurrecting(),
  });
  if (!allowed || descriptor === null) return false;
  held = [descriptor];
  notify();
  const result = store.getState().resurrect(projectId, input);
  if (!result.ok) {
    held = NO_TOMBS;
    notify();
    return false;
  }
  running = true;
  notify();
  return true;
}

/** Ends the sequence: the held tomb is released, so its tomb, book and collider are removed. */
export function endResurrection(): void {
  if (held.length === 0 && !running) return;
  held = NO_TOMBS;
  running = false;
  notify();
}

/** Tombs kept on screen for the resurrection sequence, for the tomb renderer. */
export function useHeldTombs(): readonly TombDescriptor[] {
  return useSyncExternalStore(subscribeResurrection, getHeldTombs, getHeldTombs);
}

/** Whether a resurrection is under way, for components that lock input while it runs. */
export function useResurrecting(): boolean {
  return useSyncExternalStore(subscribeResurrection, isResurrecting, isResurrecting);
}

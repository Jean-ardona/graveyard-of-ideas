import { useSyncExternalStore } from 'react';
import { currentUiMode } from '../cinematics/resurrectionSession';
import { allocateSlot, draftToInput } from '../domain';
import { readingMachine } from '../book/readingMachine';
import { appStore } from '../store/appStore';
import type { GraveyardStore } from '../store/graveyardStore';
import { COPY } from '../ui/copy';
import { allowsMovement, getPointerMode, releasePointer, requestPointer } from './pointerLock';
import { markRevealPending } from './revealPending';
import { ritualMachine } from './ritualMachine';
import type { RitualMachine, RitualPhase } from './ritualMachine';

/** How long the full-graveyard message stays on screen. */
export const NOTICE_MS = 4000;

let notice: string | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const noticeListeners = new Set<() => void>();

function setNotice(next: string | null): void {
  if (noticeTimer !== null) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  if (next !== null) noticeTimer = setTimeout(() => setNotice(null), NOTICE_MS);
  if (next === notice) return;
  notice = next;
  noticeListeners.forEach((listener) => listener());
}

function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

const getNotice = (): string | null => notice;

/** The calm message shown when the ritual cannot start, or null. */
export function useRitualNotice(): string | null {
  return useSyncExternalStore(subscribeNotice, getNotice, getNotice);
}

/** Phase of the app's ritual machine, for components that lock input while it runs. */
export function useRitualPhase(machine: RitualMachine = ritualMachine): RitualPhase {
  return useSyncExternalStore(machine.subscribe, machine.phase, machine.phase);
}

/**
 * Starts the burial ritual from the lectern. The slot is only previewed here: it gates the ritual
 * and nothing is written. A refusal because no tomb is free shows the calm message; any other
 * refusal (mode, pointer, open book) is silent. On acceptance the pointer is released.
 */
export function startRitual(machine: RitualMachine = ritualMachine, store: GraveyardStore = appStore): boolean {
  const slotFree = allocateSlot(store.getState().data.projects) !== null;
  machine.send({
    type: 'START',
    guard: {
      mode: currentUiMode(),
      pointerAllowsMovement: allowsMovement(getPointerMode()),
      slotFree,
      bookOpen: readingMachine.phase() !== 'closed',
    },
  });
  if (machine.phase() === 'writing') {
    setNotice(null);
    releasePointer();
    return true;
  }
  if (!slotFree && machine.phase() === 'idle') setNotice(COPY.ritual.graveyardFull);
  return false;
}

/** Saves the draft at once, in the same handler, and reports the outcome to the machine. */
function commitDraft(machine: RitualMachine, store: GraveyardStore): void {
  // The preview gates the ritual only; the store allocates the real slot from the list it writes to.
  if (allocateSlot(store.getState().data.projects) === null) {
    machine.send({ type: 'COMMIT_FAILED', error: 'graveyard_full' });
    return;
  }
  const result = store.getState().commitBurial(draftToInput(machine.state.draft));
  if (!result.ok) {
    machine.send({ type: 'COMMIT_FAILED', error: result.error });
    return;
  }
  // The project is saved. Its book stays hidden until the cinematic reveals it (UI-only flag, never saved);
  // the burial driver clears the flag and sends DONE at the end or on skip.
  markRevealPending(result.project.id);
  machine.send({ type: 'COMMIT_OK', projectId: result.project.id });
  // The Enter or click that sealed the page is a fresh user gesture: take the pointer back now.
  requestPointer();
}

/**
 * Wires the machine to the world: the last NEXT or an accepted SEAL (phase `cinematic`, not yet
 * committed) triggers `commitBurial` synchronously, before any frame; a CANCEL (writing to idle,
 * which only happens before the commit) asks for the pointer again, and a refusal falls to
 * "Click to resume". Returns a function that detaches it.
 */
export function attachRitualSession(
  machine: RitualMachine = ritualMachine,
  store: GraveyardStore = appStore,
): () => void {
  let previous = machine.phase();
  let committing = false;
  const detach = machine.subscribe(() => {
    const was = previous;
    previous = machine.phase();
    if (was === 'writing' && previous === 'idle') {
      requestPointer();
      return;
    }
    if (previous !== 'cinematic' || machine.state.committed || committing) return;
    committing = true;
    try {
      commitDraft(machine, store);
    } finally {
      committing = false;
    }
  });
  return () => {
    detach();
    if (machine === ritualMachine) setNotice(null);
  };
}

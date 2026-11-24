import { RITUAL_STEPS, emptyDraft, firstInvalidStep, validateStep } from '../domain/ritualSteps';
import type { RitualDraft, RitualStepError } from '../domain/ritualSteps';
import { canStartRitual, uiModeForRitualPhase } from './uiMode';
import type { RitualGuardInput, UiMode } from './uiMode';

export type RitualPhase = 'idle' | 'writing' | 'cinematic';

/** A step error, or the one failure that is not about the text: no free tomb. */
export type RitualError = RitualStepError | 'graveyard_full';

export interface RitualState {
  phase: RitualPhase;
  step: number;
  draft: RitualDraft;
  error: RitualError | null;
  committed: boolean;
  projectId: string | null;
}

export type RitualAction =
  | { type: 'START'; guard: RitualGuardInput }
  | { type: 'EDIT'; text: string }
  | { type: 'NEXT' | 'BACK' | 'SKIP_STEP' | 'SEAL' | 'CANCEL' | 'SKIP_CINEMATIC' | 'DONE' }
  | { type: 'COMMIT_OK'; projectId: string }
  | { type: 'COMMIT_FAILED'; error: RitualError };

/**
 * What the caller must do after an action. The machine does not know the store:
 * `commit` asks for the real save, `skip` asks the cinematic to jump to its final state.
 */
export type RitualEffect = 'none' | 'commit' | 'skip';

export interface RitualMachine {
  /** Mutable record, created once. Read it; never replace it. */
  readonly state: RitualState;
  send(action: RitualAction): RitualEffect;
  phase(): RitualPhase;
  uiMode(): UiMode;
  inputLocked(): boolean;
  pointerReleased(): boolean;
  /** Calls `listener` after every discrete change. */
  subscribe(listener: () => void): () => void;
  /** Grows with every discrete change; a snapshot for `useSyncExternalStore`. */
  version(): number;
}

const LAST_STEP = RITUAL_STEPS.length - 1;

export function createRitualMachine(): RitualMachine {
  const state: RitualState = {
    phase: 'idle',
    step: 0,
    draft: emptyDraft(),
    error: null,
    committed: false,
    projectId: null,
  };
  const listeners = new Set<() => void>();
  let version = 0;

  function reset(phase: RitualPhase): void {
    state.phase = phase;
    state.step = 0;
    Object.assign(state.draft, emptyDraft());
    state.error = null;
    state.committed = false;
    state.projectId = null;
  }

  /** Moves to the next page, or asks for the commit from the last one. The caller has validated the page. */
  function advance(): RitualEffect {
    if (state.step < LAST_STEP) {
      state.step += 1;
      state.error = null;
      return 'none';
    }
    state.phase = 'cinematic';
    state.error = null;
    return 'commit';
  }

  function next(): RitualEffect {
    const step = RITUAL_STEPS[state.step];
    if (!step) return 'none';
    const error = validateStep(step.id, state.draft[step.id]);
    if (error) {
      state.error = error;
      return 'none';
    }
    return advance();
  }

  function skipStep(): RitualEffect {
    const step = RITUAL_STEPS[state.step];
    if (!step || step.required) return 'none';
    state.draft[step.id] = '';
    return next();
  }

  function seal(): RitualEffect {
    const invalid = firstInvalidStep(state.draft);
    if (invalid === null) {
      state.phase = 'cinematic';
      state.error = null;
      return 'commit';
    }
    const step = RITUAL_STEPS[invalid];
    state.step = invalid;
    state.error = step ? validateStep(step.id, state.draft[step.id]) : null;
    return 'none';
  }

  function apply(action: RitualAction): RitualEffect {
    switch (action.type) {
      case 'START':
        if (state.phase !== 'idle' || !canStartRitual(action.guard)) return 'none';
        reset('writing');
        return 'none';
      case 'EDIT': {
        const step = RITUAL_STEPS[state.step];
        if (state.phase !== 'writing' || !step) return 'none';
        state.draft[step.id] = action.text;
        state.error = null;
        return 'none';
      }
      case 'NEXT':
        return state.phase === 'writing' ? next() : 'none';
      case 'SKIP_STEP':
        return state.phase === 'writing' ? skipStep() : 'none';
      case 'SEAL':
        return state.phase === 'writing' ? seal() : 'none';
      case 'BACK':
        if (state.phase === 'writing' && state.step > 0) {
          state.step -= 1;
          state.error = null;
        }
        return 'none';
      case 'CANCEL':
        if (state.phase === 'writing') reset('idle');
        return 'none';
      case 'COMMIT_OK':
        if (state.phase !== 'cinematic' || state.committed) return 'none';
        state.committed = true;
        state.projectId = action.projectId;
        return 'none';
      case 'COMMIT_FAILED':
        if (state.phase !== 'cinematic' || state.committed) return 'none';
        state.phase = 'writing';
        state.error = action.error;
        return 'none';
      case 'SKIP_CINEMATIC':
        return state.phase === 'cinematic' && state.committed ? 'skip' : 'none';
      case 'DONE':
        if (state.phase === 'cinematic' && state.committed) reset('idle');
        return 'none';
    }
  }

  return {
    state,
    send(action) {
      const before = JSON.stringify(state);
      const effect = apply(action);
      if (JSON.stringify(state) !== before) {
        version += 1;
        listeners.forEach((listener) => listener());
      }
      return effect;
    },
    phase: () => state.phase,
    uiMode: () => uiModeForRitualPhase(state.phase),
    inputLocked: () => state.phase !== 'idle',
    pointerReleased: () => state.phase === 'writing',
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

/** The one machine of the app. */
export const ritualMachine = createRitualMachine();

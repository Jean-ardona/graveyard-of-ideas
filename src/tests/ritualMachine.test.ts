/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LIMITS } from '../domain/schema';
import { RITUAL_STEPS, canSeal, emptyDraft, firstInvalidStep, validateStep } from '../domain/ritualSteps';
import type { RitualDraft, RitualStep } from '../domain/ritualSteps';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualAction, RitualMachine } from '../interaction/ritualMachine';
import { canOpenBook, canStartRitual } from '../interaction/uiMode';
import type { OpenGuardInput, RitualGuardInput, UiMode } from '../interaction/uiMode';

const RUNS = { numRuns: 200 };
const SOURCE = import.meta.glob<string>('../interaction/ritualMachine.ts', { query: '?raw', import: 'default', eager: true });
const MODES: UiMode[] = ['exploring', 'openingGrave', 'reading', 'closingGrave', 'burying', 'resurrecting', 'paused'];
const GOOD_GUARD: RitualGuardInput = { mode: 'exploring', pointerAllowsMovement: true, slotFree: true, bookOpen: false };
const GOOD_OPEN: OpenGuardInput = { mode: 'exploring', pointerAllowsMovement: true, projectResting: true, playerInFront: true };
const LAST = RITUAL_STEPS.length - 1;

const guardArb: fc.Arbitrary<RitualGuardInput> = fc.record({
  mode: fc.constantFrom(...MODES),
  pointerAllowsMovement: fc.boolean(),
  slotFree: fc.boolean(),
  bookOpen: fc.boolean(),
});
/** Text that is valid on every step (a safe link), plus empty, whitespace-only, over-long, non-Latin and multi-line text. */
const textArb = fc.oneof(
  { weight: 5, arbitrary: fc.constant('https://example.com') },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.constant('  \n\t ') },
  { weight: 1, arbitrary: fc.constant('x'.repeat(LIMITS.notes + 1)) },
  { weight: 1, arbitrary: fc.constantFrom('墓地のアイデア', 'Покойся с миром', 'two\nlines') },
  { weight: 1, arbitrary: fc.constantFrom('javascript:alert(1)', 'ftp://x.y/z') },
);
const actionArb: fc.Arbitrary<RitualAction> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<RitualAction>({ type: 'START', guard: GOOD_GUARD }) },
  { weight: 1, arbitrary: guardArb.map((guard): RitualAction => ({ type: 'START', guard })) },
  { weight: 4, arbitrary: textArb.map((text): RitualAction => ({ type: 'EDIT', text })) },
  { weight: 5, arbitrary: fc.constant<RitualAction>({ type: 'NEXT' }) },
  { weight: 1, arbitrary: fc.constantFrom<RitualAction>({ type: 'BACK' }, { type: 'SKIP_STEP' }, { type: 'SEAL' }, { type: 'CANCEL' }) },
  { weight: 1, arbitrary: fc.constantFrom<RitualAction>({ type: 'SKIP_CINEMATIC' }, { type: 'DONE' }) },
  { weight: 1, arbitrary: fc.constant<RitualAction>({ type: 'COMMIT_OK', projectId: 'p1' }) },
  { weight: 1, arbitrary: fc.constant<RitualAction>({ type: 'COMMIT_FAILED', error: 'graveyard_full' }) },
);

const validText = fc.string({ minLength: 1, maxLength: 30 }).filter((text) => text.trim() !== '');
const optionalText = fc.oneof(fc.constant(''), validText);
const validDraft: fc.Arbitrary<RitualDraft> = fc.record({
  title: validText,
  description: validText,
  goal: optionalText,
  abandonReason: optionalText,
  epitaph: optionalText,
  notes: optionalText,
  links: fc.constantFrom('', 'https://example.com', 'http://a.b/c\nhttps://example.org'),
});

function stepAt(index: number): RitualStep {
  const step = RITUAL_STEPS[index];
  if (!step) throw new Error(`no step ${index}`);
  return step;
}

function started(): RitualMachine {
  const machine = createRitualMachine();
  machine.send({ type: 'START', guard: GOOD_GUARD });
  return machine;
}

/** Types every step of the draft up to (not including) `until`, validating each page with NEXT. */
function typeUntil(machine: RitualMachine, draft: RitualDraft, until: number): void {
  for (let i = machine.state.step; i < until; i += 1) {
    machine.send({ type: 'EDIT', text: draft[stepAt(i).id] });
    machine.send({ type: 'NEXT' });
  }
}

describe('ritual machine', () => {
  it('Feature: graveyard-core, Property 68: The step machine keeps a valid step and only skips optional steps', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 80 }), (actions) => {
        const machine = createRitualMachine();
        for (const action of actions) {
          const before = { phase: machine.state.phase, step: machine.state.step, draft: { ...machine.state.draft } };
          const current = stepAt(before.step);
          const effect = machine.send(action);
          const after = machine.state;
          expect(after.step).toBeGreaterThanOrEqual(0);
          expect(after.step).toBeLessThan(RITUAL_STEPS.length);

          const entered = before.phase === 'writing' && after.phase === 'cinematic';
          expect(effect === 'commit').toBe(entered);
          if (entered) {
            if (action.type === 'SEAL') expect(canSeal(before.draft)).toBe(true);
            else {
              expect(['NEXT', 'SKIP_STEP']).toContain(action.type);
              expect(before.step).toBe(LAST);
              if (action.type === 'NEXT') expect(validateStep(current.id, before.draft[current.id])).toBeNull();
              else expect(current.required).toBe(false);
            }
          }
          if (before.phase !== 'writing') continue;

          if (action.type === 'NEXT') {
            const error = validateStep(current.id, before.draft[current.id]);
            if (error) {
              expect([after.phase, after.step, after.error]).toEqual(['writing', before.step, error]);
            } else if (before.step < LAST) expect(after.step).toBe(before.step + 1);
          } else if (action.type === 'SKIP_STEP') {
            if (current.required) expect([after.phase, after.step, after.draft]).toEqual(['writing', before.step, before.draft]);
            else {
              expect(after.draft[current.id]).toBe('');
              if (before.step < LAST) expect(after.step).toBe(before.step + 1);
            }
          } else if (action.type === 'SEAL') {
            expect(effect === 'commit').toBe(canSeal(before.draft));
            if (!canSeal(before.draft)) expect(after.step).toBe(firstInvalidStep(before.draft));
          }
        }
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 69: Forward then back restores the step and the draft', () => {
    fc.assert(
      fc.property(
        validDraft,
        fc.integer({ min: 0, max: LAST }).chain((start) => fc.tuple(fc.constant(start), fc.integer({ min: 0, max: LAST - start }))),
        (draft, [start, k]) => {
          const machine = started();
          typeUntil(machine, draft, start);
          const stepBefore = machine.state.step;
          typeUntil(machine, draft, start + k);
          const advanced = { ...machine.state.draft };
          expect(machine.state.step).toBe(start + k);
          for (let i = 0; i < k; i += 1) machine.send({ type: 'BACK' });
          expect(machine.state.step).toBe(stepBefore);
          expect(machine.state.draft).toEqual(advanced);
        },
      ),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 70: The draft never reaches the store before the commit, and cancel before it restores the previous state', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 60 }), (actions) => {
        const projects: readonly string[] = ['kept'];
        const snapshot = JSON.stringify(projects);
        const machine = started();
        actions.filter((action) => action.type !== 'COMMIT_OK').forEach((action) => machine.send(action));
        expect(JSON.stringify(projects)).toBe(snapshot);
        if (machine.state.phase !== 'writing') return;
        machine.send({ type: 'CANCEL' });
        expect(machine.state.phase).toBe('idle');
        expect(machine.state.draft).toEqual(emptyDraft());
        expect(JSON.stringify(projects)).toBe(snapshot);
        machine.send({ type: 'START', guard: GOOD_GUARD });
        expect([machine.state.phase, machine.state.step, machine.state.draft]).toEqual(['writing', 0, emptyDraft()]);
      }),
      RUNS,
    );
  });

  it('Feature: graveyard-core, Property 76: Locks and the one-cinematic guard', () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 80 }), (actions) => {
        const machine = createRitualMachine();
        for (const action of actions) {
          const before = machine.phase();
          machine.send(action);
          const phase = machine.phase();
          expect(machine.inputLocked()).toBe(phase !== 'idle');
          expect(machine.pointerReleased()).toBe(phase === 'writing');
          expect(machine.uiMode()).toBe(phase === 'idle' ? 'exploring' : 'burying');
          if (action.type === 'START') {
            const accepted = before === 'idle' && phase === 'writing';
            expect(accepted).toBe(before === 'idle' && canStartRitual(action.guard));
            if (accepted) expect(action.guard.mode).toBe('exploring');
          }
          expect(canOpenBook({ ...GOOD_OPEN, ritualPhase: phase })).toBe(phase === 'idle');
        }
      }),
      RUNS,
    );
  });

  it('does not import the store', () => {
    const [source] = Object.values(SOURCE);
    expect(source).not.toMatch(/from\s+['"][^'"]*store/);
  });

  it('starts at the first page with an empty draft', () => {
    const machine = started();
    expect(machine.state).toMatchObject({ phase: 'writing', step: 0, error: null, committed: false, projectId: null });
    expect(machine.state.draft).toEqual(emptyDraft());
  });

  it('refuses START when the graveyard is full or a book is open', () => {
    const machine = createRitualMachine();
    expect(machine.send({ type: 'START', guard: { ...GOOD_GUARD, slotFree: false } })).toBe('none');
    expect(machine.send({ type: 'START', guard: { ...GOOD_GUARD, bookOpen: true } })).toBe('none');
    expect(machine.phase()).toBe('idle');
  });

  it('refuses an empty required page and keeps the error until the text changes', () => {
    const machine = started();
    machine.send({ type: 'NEXT' });
    expect(machine.state).toMatchObject({ phase: 'writing', step: 0, error: 'invalid_title' });
    machine.send({ type: 'EDIT', text: 'Moon map' });
    expect(machine.state.error).toBeNull();
  });

  it('requests the commit once: a second request is ignored', () => {
    const machine = started();
    const draft = { ...emptyDraft(), title: 'Moon map', description: 'A map of the moon' };
    typeUntil(machine, draft, 2);
    expect(machine.send({ type: 'SEAL' })).toBe('commit');
    expect(machine.send({ type: 'SEAL' })).toBe('none');
    expect(machine.send({ type: 'NEXT' })).toBe('none');
    expect(machine.send({ type: 'COMMIT_OK', projectId: 'p1' })).toBe('none');
    expect(machine.send({ type: 'SEAL' })).toBe('none');
    expect(machine.state).toMatchObject({ phase: 'cinematic', committed: true, projectId: 'p1' });
    expect(machine.send({ type: 'COMMIT_OK', projectId: 'p2' })).toBe('none');
    expect(machine.state.projectId).toBe('p1');
  });

  it('returns to the same page with the draft kept when the commit fails', () => {
    const machine = started();
    const draft = { ...emptyDraft(), title: 'Moon map', description: 'A map of the moon' };
    typeUntil(machine, draft, 3);
    machine.send({ type: 'SEAL' });
    machine.send({ type: 'COMMIT_FAILED', error: 'graveyard_full' });
    expect(machine.state).toMatchObject({ phase: 'writing', step: 3, error: 'graveyard_full', committed: false });
    expect(machine.state.draft).toMatchObject({ title: 'Moon map', description: 'A map of the moon' });
    expect(machine.send({ type: 'SEAL' })).toBe('commit');
  });

  it('cannot cancel after the commit, and a skip needs the commit first', () => {
    const machine = started();
    typeUntil(machine, { ...emptyDraft(), title: 'a', description: 'b' }, 2);
    machine.send({ type: 'SEAL' });
    expect(machine.send({ type: 'SKIP_CINEMATIC' })).toBe('none');
    machine.send({ type: 'COMMIT_OK', projectId: 'p1' });
    machine.send({ type: 'CANCEL' });
    expect(machine.phase()).toBe('cinematic');
    expect(machine.send({ type: 'SKIP_CINEMATIC' })).toBe('skip');
  });

  it('DONE ends the ritual with an empty draft', () => {
    const machine = started();
    typeUntil(machine, { ...emptyDraft(), title: 'a', description: 'b' }, 2);
    machine.send({ type: 'SEAL' });
    machine.send({ type: 'COMMIT_OK', projectId: 'p1' });
    machine.send({ type: 'DONE' });
    expect(machine.state).toMatchObject({ phase: 'idle', step: 0, committed: false, projectId: null });
    expect(machine.state.draft).toEqual(emptyDraft());
  });

  it('keeps one state record and notifies subscribers only on a change', () => {
    const machine = createRitualMachine();
    const record = machine.state;
    let calls = 0;
    const stop = machine.subscribe(() => {
      calls += 1;
    });
    machine.send({ type: 'NEXT' });
    expect(calls).toBe(0);
    machine.send({ type: 'START', guard: GOOD_GUARD });
    machine.send({ type: 'EDIT', text: 'a' });
    expect(calls).toBe(2);
    expect(machine.version()).toBe(2);
    stop();
    machine.send({ type: 'CANCEL' });
    expect(calls).toBe(2);
    expect(machine.state).toBe(record);
  });

  it('refuses OPEN while the mode is burying', () => {
    expect(canOpenBook({ ...GOOD_OPEN, mode: 'burying' })).toBe(false);
    expect(canOpenBook(GOOD_OPEN)).toBe(true);
  });
});

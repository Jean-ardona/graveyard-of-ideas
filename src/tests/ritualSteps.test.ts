import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_SLOTS, allocateSlot, buryNewProject, isSafeLink } from '../domain';
import type { Project } from '../domain';
import { LIMITS } from '../domain/schema';
import { RITUAL_STEPS, canSeal, draftToInput, emptyDraft, firstInvalidStep, validateStep } from '../domain/ritualSteps';
import type { RitualDraft } from '../domain/ritualSteps';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualMachine } from '../interaction/ritualMachine';

const RUNS = { numRuns: 150 };
const GOOD_GUARD = { mode: 'exploring', pointerAllowsMovement: true, slotFree: true, bookOpen: false } as const;

const validText = fc.string({ minLength: 1, maxLength: 40 }).filter((text) => text.trim() !== '');
const optionalText = fc.oneof(fc.constant(''), validText);
const validLine = fc.constantFrom('https://example.com', 'http://a.b/c?d=1', '  https://example.org/x  ');
const validLinks = fc.array(validLine, { maxLength: LIMITS.links }).map((lines) => lines.join('\n'));
const validDraft: fc.Arbitrary<RitualDraft> = fc.record({
  title: validText,
  description: validText,
  goal: optionalText,
  abandonReason: optionalText,
  epitaph: optionalText,
  notes: optionalText,
  links: validLinks,
});

function fullGraveyard(): Project[] {
  let projects: Project[] = [];
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const result = buryNewProject({ title: `Idea ${i}`, description: 'An idea' }, projects);
    if (!result.ok) throw new Error('setup failed');
    projects = result.projects;
  }
  return projects;
}

const FULL = fullGraveyard();
/** Each slot is kept, freed, or held by a project that no longer rests. */
const projectsArb: fc.Arbitrary<Project[]> = fc
  .array(fc.constantFrom('resting', 'gone', 'resurrected'), { minLength: MAX_SLOTS, maxLength: MAX_SLOTS })
  .map((mask) =>
    FULL.flatMap((project, i) => {
      if (mask[i] === 'gone') return [];
      return [mask[i] === 'resurrected' ? { ...project, status: 'resurrected' as const } : project];
    }),
  );

const linkPool = ['https://example.com', 'http://a.b/c', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.y/z', 'not a url', '', '   '];
const linkTextArb = fc.oneof(
  fc.array(fc.constantFrom(...linkPool), { maxLength: 8 }).map((lines) => lines.join('\n')),
  fc.array(validLine, { maxLength: LIMITS.links + 10 }).map((lines) => lines.join('\r\n')),
);

function typeInto(machine: RitualMachine, draft: RitualDraft, until: number): void {
  RITUAL_STEPS.slice(0, until).forEach((step) => {
    machine.send({ type: 'EDIT', text: draft[step.id] });
    machine.send({ type: 'NEXT' });
  });
}

describe('ritual steps', () => {
  it('lists the seven steps in order, required for the first two only', () => {
    expect(RITUAL_STEPS.map((step) => step.id)).toEqual([
      'title',
      'description',
      'goal',
      'abandonReason',
      'epitaph',
      'notes',
      'links',
    ]);
    expect(RITUAL_STEPS.map((step) => step.required)).toEqual([true, true, false, false, false, false, false]);
    expect(RITUAL_STEPS.find((step) => step.id === 'title')?.kind).toBe('line');
    expect(RITUAL_STEPS.find((step) => step.id === 'description')?.kind).toBe('multiline');
  });

  it('refuses an empty or whitespace-only title and description', () => {
    expect(validateStep('title', '')).toBe('invalid_title');
    expect(validateStep('title', ' \n\t ')).toBe('invalid_title');
    expect(validateStep('description', '')).toBe('invalid_description');
    expect(validateStep('description', '   ')).toBe('invalid_description');
  });

  it('accepts empty text on every optional step', () => {
    RITUAL_STEPS.filter((step) => !step.required).forEach((step) => {
      expect(validateStep(step.id, '')).toBeNull();
      expect(validateStep(step.id, '  ')).toBeNull();
    });
  });

  it('refuses over-long text and accepts text at the limit', () => {
    expect(validateStep('title', 'x'.repeat(LIMITS.title + 1))).toBe('too_long');
    expect(validateStep('title', 'x'.repeat(LIMITS.title))).toBeNull();
    expect(validateStep('notes', 'x'.repeat(LIMITS.notes + 1))).toBe('too_long');
    expect(validateStep('goal', 'x'.repeat(LIMITS.field + 1))).toBe('too_long');
  });

  it('accepts non-Latin text', () => {
    expect(validateStep('title', '墓地のアイデア')).toBeNull();
    expect(validateStep('epitaph', 'Покойся с миром')).toBeNull();
  });

  it('rejects an unsafe link line and more links than the limit', () => {
    expect(validateStep('links', 'https://example.com\njavascript:alert(1)')).toBe('invalid_link');
    expect(validateStep('links', Array(LIMITS.links + 1).fill('https://example.com').join('\n'))).toBe('invalid_link');
    expect(validateStep('links', '\n  \nhttps://example.com\n')).toBeNull();
  });

  it('seals only when title and description are filled and every typed field is valid', () => {
    const draft = emptyDraft();
    expect(canSeal(draft)).toBe(false);
    draft.title = 'Moon map';
    expect(canSeal(draft)).toBe(false);
    draft.description = 'A map of the moon';
    expect(canSeal(draft)).toBe(true);
    draft.links = 'ftp://x.y/z';
    expect(canSeal(draft)).toBe(false);
    expect(firstInvalidStep(draft)).toBe(6);
  });

  it('builds the input with trimmed text, empty optional fields left out and links split per line', () => {
    const input = draftToInput({
      ...emptyDraft(),
      title: '  Moon map ',
      description: ' A map ',
      goal: '   ',
      epitaph: ' Rest ',
      links: ' https://example.com \n\n http://a.b/c ',
    });
    expect(input).toEqual({
      title: 'Moon map',
      description: 'A map',
      goal: undefined,
      abandonReason: undefined,
      epitaph: 'Rest',
      notes: undefined,
      links: ['https://example.com', 'http://a.b/c'],
    });
  });
});

describe('ritual draft against the domain', () => {
  it('Feature: graveyard-core, Property 71: Step validation agrees with the domain, and sealing equals skipping through', () => {
    // Every step validates, so the domain accepts the draft while a slot is free.
    fc.assert(
      fc.property(validDraft, projectsArb, (draft, projects) => {
        fc.pre(allocateSlot(projects) !== null);
        expect(canSeal(draft)).toBe(true);
        expect(buryNewProject(draftToInput(draft), projects).ok).toBe(true);
      }),
      RUNS,
    );

    // Sealing at step `at` gives the same input as skipping through the remaining optional steps.
    fc.assert(
      fc.property(validDraft, fc.integer({ min: 2, max: 6 }), (draft, at) => {
        const typed: RitualDraft = { ...emptyDraft(), title: draft.title, description: draft.description };
        RITUAL_STEPS.slice(2, at).forEach((step) => {
          typed[step.id] = draft[step.id];
        });
        const sealed = createRitualMachine();
        const skipped = createRitualMachine();
        [sealed, skipped].forEach((machine) => {
          machine.send({ type: 'START', guard: GOOD_GUARD });
          typeInto(machine, typed, at);
          expect(machine.state.step).toBe(at);
        });
        expect(sealed.send({ type: 'SEAL' })).toBe('commit');
        let effect = 'none';
        for (let i = at; i < RITUAL_STEPS.length; i += 1) effect = skipped.send({ type: 'SKIP_STEP' });
        expect(effect).toBe('commit');
        expect(draftToInput(sealed.state.draft)).toEqual(draftToInput(skipped.state.draft));
        expect(draftToInput(sealed.state.draft)).toEqual(draftToInput(typed));
      }),
      RUNS,
    );

    // Links pass only when every non-blank line is a safe link and the count is within the limit.
    fc.assert(
      fc.property(linkTextArb, (text) => {
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line !== '');
        const expected = lines.length <= LIMITS.links && lines.every((line) => isSafeLink(line));
        expect(validateStep('links', text) === null).toBe(expected);
      }),
      RUNS,
    );
  });
});

describe('previewed slot', () => {
  it('Feature: graveyard-core, Property 72: The previewed slot is free and is the allocated slot', () => {
    fc.assert(
      fc.property(projectsArb, (projects) => {
        const preview = allocateSlot(projects);
        const used = new Set(projects.filter((p) => p.status === 'resting').map((p) => p.slot));
        const result = buryNewProject({ title: 'New idea', description: 'Something new' }, projects);
        if (preview === null) {
          expect(used.size).toBe(MAX_SLOTS);
          expect(result).toEqual({ ok: false, error: 'graveyard_full' });
        } else {
          expect(used.has(preview)).toBe(false);
          expect(result.ok && result.project.slot).toBe(preview);
        }
      }),
      RUNS,
    );
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { layoutPages } from '../book/bookPageLayout';

const projectArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 80 }),
  description: fc.string({ minLength: 1, maxLength: 120 }),
  abandonReason: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
  nextAction: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
  buriedAt: fc.option(
    fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
    { nil: undefined },
  ),
});

describe('layoutPages', () => {
  it('Feature: graveyard-core, Property 14: Page layout shows the required content', () => {
    fc.assert(
      fc.property(projectArb, fc.boolean(), (project, hasHandler) => {
        const pages = layoutPages(project, hasHandler);
        expect(pages).toHaveLength(3);

        expect(pages[0].title).toBe(project.title);
        expect(pages[0].subtitle !== undefined).toBe(project.buriedAt !== undefined);

        const second = pages[1].fields;
        expect(second.map((f) => [f.field, f.value])).toEqual([
          ['abandonReason', project.abandonReason ?? ''],
          ['description', project.description],
        ]);

        const third = pages[2];
        expect(third.fields.map((f) => [f.field, f.value])).toEqual([['nextAction', project.nextAction ?? '']]);
        expect(third.resurrectButton).toBeDefined();
        expect(third.resurrectButton?.disabled).toBe(!hasHandler);
      }),
      { numRuns: 200 },
    );
  });

  it('omits the burial line without a valid date', () => {
    const base = { title: 'T', description: 'd' };
    expect(layoutPages(base, false)[0].subtitle).toBeUndefined();
    expect(layoutPages({ ...base, buriedAt: 'not a date' }, false)[0].subtitle).toBeUndefined();
  });

  it('writes the burial date in long English form', () => {
    const buriedAt = new Date(2026, 2, 15, 12).toISOString();
    const page = layoutPages({ title: 'T', description: 'd', buriedAt }, false)[0];
    expect(page.subtitle).toBe('Buried on March 15, 2026');
  });
});

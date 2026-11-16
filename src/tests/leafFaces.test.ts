import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEAF_FRAME } from '../book/bookAssets';
import { layoutPages } from '../book/bookPageLayout';
import { PAGE_METRICS, faceKey, leafFaces, pageCaption, textureSize, wrapLines, wrapText } from '../book/leafFaces';
import type { DrawOp, TextMeasure } from '../book/leafFaces';
import type { Project } from '../domain';

const RUNS = { numRuns: 200 };

/** Every character is `k` times the font size wide, so the width is always positive and never NaN. */
function fixedWidth(k: number): TextMeasure {
  return (text, size) => Array.from(text).length * size * k;
}

const withoutSpace = (text: string): string => text.replace(/\s/gu, '');

const wordArb = fc.oneof(
  fc.string({ maxLength: 20 }).map((s) => s.replace(/…/g, '')),
  fc.constantFrom('日本語のテキスト', 'Привет мир', 'naïve café', '😀 party', 'a'),
  fc.constant(''),
);
/** Up to three paragraphs, so a field never needs more than the limit of lines when widths are tiny. */
const shortTextArb = fc.array(wordArb, { maxLength: 3 }).map((parts) => parts.join('\n'));
const anyTextArb = fc.oneof(
  shortTextArb,
  fc.string({ minLength: 200, maxLength: 900 }).map((s) => s.replace(/…/g, '')),
  fc.array(wordArb, { maxLength: 40 }).map((parts) => parts.join(' ')),
);

const PROJECT_BASE: Project = {
  id: 'p',
  title: 'T',
  description: 'D',
  goal: 'GOALMARK',
  epitaph: 'EPITAPHMARK',
  notes: 'NOTESMARK',
  links: [],
  status: 'resting',
  history: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DATES = ['2020-05-05T12:00:00.000Z', '2023-11-20T12:00:00.000Z', 'not a date'];

function projectArb(text: fc.Arbitrary<string>): fc.Arbitrary<Project> {
  return fc
    .record({
      title: text,
      description: text,
      abandonReason: fc.option(text, { nil: undefined }),
      nextAction: fc.option(text, { nil: undefined }),
      reducedVersion: fc.option(text, { nil: undefined }),
      buriedAt: fc.option(fc.constantFrom(...DATES), { nil: undefined }),
    })
    .map((fields) => ({ ...PROJECT_BASE, ...fields }));
}

/** Field-by-field equality of two op lists, independent of `faceKey`. */
function sameOps(a: DrawOp[] | undefined, b: DrawOp[] | undefined): boolean {
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every((op, i) => {
    const other = b[i] as Record<string, unknown>;
    const entries = Object.entries(op);
    return entries.length === Object.keys(other).length && entries.every(([key, value]) => other[key] === value);
  });
}

function textOf(ops: DrawOp[]): string {
  return ops.map((op) => (op.kind === 'text' ? op.text : '')).join('');
}

describe('leaf face properties', () => {
  // **Validates: Requirements 2.3, 2.4, 9.2**
  it('Feature: graveyard-core, Property 23: Each page goes on its own leaf face', () => {
    // Text short enough and a measure narrow enough that nothing wraps into a clip.
    fc.assert(
      fc.property(projectArb(shortTextArb), fc.boolean(), (project, handler) => {
        const faces = leafFaces(project, handler, fixedWidth(0.01));
        const pages = layoutPages(project, handler);
        expect(faces).toHaveLength(3);
        expect((faces as unknown[])[3]).toBeUndefined();
        pages.forEach((page, j) => {
          const expected = [
            page.title ?? '',
            page.subtitle ?? '',
            ...page.fields.flatMap((field) => [field.label, field.value]),
            page.resurrectButton?.label ?? '',
            pageCaption(j),
          ].join('');
          expect(withoutSpace(textOf(faces[j]?.front ?? []))).toBe(withoutSpace(expected));
          expect(faces[j]?.back).toEqual([]);
        });
        const everything = faces.map((face) => textOf(face.front)).join('');
        expect(everything).not.toMatch(/GOALMARK|EPITAPHMARK|NOTESMARK/);
      }),
      RUNS,
    );

    // Whatever the text and the measure, no op leaves the page rectangle.
    const k = fc.double({ min: 0.05, max: 0.6, noNaN: true });
    fc.assert(
      fc.property(projectArb(anyTextArb), fc.boolean(), k, (project, handler, width) => {
        const measure = fixedWidth(width);
        const eps = 1e-9;
        for (const face of leafFaces(project, handler, measure)) {
          for (const op of face.front) {
            if (op.kind === 'box') {
              expect(op.x).toBeGreaterThanOrEqual(0);
              expect(op.y).toBeGreaterThanOrEqual(0);
              expect(op.x + op.w).toBeLessThanOrEqual(1 + eps);
              expect(op.y + op.h).toBeLessThanOrEqual(PAGE_METRICS.height);
            } else {
              const w = measure(op.text, op.size, op.font);
              const left = op.align === 'center' ? op.x - w / 2 : op.x;
              expect(left).toBeGreaterThanOrEqual(-eps);
              expect(left + w).toBeLessThanOrEqual(1 + eps);
              expect(op.y).toBeGreaterThanOrEqual(0);
              expect(op.y + op.size).toBeLessThanOrEqual(PAGE_METRICS.height);
            }
          }
        }
      }),
      RUNS,
    );
  });

  // **Validates: Requirements 2.3**
  it('Feature: graveyard-core, Property 24: Wrapped lines fit the page', () => {
    fc.assert(
      fc.property(
        anyTextArb,
        fc.double({ min: 0.05, max: 2, noNaN: true }),
        fc.double({ min: 0.5, max: 1.2, noNaN: true }),
        fc.double({ min: 0.1, max: 0.6, noNaN: true }),
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        (text, width, size, k, maxLines, ellipsis) => {
          const measure = fixedWidth(k);
          const fits = (line: string): boolean => measure(line, size, 'body') <= width || Array.from(line).length === 1;
          const all = wrapLines(text, width, size, 'body', measure);
          expect(all.every(fits)).toBe(true);
          expect(withoutSpace(all.join(''))).toBe(withoutSpace(text));

          const clipped = wrapText(text, width, size, 'body', measure, maxLines, ellipsis);
          const wasClipped = all.length > maxLines;
          expect(clipped.length).toBeLessThanOrEqual(maxLines);
          expect(clipped.every(fits)).toBe(true);
          expect(clipped.some((line) => line.endsWith('…'))).toBe(wasClipped && ellipsis);
          if (!wasClipped) expect(clipped).toEqual(all);
        },
      ),
      RUNS,
    );
  });

  // **Validates: Requirements 2.4, 9.2**
  it('Feature: graveyard-core, Property 25: The face key tracks the drawn text', () => {
    const measure = fixedWidth(0.3);
    const keys = (project: Project): string[] => leafFaces(project, true, measure).map((face) => faceKey(face.front));
    const opsOf = (project: Project): DrawOp[][] => leafFaces(project, true, measure).map((face) => face.front);
    const small = fc.string({ maxLength: 30 }).map((s) => s.replace(/…/g, ''));
    const changes: [keyof Project, number][] = [
      ['title', 0],
      ['buriedAt', 0],
      ['abandonReason', 1],
      ['description', 1],
      ['nextAction', 2],
      ['reducedVersion', 2],
    ];

    fc.assert(
      fc.property(projectArb(small), projectArb(small), fc.constantFrom(...changes), (a, b, [field, leaf]) => {
        // Equal key exactly when the ops are equal, for any two projects.
        const opsA = opsOf(a);
        const opsB = opsOf(b);
        keys(a).forEach((key, j) => expect(key === keys(b)[j]).toBe(sameOps(opsA[j], opsB[j])));
        // The same project always gives the same key.
        expect(keys(a)).toEqual(keys(a));
        // Changing one drawn text changes its own leaf key and no other.
        const changed: Project =
          field === 'buriedAt'
            ? { ...a, buriedAt: a.buriedAt === DATES[0] ? DATES[1] : DATES[0] }
            : { ...a, [field]: `${String(a[field] ?? '')}#` };
        const before = keys(a);
        const after = keys(changed);
        after.forEach((key, j) => expect(key === before[j]).toBe(j !== leaf));
      }),
      RUNS,
    );
  });

  // **Validates: Requirements 8.2**
  it('Feature: graveyard-core, Property 26: The texture size fits the limit and keeps the aspect', () => {
    const face = fc.double({ min: 1e-3, max: 1e3, noNaN: true });
    const limit = fc.integer({ min: 1, max: 4096 });
    fc.assert(
      fc.property(face, face, limit, limit, (fw, fh, maxW, maxH) => {
        const { width, height } = textureSize(fw, fh, maxW, maxH);
        const scale = Math.min(maxW / fw, maxH / fh);
        expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true);
        expect(width).toBeGreaterThanOrEqual(1);
        expect(height).toBeGreaterThanOrEqual(1);
        expect(width).toBeLessThanOrEqual(maxW);
        expect(height).toBeLessThanOrEqual(maxH);
        expect(Math.abs(width - fw * scale)).toBeLessThanOrEqual(1);
        expect(Math.abs(height - fh * scale)).toBeLessThanOrEqual(1);
        const byDefault = textureSize(fw, fh);
        expect(byDefault.width).toBeLessThanOrEqual(512);
        expect(byDefault.height).toBeLessThanOrEqual(768);
      }),
      RUNS,
    );
  });
});

describe('leaf faces', () => {
  const measure = fixedWidth(0.4);
  const project: Project = {
    ...PROJECT_BASE,
    title: 'The Clockwork Orchard',
    description: 'Trees that tell the time',
    abandonReason: 'Ran out of weekends',
    nextAction: 'Sketch one tree',
    reducedVersion: 'One tree, one hour',
    buriedAt: '2023-11-20T12:00:00.000Z',
  };

  it('puts each page on the front of its own leaf and leaves every back empty', () => {
    const [first, second, third] = leafFaces(project, true, measure);
    const texts = (ops: DrawOp[]): string[] => ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    expect(texts(first.front)).toEqual(['The Clockwork Orchard', 'Buried on November 20, 2023', 'Page 1 of 3']);
    expect(texts(second.front)).toEqual([
      'Why it rests',
      'Ran out of weekends',
      'The idea in one line',
      'Trees that tell the time',
      'Page 2 of 3',
    ]);
    expect(texts(third.front)).toEqual([
      'Realistic next action',
      'Sketch one tree',
      'A smaller version (optional)',
      'One tree, one hour',
      'Resurrect this project',
      'Page 3 of 3',
    ]);
    expect([first.back, second.back, third.back]).toEqual([[], [], []]);
  });

  it('draws the field boxes and the button, and no goal, epitaph or notes', () => {
    const faces = leafFaces(project, false, measure);
    const boxes = faces.map((face) => face.front.filter((op) => op.kind === 'box').map((op) => (op.kind === 'box' ? op.role : '')));
    expect(boxes).toEqual([[], ['field', 'field'], ['field', 'field', 'button']]);
    expect(faces.map((face) => textOf(face.front)).join('')).not.toMatch(/GOALMARK|EPITAPHMARK|NOTESMARK/);
  });

  it('clips a long title to three lines with an ellipsis and a field to five lines', () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    const lines = wrapText(long, 0.86, PAGE_METRICS.titleSize, 'title', measure, 3, true);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
    const [, second] = leafFaces({ ...project, description: long }, true, measure);
    const body = second.front.filter((op) => op.kind === 'text' && op.text.startsWith('word'));
    expect(body).toHaveLength(5);
  });

  it('wraps greedily at spaces, on paragraph breaks and inside a word that is too wide', () => {
    const ten = (text: string, size: number): number => Array.from(text).length * size;
    expect(wrapLines('aa bb cc', 5, 1, 'body', ten)).toEqual(['aa bb', 'cc']);
    expect(wrapLines('aa\n\nbb', 5, 1, 'body', ten)).toEqual(['aa', '', 'bb']);
    expect(wrapLines('abcdefghij', 4, 1, 'body', ten)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapLines('', 4, 1, 'body', ten)).toEqual([]);
  });

  it('keeps the page height equal to the leaf frame aspect', () => {
    expect(PAGE_METRICS.height).toBeCloseTo(LEAF_FRAME.height / LEAF_FRAME.width, 6);
  });

  it('gives a 512 x 686 texture for the page face and 512 x 768 for a 2:3 face', () => {
    expect(textureSize(LEAF_FRAME.width, LEAF_FRAME.height)).toEqual({ width: 512, height: 686 });
    expect(textureSize(2, 3)).toEqual({ width: 512, height: 768 });
    expect(textureSize(0, 3)).toEqual({ width: 1, height: 1 });
  });

  it('gives equal keys for equal ops and a different key when the text changes', () => {
    const a = leafFaces(project, true, measure)[0].front;
    const b = leafFaces({ ...project, title: 'Another' }, true, measure)[0].front;
    expect(faceKey(a)).toBe(faceKey(leafFaces(project, false, measure)[0].front));
    expect(faceKey(a)).not.toBe(faceKey(b));
  });
});

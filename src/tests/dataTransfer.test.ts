import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buryNewProject,
  resurrect,
  restAgain,
  honor,
  remove,
  exportData,
  importData,
  CURRENT_SCHEMA_VERSION,
  MAX_IMPORT_CHARS,
  MAX_SLOTS,
} from '../domain';
import type { AppData, Project } from '../domain';

const NOW = '2026-11-14T12:00:00.000Z';

function sampleData(count = 3): AppData {
  let projects: Project[] = [];
  for (let i = 0; i < count; i++) {
    const r = buryNewProject({ title: `T${i}`, description: 'd', links: ['https://a.b'] }, projects, {
      now: NOW,
      id: `id-${i}`,
    });
    if (r.ok) projects = r.projects;
  }
  return { schemaVersion: CURRENT_SCHEMA_VERSION, projects, seeded: true, prefs: { quality: 'low', reducedMotion: false } };
}

/** Exports sample data, lets the caller corrupt the parsed payload, and re-serializes it. */
function corrupted(mutate: (payload: any) => void, data = sampleData()): string {
  const payload = JSON.parse(exportData(data, NOW));
  mutate(payload);
  return JSON.stringify(payload);
}

describe('exportData', () => {
  it('writes the schema version and does not mutate the input', () => {
    const data = sampleData();
    const snapshot = JSON.stringify(data);
    const parsed = JSON.parse(exportData(data, NOW));
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe(NOW);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('importData', () => {
  it('round-trips valid data, including an empty collection', () => {
    for (const data of [sampleData(), sampleData(0)]) {
      expect(importData(exportData(data))).toEqual({ ok: true, data });
    }
  });

  it('rejects non-string input, invalid JSON and non-object roots', () => {
    expect(importData(42)).toEqual({ ok: false, error: 'invalid_json' });
    expect(importData('{nope')).toEqual({ ok: false, error: 'invalid_json' });
    expect(importData('[]')).toEqual({ ok: false, error: 'invalid_schema' });
    expect(importData('null')).toEqual({ ok: false, error: 'invalid_schema' });
  });

  it('rejects payloads over the size limit', () => {
    expect(importData(' '.repeat(MAX_IMPORT_CHARS + 1))).toEqual({ ok: false, error: 'too_large' });
  });

  it('rejects newer, zero and non-integer schema versions', () => {
    expect(importData(corrupted((p) => (p.schemaVersion = CURRENT_SCHEMA_VERSION + 1)))).toEqual({
      ok: false,
      error: 'unsupported_version',
    });
    for (const version of [0, -1, 1.5, '1', null]) {
      expect(importData(corrupted((p) => (p.schemaVersion = version)))).toEqual({ ok: false, error: 'invalid_schema' });
    }
    expect(importData(corrupted((p) => delete p.schemaVersion)).ok).toBe(false);
  });

  it('rejects wrong field types, lengths and statuses', () => {
    const cases: Array<(p: any) => void> = [
      (p) => (p.projects[0].title = 5),
      (p) => (p.projects[0].title = '   '),
      (p) => (p.projects[0].title = 'x'.repeat(201)),
      (p) => (p.projects[0].links = 'https://a.b'),
      (p) => (p.projects[0].links = Array(51).fill('x')),
      (p) => (p.projects[0].status = 'zombie'),
      (p) => (p.projects[0].createdAt = 'not a date'),
      (p) => (p.projects[0].history[0].kind = 'exploded'),
      (p) => (p.projects[0].history[0].text = 7),
      (p) => (p.seeded = 'yes'),
      (p) => (p.prefs.quality = 'ultra'),
      (p) => (p.prefs.reducedMotion = 1),
      (p) => (p.projects = {}),
    ];
    for (const mutate of cases) {
      expect(importData(corrupted(mutate))).toEqual({ ok: false, error: 'invalid_schema' });
    }
  });

  it('rejects duplicate ids and slot violations', () => {
    const cases: Array<(p: any) => void> = [
      (p) => (p.projects[1].id = p.projects[0].id),
      (p) => (p.projects[1].slot = p.projects[0].slot),
      (p) => (p.projects[0].slot = MAX_SLOTS),
      (p) => (p.projects[0].slot = -1),
      (p) => (p.projects[0].slot = 0.5),
      (p) => delete p.projects[0].slot,
      (p) => {
        p.projects[0].status = 'resurrected';
      },
    ];
    for (const mutate of cases) {
      expect(importData(corrupted(mutate)).ok).toBe(false);
    }
  });

  it('rejects more than twelve resting projects', () => {
    const r = importData(
      corrupted((p) => {
        p.projects = Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({ ...p.projects[0], id: `x${i}`, slot: i }));
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('accepts http and https links', () => {
    const json = corrupted((p) => {
      p.projects[0].links = ['http://example.com', 'https://example.com/a?b=1#c', 'HTTPS://EXAMPLE.COM'];
      p.projects[0].resultLink = 'https://example.com/done';
    });
    expect(importData(json).ok).toBe(true);
  });

  it('rejects non-http(s) links with invalid_schema, including case and whitespace variants', () => {
    const unsafe = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      '\tJAVASCRIPT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'DaTa:text/html;base64,AAAA',
      ' \n data:text/plain,hi',
      'vbscript:msgbox(1)',
      'VBScript:msgbox(1)',
      '  vbscript:msgbox(1)',
      'ftp://example.com',
      'not a url',
      '',
    ];
    for (const link of unsafe) {
      expect(importData(corrupted((p) => (p.projects[0].links = [link])))).toEqual({
        ok: false,
        error: 'invalid_schema',
      });
      if (link !== '') {
        expect(importData(corrupted((p) => (p.projects[0].resultLink = link)))).toEqual({
          ok: false,
          error: 'invalid_schema',
        });
      }
    }
  });

  it('rejects out-of-order history', () => {
    const r = importData(corrupted((p) => (p.projects[0].history[0].at = '2030-01-01T00:00:00.000Z')));
    expect(r).toEqual({ ok: false, error: 'invalid_schema' });
  });

  it('rejects dangerous keys without polluting prototypes', () => {
    const payload = exportData(sampleData(), NOW);
    const hostile = [
      payload.replace('{', '{"__proto__":{"polluted":true},'),
      payload.replace('"title"', '"constructor":{"prototype":{"polluted":true}},"title"'),
      payload.replace('"prefs":{', '"prefs":{"prototype":1,'),
    ];
    for (const json of hostile) {
      expect(importData(json)).toEqual({ ok: false, error: 'dangerous_key' });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops unknown keys and does not mutate its input string', () => {
    const json = corrupted((p) => {
      p.extra = 1;
      p.projects[0].extra = 2;
    });
    const result = importData(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(sampleData());
    expect('extra' in result.data).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

const isoArb = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString());
const shortText = fc.string({ maxLength: 40 });
const nonBlank = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== '');

const historyArb = fc.array(
  fc.record(
    {
      at: isoArb,
      kind: fc.constantFrom('created', 'buried', 'resurrected', 'rested', 'honored', 'action-done', 'note'),
      text: shortText,
    },
    { requiredKeys: ['at', 'kind'] },
  ),
  { maxLength: 8 },
).map((entries) => [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));

const projectBaseArb = fc.record(
  {
    title: nonBlank,
    description: nonBlank,
    goal: shortText,
    abandonReason: shortText,
    epitaph: shortText,
    notes: shortText,
    links: fc.array(fc.webUrl(), { maxLength: 4 }),
    status: fc.constantFrom('resting', 'resurrected', 'accomplished'),
    reducedVersion: shortText,
    nextAction: shortText,
    result: shortText,
    resultLink: fc.webUrl(),
    history: historyArb,
    createdAt: isoArb,
    updatedAt: isoArb,
    buriedAt: isoArb,
    resurrectedAt: isoArb,
  },
  { requiredKeys: ['title', 'description', 'notes', 'links', 'status', 'history', 'createdAt', 'updatedAt'] },
);

const slotOrderArb = fc.shuffledSubarray(
  Array.from({ length: MAX_SLOTS }, (_, i) => i),
  { minLength: MAX_SLOTS, maxLength: MAX_SLOTS },
);

const appDataArb: fc.Arbitrary<AppData> = fc
  .tuple(
    fc.array(projectBaseArb, { maxLength: 20 }),
    slotOrderArb,
    fc.boolean(),
    fc.constantFrom<AppData['prefs']['quality']>('low', 'medium', 'high'),
    fc.boolean(),
  )
  .map(([bases, slots, seeded, quality, reducedMotion]) => {
    let nextSlot = 0;
    const projects = bases.map((base, i) => {
      const resting = base.status === 'resting' && nextSlot < MAX_SLOTS;
      const project = { ...base, id: `p-${i}`, status: resting ? 'resting' : 'resurrected' } as Project;
      if (resting) project.slot = slots[nextSlot++];
      return project;
    });
    return { schemaVersion: CURRENT_SCHEMA_VERSION, projects, seeded, prefs: { quality, reducedMotion } };
  });

describe('properties', () => {
  /**
   * **Feature: graveyard-core, Property 4: Export/import round trip: import(export(data)) equals data**
   * **Validates: Requirements 9**
   */
  it('P4: import(export(data)) equals data', () => {
    fc.assert(
      fc.property(appDataArb, (data) => {
        const snapshot = JSON.stringify(data);
        expect(importData(exportData(data))).toEqual({ ok: true, data });
        expect(JSON.stringify(data)).toBe(snapshot);
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 4: Export/import round trip: import(export(data)) equals data**
   * **Validates: Requirements 9**
   *
   * Data is built only through the domain functions, fed with arbitrary (often unsafe) text and links,
   * so anything the domain accepts must also survive export then import.
   */
  it('P4: data produced by domain functions always survives export then import', () => {
    const linkArb = fc.oneof(
      fc.webUrl(),
      fc.webUrl().map((url) => `  ${url}\n`),
      fc.constantFrom('javascript:alert(1)', ' DATA:text/html,x', 'VBScript:x', 'ftp://a.b', ''),
      fc.string({ maxLength: 20 }),
    );
    const pick = fc.nat({ max: 30 });
    const opArb = fc.oneof(
      fc.record({
        type: fc.constant('bury' as const),
        title: shortText,
        description: shortText,
        goal: fc.option(shortText, { nil: undefined }),
        notes: fc.option(shortText, { nil: undefined }),
        links: fc.option(fc.array(linkArb, { maxLength: 3 }), { nil: undefined }),
      }),
      fc.record({ type: fc.constant('resurrect' as const), at: pick, nextAction: shortText, reducedVersion: shortText }),
      fc.record({ type: fc.constant('restAgain' as const), at: pick }),
      fc.record({
        type: fc.constant('honor' as const),
        at: pick,
        result: fc.option(shortText, { nil: undefined }),
        resultLink: fc.option(linkArb, { nil: undefined }),
      }),
      fc.record({ type: fc.constant('remove' as const), at: pick }),
    );

    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        let projects: Project[] = [];
        let tick = 0;
        const now = () => new Date(Date.UTC(2026, 10, 14, 0, 0, tick++)).toISOString();
        const target = (at: number) => projects[at % Math.max(projects.length, 1)]?.id ?? 'missing';

        for (const op of ops) {
          if (op.type === 'bury') {
            const { type: _type, ...input } = op;
            const r = buryNewProject(input, projects, { now: now(), id: `id-${tick}` });
            if (r.ok) projects = r.projects;
          } else if (op.type === 'resurrect') {
            const r = resurrect(target(op.at), op, projects, { now: now() });
            if (r.ok) projects = r.projects;
          } else if (op.type === 'restAgain') {
            const r = restAgain(target(op.at), projects, { now: now() });
            if (r.ok) projects = r.projects;
          } else if (op.type === 'honor') {
            const r = honor(target(op.at), op, projects, { now: now() });
            if (r.ok) projects = r.projects;
          } else {
            const r = remove(target(op.at), projects);
            if (r.ok) projects = r.projects;
          }
        }

        const data: AppData = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          projects,
          seeded: true,
          prefs: { quality: 'low', reducedMotion: false },
        };
        expect(importData(exportData(data))).toEqual({ ok: true, data });
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 5: Import validation: malformed or hostile JSON is rejected and never replaces existing data**
   * **Validates: Requirements 9**
   */
  it('P5: arbitrary or hostile input never throws and never yields data', () => {
    const jsonText = fc.jsonValue().map((value) => JSON.stringify(value));
    const hostileText = fc.constantFrom('__proto__', 'constructor', 'prototype').chain((key) =>
      fc.jsonValue().map((value) => `{"${key}":${JSON.stringify(value)},"schemaVersion":1,"projects":[],"seeded":true}`),
    );
    fc.assert(
      fc.property(fc.oneof(fc.anything(), fc.string(), jsonText, hostileText), (input) => {
        const result = importData(input);
        if (result.ok) {
          // Only a well-formed document may be accepted; arbitrary input practically never is.
          expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
          expect(typeof input).toBe('string');
        }
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      }),
    );
  });

  /**
   * **Feature: graveyard-core, Property 5: Import validation: malformed or hostile JSON is rejected and never replaces existing data**
   * **Validates: Requirements 9**
   */
  it('P5: corrupting an otherwise valid export is always rejected', () => {
    const corruptions: Array<(p: any) => void> = [
      (p) => (p.schemaVersion = CURRENT_SCHEMA_VERSION + 1),
      (p) => (p.projects[1].id = p.projects[0].id),
      (p) => (p.projects[0].status = 'zombie'),
      (p) => (p.projects[0].slot = MAX_SLOTS),
      (p) => delete p.projects[0].slot,
      (p) => (p.projects[0].title = 123),
      (p) => (p.prefs = null),
    ];
    fc.assert(
      fc.property(fc.constantFrom(...corruptions), (mutate) => {
        const data = sampleData();
        const snapshot = JSON.stringify(data);
        const result = importData(corrupted(mutate, data));
        expect(result.ok).toBe(false);
        expect('data' in result).toBe(false);
        expect(JSON.stringify(data)).toBe(snapshot);
      }),
    );
  });
});

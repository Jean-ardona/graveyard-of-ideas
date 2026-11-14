import { describe, it, expect } from 'vitest';
import { buryNewProject, honor, resurrect, isSafeLink, INVALID_LINK_MESSAGE } from '../domain';
import type { Project } from '../domain';

const NOW = '2026-11-14T12:00:00.000Z';

const UNSAFE = [
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
  '   ',
];

function resurrectedProject(): Project[] {
  const buried = buryNewProject({ title: 'T', description: 'd' }, [], { now: NOW, id: 'a' });
  if (!buried.ok) throw new Error('setup failed');
  const risen = resurrect('a', { nextAction: 'Start' }, buried.projects, { now: NOW });
  if (!risen.ok) throw new Error('setup failed');
  return risen.projects;
}

describe('isSafeLink', () => {
  it('accepts http and https after trimming, in any case', () => {
    for (const link of ['http://a.b', 'https://a.b/x?y=1#z', 'HTTPS://A.B', '  https://a.b  ', '\nhttp://a.b\t']) {
      expect(isSafeLink(link)).toBe(true);
    }
  });

  it('rejects javascript:, data:, vbscript:, other schemes and junk', () => {
    for (const link of UNSAFE) expect(isSafeLink(link)).toBe(false);
  });

  it('rejects non-strings and over-long links', () => {
    for (const value of [undefined, null, 5, {}, ['https://a.b']]) expect(isSafeLink(value)).toBe(false);
    expect(isSafeLink(`https://a.b/${'x'.repeat(2000)}`)).toBe(false);
  });
});

describe('buryNewProject links', () => {
  it('rejects the whole input with invalid_link and a clear message', () => {
    for (const link of UNSAFE) {
      const result = buryNewProject({ title: 'T', description: 'd', links: ['https://ok.example', link] }, [], {
        now: NOW,
      });
      expect(result).toEqual({ ok: false, error: 'invalid_link', message: INVALID_LINK_MESSAGE });
    }
  });

  it('rejects too many links', () => {
    const links = Array.from({ length: 51 }, () => 'https://a.b');
    expect(buryNewProject({ title: 'T', description: 'd', links }, [])).toMatchObject({
      ok: false,
      error: 'invalid_link',
    });
  });

  it('stores trimmed http(s) links', () => {
    const result = buryNewProject({ title: 'T', description: 'd', links: ['  https://a.b  ', 'HTTP://C.D'] }, [], {
      now: NOW,
    });
    expect(result.ok && result.project.links).toEqual(['https://a.b', 'HTTP://C.D']);
  });
});

describe('honor resultLink', () => {
  it('rejects unsafe result links with invalid_link and leaves the data untouched', () => {
    const projects = resurrectedProject();
    for (const link of UNSAFE.filter((l) => l.trim() !== '')) {
      expect(honor('a', { resultLink: link }, projects, { now: NOW })).toEqual({
        ok: false,
        error: 'invalid_link',
        message: INVALID_LINK_MESSAGE,
      });
    }
    expect(projects[0]!.status).toBe('resurrected');
  });

  it('accepts a safe link (trimmed) and treats blank as no link', () => {
    const projects = resurrectedProject();
    const withLink = honor('a', { resultLink: '  https://a.b/done ' }, projects, { now: NOW });
    expect(withLink.ok && withLink.project.resultLink).toBe('https://a.b/done');
    const blank = honor('a', { resultLink: '   ' }, projects, { now: NOW });
    expect(blank.ok && blank.project.resultLink).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK_BODY_STACK, BOOK_FONT_STACK, ensureBookFont } from '../book/bookFonts';

const FONT_DIR = '/public/fonts/im-fell-english/';
const FONT_FILES = Object.keys(import.meta.glob('/public/fonts/im-fell-english/*'));
const raw = import.meta.glob<string>(['/index.html', '/docs/ASSETS.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const html = raw['/index.html'] ?? '';
const assets = raw['/docs/ASSETS.md'] ?? '';
const fontFace = /@font-face\s*{[^}]*}/.exec(html)?.[0] ?? '';

function setFonts(value: unknown): void {
  Object.defineProperty(document, 'fonts', { value, configurable: true });
}

describe('book font files', () => {
  it('ships the font file and OFL.txt', () => {
    expect(FONT_FILES).toContain(FONT_DIR + 'IMFeENrm28P.ttf');
    expect(FONT_FILES).toContain(FONT_DIR + 'OFL.txt');
  });

  it('is logged in docs/ASSETS.md', () => {
    expect(assets).toContain('IM Fell English');
    expect(assets).toContain('IMFeENrm28P.ttf');
    expect(assets).toContain('OFL.txt');
  });

  it('declares @font-face with swap, a unicode-range and a local URL', () => {
    expect(fontFace).toContain('font-display: swap');
    expect(fontFace).toContain('unicode-range: U+0000-00FF');
    const urls = [...fontFace.matchAll(/url\(['"]?([^'")]+)/g)].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).not.toMatch(/^(https?:)?\/\//i);
      expect(FONT_FILES).toContain('/public' + url);
    }
  });
});

describe('bookFonts', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.restoreAllMocks();
  });

  it('keeps the fallback stack ending in generic serif', () => {
    expect(BOOK_FONT_STACK).toBe(
      "'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif",
    );
    expect(BOOK_FONT_STACK.endsWith('serif')).toBe(true);
  });

  it('has a legible body stack that ends in generic serif and is not the bare keyword', () => {
    expect(BOOK_BODY_STACK).not.toBe('serif');
    expect(BOOK_BODY_STACK.endsWith('serif')).toBe(true);
    expect(BOOK_BODY_STACK).not.toContain('IM Fell');
  });

  it('resolves when document.fonts is missing', async () => {
    setFonts(undefined);
    await expect(ensureBookFont()).resolves.toBeUndefined();
  });

  it('resolves silently when the load rejects, with one load call', async () => {
    const load = vi.fn(() => Promise.reject(new Error('network')));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setFonts({ load });
    await expect(ensureBookFont()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves when load throws synchronously', async () => {
    setFonts({
      load: () => {
        throw new Error('boom');
      },
    });
    await expect(ensureBookFont()).resolves.toBeUndefined();
  });
});

/** Family name declared by the `@font-face` rule in `index.html`. */
export const BOOK_FONT_FAMILY = 'IM Fell English';

/** Fallback stack: used while the font loads, and for characters outside its Latin subset. */
export const BOOK_FONT_STACK = "'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif";

/**
 * Starts loading the book font. Never blocks anything: callers do not need to wait, and the
 * promise always resolves, also when `document.fonts` is missing or loading fails.
 */
export function ensureBookFont(): Promise<void> {
  try {
    if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
    return document.fonts.load(`1em "${BOOK_FONT_FAMILY}"`).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

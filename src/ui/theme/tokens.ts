/**
 * The only module with color literals, font stacks, spacing, radii and cursors.
 * Data only: no React, Three.js or DOM. `ember` is reserved for the resurrection embers.
 */

const color = {
  night900: '#0b1020',
  night800: '#121a30',
  night700: '#1b2542',
  parchment: '#c3ccdb',
  parchmentAged: '#aeb9cc',
  ink: '#141c30',
  inkMuted: '#26314c',
  mist: '#c8d8ff',
  focus: '#9db8ff',
  dangerNight: '#ecb8c8',
  dangerParchment: '#4d182d',
  fieldFill: '#dde3ee',
  fieldBorder: '#5a6a84',
  buttonBorder: '#3b4d73',
  /** Specter particle body (near-black) and rim (pale blue). Never used as text. */
  specterBody: '#07070b',
  specterRim: '#9fb4e0',
} as const;

export const TOKENS = {
  color,
  /** Amber, for embers only (cinematics particles). */
  ember: { core: '#ffb347', glow: '#ff9f2e', spark: '#ffd27a' },
  /** Colors of the canvas pages of the book; `bookLook` re-exports them. */
  leaf: {
    leafPaper: color.parchment,
    leafInk: color.ink,
    leafMuted: color.inkMuted,
    fieldFill: color.fieldFill,
    fieldBorder: color.fieldBorder,
    buttonFill: color.night700,
    buttonText: color.mist,
    buttonBorder: color.buttonBorder,
  },
  font: { body: "'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif" },
  /** Spacing steps in pixels. */
  space: [4, 8, 12, 16, 24, 32],
  /** Radii in pixels. */
  radius: { small: 3, medium: 4 },
  cursor: { grab: 'grab', grabbing: 'grabbing', pointer: 'pointer', text: 'text', default: 'default' },
} as const;

export type ColorToken = keyof typeof TOKENS.color;

/** Tokens used as text or as the focus ring. Every one of them must appear as `fg` in `CONTRAST_PAIRS`. */
export const TEXT_TOKENS: readonly ColorToken[] = ['ink', 'inkMuted', 'mist', 'focus', 'dangerNight', 'dangerParchment'];

/** Text and focus-ring pairs against every surface they can touch. Each needs a ratio of at least 7. */
export const CONTRAST_PAIRS: readonly { fg: ColorToken; bg: ColorToken; usage: string }[] = [
  { fg: 'ink', bg: 'parchment', usage: 'text on a page' },
  { fg: 'ink', bg: 'parchmentAged', usage: 'text on an aged page' },
  { fg: 'ink', bg: 'fieldFill', usage: 'text in a field' },
  { fg: 'ink', bg: 'parchment', usage: 'focus ring on a page' },
  { fg: 'ink', bg: 'parchmentAged', usage: 'focus ring on an aged page' },
  { fg: 'ink', bg: 'fieldFill', usage: 'focus ring on a field' },
  { fg: 'inkMuted', bg: 'parchment', usage: 'secondary text on a page' },
  { fg: 'inkMuted', bg: 'fieldFill', usage: 'secondary text in a field' },
  { fg: 'mist', bg: 'night900', usage: 'text on the darkest night' },
  { fg: 'mist', bg: 'night800', usage: 'text on a panel' },
  { fg: 'mist', bg: 'night700', usage: 'text on a raised panel and a button' },
  { fg: 'focus', bg: 'night900', usage: 'focus ring on the darkest night' },
  { fg: 'focus', bg: 'night800', usage: 'focus ring on a panel' },
  { fg: 'focus', bg: 'night700', usage: 'focus ring on a raised panel and a button' },
  { fg: 'dangerNight', bg: 'night900', usage: 'error text on the darkest night' },
  { fg: 'dangerNight', bg: 'night800', usage: 'error text on a panel' },
  { fg: 'dangerNight', bg: 'night700', usage: 'error text on a raised panel' },
  { fg: 'dangerParchment', bg: 'parchment', usage: 'error text on a page' },
  { fg: 'dangerParchment', bg: 'fieldFill', usage: 'error text in a field' },
];

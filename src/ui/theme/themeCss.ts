import { TOKENS } from './tokens';

/** CSS variable names (without the leading dashes) mapped to their values. */
export type TokenMap = Record<string, string>;

function kebab(name: string): string {
  return name.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

/** Every token as a flat map, for example `color-night-900` and `radius-small`. */
export function tokenMap(): TokenMap {
  const map: TokenMap = {};
  for (const [name, value] of Object.entries(TOKENS.color)) map[`color-${kebab(name)}`] = value;
  for (const [name, value] of Object.entries(TOKENS.ember)) map[`ember-${kebab(name)}`] = value;
  map['font-body'] = TOKENS.font.body;
  TOKENS.space.forEach((value, index) => (map[`space-${index}`] = `${value}px`));
  for (const [name, value] of Object.entries(TOKENS.radius)) map[`radius-${kebab(name)}`] = `${value}px`;
  for (const [name, value] of Object.entries(TOKENS.cursor)) map[`cursor-${kebab(name)}`] = value;
  return map;
}

/** `:root{--name:value;...}` */
export function tokensToCssVars(tokens: TokenMap): string {
  const body = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value};`)
    .join('');
  return `:root{${body}}`;
}

/** Inverse of `tokensToCssVars`. */
export function parseCssVars(css: string): TokenMap {
  const map: TokenMap = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):([^;}]*);/g)) map[match[1] as string] = match[2] as string;
  return map;
}

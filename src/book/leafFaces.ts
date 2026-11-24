import { pageCaptionText } from '../ui/copy';
import { layoutPages } from './bookPageLayout';
import type { PageDescriptor, PageProject } from './bookPageLayout';
import { PAGE_COUNT } from './pageTurn';

/**
 * What is drawn on the faces of the three leaves. Pure: no canvas, no Three.js. All coordinates and
 * sizes are in page-width units (1 = the width of the page face, y runs down from the top edge), so
 * the same ops serve the HTML overlay and a texture of any pixel size.
 */

export type FontRole = 'title' | 'body';
export type TextTone = 'ink' | 'muted' | 'button';
/** Width of `text` at font `size`, in page-width units. The canvas adapter passes `ctx.measureText`. */
export type TextMeasure = (text: string, size: number, font: FontRole) => number;

export type DrawOp =
  | {
      kind: 'text';
      text: string;
      /** Left edge for `left`, middle for `center`. */
      x: number;
      /** Top of the line box. */
      y: number;
      size: number;
      font: FontRole;
      align: 'left' | 'center';
      tone: TextTone;
    }
  | { kind: 'box'; x: number; y: number; w: number; h: number; role: 'field' | 'button' };

export interface LeafFace {
  front: DrawOp[];
  /** Always empty: the back of a leaf is blank paper. */
  back: DrawOp[];
}

/** Page width in CSS pixels at which the pixel sizes below match what the overlay used to show. */
export const PAGE_REFERENCE_WIDTH_PX = 480;

const px = (pixels: number): number => pixels / PAGE_REFERENCE_WIDTH_PX;

const PADDING_X = 0.07;

/**
 * Page layout in page-width units, shared by the overlay (value times the page width in pixels) and
 * the leaf textures (value times the texture width).
 */
export const PAGE_METRICS = {
  /** Height of the page face in page widths (inner leaf height over inner leaf width). */
  height: 0.37 / 0.276,
  paddingTop: 0.06,
  paddingX: PADDING_X,
  /** The overlay's 12 percent margin is relative to the content width. */
  titleMarginTop: 0.12 * (1 - 2 * PADDING_X),
  titleMarginBottom: px(12),
  titleSize: px(30),
  titleLineHeight: 1.2,
  titleMaxLines: 3,
  bodySize: px(16),
  bodyLineHeight: 1.2,
  buttonSize: px(15),
  captionSize: px(13),
  captionMarginTop: px(16),
  fieldGap: px(14),
  labelGap: px(4),
  fieldPaddingX: px(8),
  fieldPaddingY: px(6),
  fieldBorder: px(1),
  fieldRadius: px(3),
  buttonPaddingX: px(14),
  buttonPaddingY: px(6),
  /** Lines a multiline field shows, like a textarea with `rows=5`. */
  multilineRows: 5,
} as const;

const CONTENT_WIDTH = 1 - 2 * PADDING_X;
const ELLIPSIS = '…';

/** The caption under a page: "Page 2 of 3". */
export function pageCaption(pageIndex: number): string {
  return pageCaptionText(pageIndex + 1, PAGE_COUNT);
}

/** Greedy word wrap. A paragraph break starts a new line, and a word wider than the line breaks by character. */
export function wrapLines(text: string, maxWidth: number, size: number, font: FontRole, measure: TextMeasure): string[] {
  if (text === '') return [];
  const fits = (candidate: string): boolean => measure(candidate, size, font) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) wrapParagraph(paragraph, fits, lines);
  return lines;
}

function wrapParagraph(paragraph: string, fits: (text: string) => boolean, out: string[]): void {
  const words = paragraph.split(/\s+/u).filter((word) => word !== '');
  if (words.length === 0) {
    out.push('');
    return;
  }
  let line = '';
  for (const word of words) {
    const joined = line === '' ? word : `${line} ${word}`;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line !== '') out.push(line);
    line = breakWord(word, fits, out);
  }
  out.push(line);
}

/** Pushes the full lines of a word that does not fit and returns the last piece, which stays open. */
function breakWord(word: string, fits: (text: string) => boolean, out: string[]): string {
  if (fits(word)) return word;
  let piece = '';
  for (const character of Array.from(word)) {
    if (piece === '' || fits(piece + character)) {
      piece += character;
    } else {
      out.push(piece);
      piece = character;
    }
  }
  return piece;
}

/** Wraps and keeps at most `maxLines` lines. With `ellipsis`, clipped text ends in an ellipsis that still fits. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  font: FontRole,
  measure: TextMeasure,
  maxLines: number,
  ellipsis: boolean,
): string[] {
  const lines = wrapLines(text, maxWidth, size, font, measure);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(maxLines, 0));
  const last = kept.length - 1;
  const lastLine = kept[last];
  if (ellipsis && lastLine !== undefined) {
    kept[last] = withEllipsis(lastLine, (candidate) => measure(candidate, size, font) <= maxWidth);
  }
  return kept;
}

function withEllipsis(line: string, fits: (text: string) => boolean): string {
  const characters = Array.from(line.trimEnd());
  while (characters.length > 0 && !fits(characters.join('') + ELLIPSIS)) characters.pop();
  return characters.join('').trimEnd() + ELLIPSIS;
}

interface LineStyle {
  x: number;
  size: number;
  font: FontRole;
  align: 'left' | 'center';
  tone: TextTone;
  lineHeight: number;
}

/** Adds one text op per non-empty line, starting at `y`. Returns the y below the last line. */
function addLines(ops: DrawOp[], lines: string[], y: number, style: LineStyle): number {
  const step = style.size * style.lineHeight;
  lines.forEach((text, i) => {
    if (text === '') return;
    ops.push({ kind: 'text', text, x: style.x, y: y + i * step, size: style.size, font: style.font, align: style.align, tone: style.tone });
  });
  return y + lines.length * step;
}

function addTitle(ops: DrawOp[], title: string, y: number, measure: TextMeasure): number {
  const m = PAGE_METRICS;
  const top = y + m.titleMarginTop;
  const lines = wrapText(title, CONTENT_WIDTH, m.titleSize, 'title', measure, m.titleMaxLines, true);
  const style: LineStyle = { x: 0.5, size: m.titleSize, font: 'title', align: 'center', tone: 'ink', lineHeight: m.titleLineHeight };
  return addLines(ops, lines, top, style) + m.titleMarginBottom;
}

function addSubtitle(ops: DrawOp[], subtitle: string, y: number, measure: TextMeasure): number {
  const m = PAGE_METRICS;
  const lines = wrapText(subtitle, CONTENT_WIDTH, m.bodySize, 'body', measure, m.titleMaxLines, false);
  const style: LineStyle = { x: 0.5, size: m.bodySize, font: 'body', align: 'center', tone: 'ink', lineHeight: m.bodyLineHeight };
  return addLines(ops, lines, y, style);
}

function addField(ops: DrawOp[], spec: PageDescriptor['fields'][number], y: number, measure: TextMeasure): number {
  const m = PAGE_METRICS;
  const body: LineStyle = { x: m.paddingX, size: m.bodySize, font: 'body', align: 'left', tone: 'ink', lineHeight: m.bodyLineHeight };
  const boxTop = addLines(ops, [spec.label], y, body) + m.labelGap;
  const rows = spec.multiline ? m.multilineRows : 1;
  const boxHeight = rows * m.bodySize * m.bodyLineHeight + 2 * (m.fieldPaddingY + m.fieldBorder);
  ops.push({ kind: 'box', x: m.paddingX, y: boxTop, w: CONTENT_WIDTH, h: boxHeight, role: 'field' });
  const inset = m.fieldBorder + m.fieldPaddingX;
  // A single-line input drops line breaks from its value, as the browser does.
  const value = spec.multiline ? spec.value : spec.value.replace(/[\r\n]/g, '');
  const lines = wrapText(value, CONTENT_WIDTH - 2 * inset, m.bodySize, 'body', measure, rows, false);
  addLines(ops, lines, boxTop + m.fieldBorder + m.fieldPaddingY, { ...body, x: m.paddingX + inset });
  return boxTop + boxHeight + m.fieldGap;
}

function addButton(ops: DrawOp[], label: string, y: number, measure: TextMeasure): number {
  const m = PAGE_METRICS;
  const inset = m.fieldBorder + m.buttonPaddingX;
  const width = Math.min(CONTENT_WIDTH, measure(label, m.buttonSize, 'body') + 2 * inset);
  const height = m.buttonSize * m.bodyLineHeight + 2 * (m.buttonPaddingY + m.fieldBorder);
  ops.push({ kind: 'box', x: m.paddingX, y, w: width, h: height, role: 'button' });
  const style: LineStyle = { x: m.paddingX + inset, size: m.buttonSize, font: 'body', align: 'left', tone: 'button', lineHeight: m.bodyLineHeight };
  addLines(ops, [label], y + m.fieldBorder + m.buttonPaddingY, style);
  return y + height;
}

function pageOps(page: PageDescriptor, pageIndex: number, measure: TextMeasure): DrawOp[] {
  const m = PAGE_METRICS;
  const ops: DrawOp[] = [];
  let y: number = m.paddingTop;
  if (page.title !== undefined) y = addTitle(ops, page.title, y, measure);
  if (page.subtitle !== undefined) y = addSubtitle(ops, page.subtitle, y, measure);
  for (const spec of page.fields) y = addField(ops, spec, y, measure);
  if (page.resurrectButton !== undefined) y = addButton(ops, page.resurrectButton.label, y, measure);
  const caption: LineStyle = { x: 0.5, size: m.captionSize, font: 'body', align: 'center', tone: 'muted', lineHeight: m.bodyLineHeight };
  addLines(ops, [pageCaption(pageIndex)], y + m.captionMarginTop, caption);
  return ops;
}

/**
 * The faces of the three leaves. Leaf `j` carries page `j` on its front; every back is empty and the
 * end position has no face at all. Goal, epitaph and notes never appear, as in `layoutPages`.
 */
export function leafFaces(
  project: PageProject,
  hasResurrectHandler: boolean,
  measure: TextMeasure,
): [LeafFace, LeafFace, LeafFace] {
  const [first, second, third] = layoutPages(project, hasResurrectHandler);
  return [
    { front: pageOps(first, 0, measure), back: [] },
    { front: pageOps(second, 1, measure), back: [] },
    { front: pageOps(third, 2, measure), back: [] },
  ];
}

/** Equal for equal ops, different for different ops: a leaf is redrawn exactly when its key changes. */
export function faceKey(ops: readonly DrawOp[]): string {
  return JSON.stringify(ops);
}

export interface TextureSize {
  width: number;
  height: number;
}

/**
 * Pixel size of a leaf texture: the face scaled to fit inside the limit with its aspect kept, at
 * least 1 by 1. The real page face (about 0.746 aspect) gives 512 by 686, not 512 by 768.
 */
export function textureSize(faceWidth: number, faceHeight: number, maxWidth = 512, maxHeight = 768): TextureSize {
  const valid = [faceWidth, faceHeight, maxWidth, maxHeight].every((value) => Number.isFinite(value) && value > 0);
  if (!valid) return { width: 1, height: 1 };
  const limitWidth = Math.max(Math.floor(maxWidth), 1);
  const limitHeight = Math.max(Math.floor(maxHeight), 1);
  const scale = Math.min(limitWidth / faceWidth, limitHeight / faceHeight);
  return {
    width: Math.min(Math.max(Math.round(faceWidth * scale), 1), limitWidth),
    height: Math.min(Math.max(Math.round(faceHeight * scale), 1), limitHeight),
  };
}

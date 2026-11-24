import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
import { inkJitter, quillOffset } from '../ritual/inkStyle';

interface InkFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  /** No ink-in animation and no quill offset (reduced motion or calm mode). The static jitter stays. */
  still?: boolean;
  /** The control takes focus whenever this value changes (and on mount). */
  focusKey?: string | number;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface InkChar {
  id: number;
  char: string;
}

interface InkTrack {
  text: string;
  chars: InkChar[];
  /** Characters with an id at or above this value were added by the last edit. */
  freshFrom: number;
  nextId: number;
}

const WHITESPACE = /\s/;

/**
 * Follows the typed text and gives every character a stable id. Characters kept by an edit keep their id,
 * so their elements are not remounted and never animate again. Only the inserted ones get new ids.
 */
function trackText(track: InkTrack, text: string): void {
  if (track.text === text) return;
  const next = Array.from(text);
  const old = track.chars;
  let prefix = 0;
  while (prefix < next.length && prefix < old.length && next[prefix] === old[prefix]?.char) prefix += 1;
  let suffix = 0;
  while (
    suffix < next.length - prefix &&
    suffix < old.length - prefix &&
    next[next.length - 1 - suffix] === old[old.length - 1 - suffix]?.char
  ) {
    suffix += 1;
  }
  const freshFrom = track.nextId;
  const middle = next.slice(prefix, next.length - suffix).map((char) => ({ id: track.nextId++, char }));
  track.chars = [...old.slice(0, prefix), ...middle, ...old.slice(old.length - suffix)];
  track.freshFrom = freshFrom;
  track.text = text;
}

type Token = { kind: 'space'; item: InkChar; index: number } | { kind: 'word'; key: number; items: { item: InkChar; index: number }[] };

function tokenize(chars: InkChar[]): Token[] {
  const tokens: Token[] = [];
  let word: { item: InkChar; index: number }[] | null = null;
  chars.forEach((item, index) => {
    if (WHITESPACE.test(item.char)) {
      word = null;
      tokens.push({ kind: 'space', item, index });
      return;
    }
    if (!word) {
      word = [];
      tokens.push({ kind: 'word', key: tokens.length, items: word });
    }
    word.push({ item, index });
  });
  return tokens;
}

function jitterStyle(index: number): CSSProperties {
  const { dy, rotation } = inkJitter(index);
  return { transform: `translateY(${dy}px) rotate(${rotation}deg)` };
}

/** Small quill drawn in code, no asset. Colors come from the stylesheet. */
function Quill({ x, y, rotation }: { x: number; y: number; rotation: number }) {
  return (
    <svg
      className="ink-quill"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)` }}
    >
      <path className="ink-quill-feather" d="M21 2C13 3 8 8 6 15l3 3c7-2 12-7 12-16z" />
      <path className="ink-quill-shaft" d="M6 15 2 22l7-4" />
    </svg>
  );
}

/**
 * A real input or textarea whose own text is hidden, with a visible caret, over an `aria-hidden` mirror
 * that draws the same characters in ink. The real control keeps IME, paste, selection and accessibility.
 */
export default function InkField({
  multiline = false,
  rows,
  still = false,
  focusKey,
  onValueChange,
  value,
  ...rest
}: InkFieldProps) {
  const control = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const track = useRef<InkTrack>({
    text: value,
    chars: Array.from(value).map((char, id) => ({ id, char })),
    freshFrom: Infinity,
    nextId: Array.from(value).length,
  });
  const [keystrokes, setKeystrokes] = useState(0);

  trackText(track.current, value);
  const { chars, freshFrom } = track.current;

  useEffect(() => {
    control.current?.focus();
  }, [focusKey]);

  const change = (text: string): void => {
    setKeystrokes((count) => count + 1);
    onValueChange(text);
  };

  const syncScroll = (): void => {
    if (mirror.current && control.current) mirror.current.scrollTop = control.current.scrollTop;
  };

  const offset = quillOffset(keystrokes, still);
  const tokens = tokenize(chars);
  const charClass = (item: InkChar): string => (!still && item.id >= freshFrom ? 'ink-char ink-in' : 'ink-char');

  return (
    <div className={multiline ? 'ink-field ink-field-multiline' : 'ink-field'} data-still={still ? 'true' : 'false'}>
      {multiline ? (
        <textarea
          {...rest}
          ref={control as RefObject<HTMLTextAreaElement>}
          value={value}
          rows={rows}
          className="ink-control"
          onChange={(event) => change(event.target.value)}
          onScroll={syncScroll}
        />
      ) : (
        <input
          {...rest}
          ref={control as RefObject<HTMLInputElement>}
          value={value}
          type="text"
          className="ink-control"
          onChange={(event) => change(event.target.value)}
        />
      )}
      <div ref={mirror} className="ink-mirror" aria-hidden="true" data-testid="ink-mirror">
        {tokens.map((token) =>
          token.kind === 'space' ? (
            <span key={token.item.id} className="ink-space">
              {token.item.char}
            </span>
          ) : (
            <span key={`w${token.key}`} className="ink-word">
              {token.items.map(({ item, index }) => (
                <span key={item.id} className={charClass(item)} style={jitterStyle(index)}>
                  {item.char}
                </span>
              ))}
            </span>
          ),
        )}
        {value.endsWith('\n') ? <span className="ink-space">{'\u200b'}</span> : null}
      </div>
      <Quill x={offset.x} y={offset.y} rotation={offset.rotation} />
    </div>
  );
}

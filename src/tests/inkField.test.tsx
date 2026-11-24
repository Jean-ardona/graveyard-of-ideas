import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InkField } from '../ui/kit';

function Harness({ still = false, multiline = false, initial = '' }: { still?: boolean; multiline?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <InkField id="f" value={value} onValueChange={setValue} still={still} multiline={multiline} />;
}

const chars = (): HTMLElement[] => Array.from(screen.getByTestId('ink-mirror').querySelectorAll<HTMLElement>('.ink-char'));
const type = (text: string): void => {
  fireEvent.change(document.getElementById('f') as HTMLInputElement, { target: { value: text } });
};

describe('InkField', () => {
  afterEach(cleanup);

  it('keeps a real focusable control and an aria-hidden mirror', () => {
    render(<Harness />);
    const control = document.getElementById('f') as HTMLInputElement;
    expect(control.tagName).toBe('INPUT');
    control.focus();
    expect(document.activeElement).toBe(control);
    expect(screen.getByTestId('ink-mirror').getAttribute('aria-hidden')).toBe('true');
    type('Ink');
    expect(screen.getByTestId('ink-mirror').textContent).toBe('Ink');
    expect(control.value).toBe('Ink');
  });

  it('uses a textarea when multiline', () => {
    render(<Harness multiline />);
    expect(document.getElementById('f')?.tagName).toBe('TEXTAREA');
  });

  it('animates only the added character and keeps existing elements', () => {
    render(<Harness initial="ab" />);
    expect(chars().filter((el) => el.classList.contains('ink-in'))).toHaveLength(0);
    const before = chars();
    type('abc');
    const after = chars();
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after.filter((el) => el.classList.contains('ink-in')).map((el) => el.textContent)).toEqual(['c']);
    type('abcd');
    expect(chars().filter((el) => el.classList.contains('ink-in')).map((el) => el.textContent)).toEqual(['d']);
  });

  it('applies no animation class with reduced motion, but keeps the static jitter', () => {
    render(<Harness still />);
    type('abc');
    expect(chars().some((el) => el.classList.contains('ink-in'))).toBe(false);
    for (const el of chars()) expect(el.style.transform).toMatch(/translateY\(.*\) rotate\(.*\)/);
    const quill = document.querySelector<SVGElement>('.ink-quill');
    expect(quill?.style.transform).toBe('translate(0px, 0px) rotate(0deg)');
  });

  it('nudges the quill with typing when motion is allowed', () => {
    render(<Harness />);
    type('a');
    const quill = document.querySelector<SVGElement>('.ink-quill');
    expect(quill?.style.transform).not.toBe('translate(0px, 0px) rotate(0deg)');
    expect(quill?.getAttribute('aria-hidden')).toBe('true');
  });
});

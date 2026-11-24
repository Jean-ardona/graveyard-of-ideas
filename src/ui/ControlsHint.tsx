import { useEffect, useState } from 'react';
import { COPY } from './copy';
import { Prompt } from './kit';

const VISIBLE_MS = 8000;
const FADE_MS = 1500;

/** Short controls reminder that fades away after a few seconds. */
export default function ControlsHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Prompt
      place="bottom"
      role="note"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      {COPY.hints.controls.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </Prompt>
  );
}

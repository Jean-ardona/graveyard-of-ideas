import { useRef } from 'react';
import { useFocused } from '../interaction/interactionState';

const PROMPT_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '56%',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  background: 'rgba(10,14,24,0.55)',
  color: '#c8d8ff',
  fontFamily: 'serif',
  fontSize: '1rem',
  borderRadius: '3px',
  pointerEvents: 'none',
  userSelect: 'none',
  transition: 'opacity 150ms ease-out',
  zIndex: 92,
};

/**
 * Discreet "E — label" prompt below the crosshair. Fades out while nothing is in reach
 * and stays hidden while `inputLocked` (a book sequence is running).
 */
export default function InteractionPrompt({ inputLocked = false }: { inputLocked?: boolean }) {
  const focused = useFocused();
  const lastLabel = useRef('');
  if (focused) lastLabel.current = focused.label;
  const shown = focused !== null && !inputLocked;
  return (
    <div
      style={{ ...PROMPT_STYLE, opacity: shown ? 1 : 0 }}
      role="status"
      aria-hidden={shown ? undefined : true}
    >
      E — {lastLabel.current}
    </div>
  );
}

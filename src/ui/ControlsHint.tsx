import { useEffect, useState } from 'react';

const VISIBLE_MS = 8000;
const FADE_MS = 1500;

const HINT_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '8px 16px',
  background: 'rgba(10,14,24,0.65)',
  color: '#c8d8ff',
  fontFamily: 'serif',
  fontSize: '0.95rem',
  textAlign: 'center',
  borderRadius: '4px',
  pointerEvents: 'none',
  userSelect: 'none',
  transition: `opacity ${FADE_MS}ms ease`,
  zIndex: 90,
};

/** Short controls reminder that fades away after a few seconds. */
export default function ControlsHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div style={{ ...HINT_STYLE, opacity: visible ? 1 : 0 }} role="note">
      Move with WASD, ZQSD or the arrow keys. Hold Shift to walk faster.
      <br />
      Move the cursor left or right to turn. Press L for immersive look, Esc to leave it.
    </div>
  );
}

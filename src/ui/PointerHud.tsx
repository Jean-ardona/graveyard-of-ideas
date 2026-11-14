import { usePointerMode } from '../interaction/pointerLock';

const DOT_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  width: '4px',
  height: '4px',
  marginLeft: '-2px',
  marginTop: '-2px',
  borderRadius: '50%',
  background: 'rgba(200,216,255,0.8)',
  pointerEvents: 'none',
  zIndex: 90,
};

const RESUME_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '12px 28px',
  background: 'rgba(10,14,24,0.75)',
  color: '#c8d8ff',
  fontFamily: 'serif',
  fontSize: '1.2rem',
  borderRadius: '4px',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 95,
};

/** Center dot while the pointer is locked; a resume prompt when the lock was lost. */
export default function PointerHud() {
  const mode = usePointerMode();
  if (mode === 'locked') return <div style={DOT_STYLE} aria-hidden="true" />;
  if (mode === 'lost') {
    return (
      <div style={RESUME_STYLE} role="status">
        Click to resume
      </div>
    );
  }
  return null;
}

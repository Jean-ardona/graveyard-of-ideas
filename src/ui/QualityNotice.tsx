const NOTICE_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '38px',
  left: '8px',
  padding: '4px 9px',
  background: 'rgba(0,0,0,0.65)',
  color: '#c8d8ff',
  fontFamily: 'serif',
  fontSize: '14px',
  borderRadius: '3px',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 100,
};

/** Short, calm message shown after the quality was lowered automatically. */
export default function QualityNotice({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite">
      {message !== null && <div style={NOTICE_STYLE}>{message}</div>}
    </div>
  );
}

import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Project } from '../domain';
import { BOOK_FONT_STACK } from './bookFonts';
import { layoutPages } from './bookPageLayout';
import { PAGE_FADE_SECONDS } from './bookTimings';
import FieldEditor from './FieldEditor';
import { usePageRect } from './pageRect';
import type { PageRect } from './pageRect';
import { PAGE_COUNT } from './pageTurn';
import { closeBook } from './readingBook';
import { usePageTurnView } from './useReadingPhase';
import { usePageDrag } from './useReadingInput';

const LAYER_STYLE: CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 };

/** Used until the driver has projected the page: the right half of the window. */
const FALLBACK_RECT: CSSProperties = { left: '50%', top: '7vh', width: 'min(480px, 46vw)', height: '86vh' };

const CONTENT_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  padding: '6% 7%',
  background: '#c3ccdb',
  color: '#141c30',
  fontFamily: 'serif',
  fontSize: '16px',
  /** Fades the page in the moment it mounts, as soon as the cover is open (see index.html). */
  animation: `book-page-fade-in ${PAGE_FADE_SECONDS}s ease-out`,
};

const TITLE_STYLE: CSSProperties = {
  margin: '12% 0 12px',
  fontFamily: BOOK_FONT_STACK,
  fontWeight: 'normal',
  fontSize: '30px',
  lineHeight: 1.2,
  textAlign: 'center',
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
};

const BUTTON_STYLE: CSSProperties = {
  padding: '6px 14px',
  background: '#1d2740',
  color: '#c8d8ff',
  border: '1px solid #3b4d73',
  borderRadius: '3px',
  fontFamily: 'serif',
  fontSize: '15px',
};

const CLOSE_STYLE: CSSProperties = { ...BUTTON_STYLE, position: 'fixed', top: '16px', right: '16px', pointerEvents: 'auto' };

function rectStyle(rect: PageRect | null): CSSProperties {
  if (rect === null) return FALLBACK_RECT;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

interface BookPageOverlayProps {
  project: Project;
  /** Starts the resurrection. Without one the button stays disabled (task 7 supplies it). */
  onResurrect?: () => void;
}

/**
 * The page layer over the open book: three pages from `layoutPages` as ordinary HTML, so text
 * stays crisp and editable. It sits on the right-hand page, turns pages when dragged, and hides
 * its content while a leaf is turning. Edits go to the saved store; only typed text is kept here.
 */
export default function BookPageOverlay({ project, onResurrect }: BookPageOverlayProps) {
  const rect = usePageRect();
  const { index, status } = usePageTurnView();
  const surface = useRef<HTMLDivElement>(null);
  const drag = usePageDrag(() => surface.current?.getBoundingClientRect().width ?? 0);

  const pages = layoutPages(project, onResurrect !== undefined);
  const page = pages[index] ?? pages[0];
  const resting = status === 'idle';

  return (
    <section role="dialog" aria-label={project.title} style={LAYER_STYLE}>
      <div
        ref={surface}
        className="book-page-surface"
        data-dragging={status === 'dragging' ? 'true' : undefined}
        style={{ position: 'fixed', pointerEvents: 'auto', touchAction: 'none', ...rectStyle(rect) }}
        {...drag}
      >
        <div
          data-testid="book-page-content"
          style={{
            ...CONTENT_STYLE,
            opacity: resting ? 1 : 0,
            pointerEvents: resting ? 'auto' : 'none',
            transition: resting ? `opacity ${PAGE_FADE_SECONDS}s ease-out` : 'none',
          }}
        >
          {page.title !== undefined && <h2 style={TITLE_STYLE}>{page.title}</h2>}
          {page.subtitle !== undefined && <p style={{ textAlign: 'center', margin: 0 }}>{page.subtitle}</p>}
          {page.fields.map((spec) => (
            <FieldEditor key={`${project.id}-${spec.field}`} projectId={project.id} spec={spec} saved={spec.value} />
          ))}
          {page.resurrectButton !== undefined && (
            <button disabled={page.resurrectButton.disabled} onClick={onResurrect} style={BUTTON_STYLE}>
              {page.resurrectButton.label}
            </button>
          )}
          <p style={{ textAlign: 'center', fontSize: '13px', margin: '16px 0 0', color: '#3a4766' }}>
            Page {index + 1} of {PAGE_COUNT}
          </p>
        </div>
      </div>
      <button onClick={closeBook} style={CLOSE_STYLE}>
        Close the book
      </button>
    </section>
  );
}

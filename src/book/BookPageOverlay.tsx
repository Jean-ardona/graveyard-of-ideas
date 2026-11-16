import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { Project } from '../domain';
import { BOOK_FONT_STACK } from './bookFonts';
import { layoutPages } from './bookPageLayout';
import { PAGE_FADE_SECONDS } from './bookTimings';
import FieldEditor from './FieldEditor';
import { mirrorPageRect, usePageRect } from './pageRect';
import type { PageRect } from './pageRect';
import { END_INDEX, PAGE_COUNT, zoneAction } from './pageTurn';
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

/** Used until the driver has projected the page: the left half of the window. */
const FALLBACK_LEFT_RECT: CSSProperties = { right: '50%', top: '7vh', width: 'min(480px, 46vw)', height: '86vh' };

function rectStyle(rect: PageRect | null): CSSProperties {
  if (rect === null) return FALLBACK_RECT;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The left zone is the projected page mirrored around the spine. */
function leftRectStyle(rect: PageRect | null): CSSProperties {
  if (rect === null) return FALLBACK_LEFT_RECT;
  return rectStyle(mirrorPageRect(rect));
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
  const { index, status, turning, backDrag } = usePageTurnView();
  const surface = useRef<HTMLDivElement>(null);
  const leftSurface = useRef<HTMLDivElement>(null);
  const rightDrag = usePageDrag(() => surface.current?.getBoundingClientRect().width ?? 0, 'right');
  const leftDrag = usePageDrag(() => leftSurface.current?.getBoundingClientRect().width ?? 0, 'left');

  const pages = layoutPages(project, onResurrect !== undefined);
  // In the end position the last page stays the one shown in the indicator, but no content is drawn.
  const pageIndex = Math.min(index, PAGE_COUNT - 1);
  const page = pages[pageIndex] ?? pages[0];
  const resting = status === 'idle';
  const atEnd = index === END_INDEX;
  // The page content hides while a leaf is moving (not for a drag that turns nothing) and in the end position.
  const contentVisible = !turning && !atEnd;
  const dragging = status === 'dragging' ? 'true' : undefined;
  const grab = resting ? 'true' : undefined;

  return (
    <section role="dialog" aria-label={project.title} style={LAYER_STYLE}>
      <div
        ref={leftSurface}
        className="book-page-surface"
        data-testid="book-left-zone"
        data-zone-action={zoneAction(index, 'left')}
        data-grab={grab}
        data-dragging={dragging}
        style={{ position: 'fixed', pointerEvents: 'auto', touchAction: 'none', ...leftRectStyle(rect) }}
        {...leftDrag}
      />
      <div
        ref={surface}
        className="book-page-surface"
        data-testid="book-right-zone"
        data-zone-action={zoneAction(index, 'right')}
        data-grab={grab}
        data-dragging={dragging}
        style={{ position: 'fixed', pointerEvents: 'auto', touchAction: 'none', ...rectStyle(rect) }}
        {...rightDrag}
      >
        <div
          data-testid="book-page-content"
          aria-hidden={atEnd ? 'true' : undefined}
          style={{
            ...CONTENT_STYLE,
            opacity: contentVisible ? 1 : 0,
            pointerEvents: contentVisible ? 'auto' : 'none',
            visibility: atEnd ? 'hidden' : 'visible',
            transition: contentVisible ? `opacity ${PAGE_FADE_SECONDS}s ease-out` : 'none',
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
            Page {pageIndex + 1} of {PAGE_COUNT}
          </p>
        </div>
      </div>
      <button
        onClick={closeBook}
        data-testid="book-close-button"
        style={{ ...CLOSE_STYLE, opacity: backDrag ? 0 : 1, pointerEvents: backDrag ? 'none' : 'auto' }}
      >
        Close the book
      </button>
    </section>
  );
}

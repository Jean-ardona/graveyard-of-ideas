import { useRef } from 'react';
import type { AnimationEvent, CSSProperties, TransitionEvent } from 'react';
import type { Project } from '../domain';
import { useAppStore } from '../store/appStore';
import { BOOK_BODY_STACK, BOOK_FONT_STACK } from './bookFonts';
import { BOOK_LOOK } from './bookLook';
import { layoutPages } from './bookPageLayout';
import FieldEditor from './FieldEditor';
import { PAGE_METRICS, PAGE_REFERENCE_WIDTH_PX, pageCaption } from './leafFaces';
import { reportOverlayOpaque } from './leafTextureLayer';
import { crossfadeSeconds } from './pageCrossfade';
import { mirrorPageRect, usePageRect } from './pageRect';
import type { PageRect } from './pageRect';
import { END_INDEX, PAGE_COUNT, zoneAction } from './pageTurn';
import { closeBook } from './readingBook';
import { usePageTurnView } from './useReadingPhase';
import { usePageDrag } from './useReadingInput';

const LAYER_STYLE: CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 };

/** Used until the driver has projected the page: the right half of the window. */
const FALLBACK_RECT: CSSProperties = { left: '50%', top: '7vh', width: 'min(480px, 46vw)', height: '86vh' };

const M = PAGE_METRICS;

/** `value` in page widths as CSS pixels, for a page `width` pixels wide. */
function scaled(value: number, width: number): string {
  return `${value * width}px`;
}

function contentStyle(width: number, fadeSeconds: number): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    padding: `${scaled(M.paddingTop, width)} ${scaled(M.paddingX, width)}`,
    background: BOOK_LOOK.leafPaper,
    color: BOOK_LOOK.leafInk,
    fontFamily: BOOK_BODY_STACK,
    fontSize: scaled(M.bodySize, width),
    /** Fades the page in the moment it mounts, as soon as the cover is open (see index.html). */
    animation: fadeSeconds === 0 ? 'none' : `book-page-fade-in ${fadeSeconds}s ease-out`,
  };
}

function titleStyle(width: number): CSSProperties {
  return {
    margin: `${scaled(M.titleMarginTop, width)} 0 ${scaled(M.titleMarginBottom, width)}`,
    fontFamily: BOOK_FONT_STACK,
    fontWeight: 'normal',
    fontSize: scaled(M.titleSize, width),
    lineHeight: M.titleLineHeight,
    textAlign: 'center',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: M.titleMaxLines,
    overflow: 'hidden',
  };
}

function buttonStyle(width: number): CSSProperties {
  return {
    padding: `${scaled(M.buttonPaddingY, width)} ${scaled(M.buttonPaddingX, width)}`,
    background: BOOK_LOOK.buttonFill,
    color: BOOK_LOOK.buttonText,
    border: `${scaled(M.fieldBorder, width)} solid ${BOOK_LOOK.buttonBorder}`,
    borderRadius: scaled(M.fieldRadius, width),
    fontFamily: BOOK_BODY_STACK,
    fontSize: scaled(M.buttonSize, width),
  };
}

/** The Close button is window furniture, not part of the page, so its size does not follow the page. */
const CLOSE_STYLE: CSSProperties = {
  ...buttonStyle(PAGE_REFERENCE_WIDTH_PX),
  position: 'fixed',
  top: '16px',
  right: '16px',
  pointerEvents: 'auto',
};

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
  const pageWidth = rect === null ? PAGE_REFERENCE_WIDTH_PX : rect.width;
  const { index, status, turning, backDrag } = usePageTurnView();
  const surface = useRef<HTMLDivElement>(null);
  const leftSurface = useRef<HTMLDivElement>(null);
  const reducedMotion = useAppStore((state) => state.data.prefs.reducedMotion);
  const fadeSeconds = crossfadeSeconds(reducedMotion);
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

  // The page reached full opacity: the leaf texture may give way to the blank paper under it.
  const reportOpaque = (event: { target: unknown; currentTarget: unknown }): void => {
    if (contentVisible && event.target === event.currentTarget) reportOverlayOpaque();
  };
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>): void => {
    if (event.propertyName === 'opacity') reportOpaque(event);
  };
  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => reportOpaque(event);

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
          onTransitionEnd={onTransitionEnd}
          onAnimationEnd={onAnimationEnd}
          style={{
            ...contentStyle(pageWidth, fadeSeconds),
            opacity: contentVisible ? 1 : 0,
            pointerEvents: contentVisible ? 'auto' : 'none',
            visibility: atEnd ? 'hidden' : 'visible',
            transition: contentVisible && fadeSeconds > 0 ? `opacity ${fadeSeconds}s ease-out` : 'none',
          }}
        >
          {page.title !== undefined && <h2 style={titleStyle(pageWidth)}>{page.title}</h2>}
          {page.subtitle !== undefined && <p style={{ textAlign: 'center', margin: 0 }}>{page.subtitle}</p>}
          {page.fields.map((spec) => (
            <FieldEditor
              key={`${project.id}-${spec.field}`}
              projectId={project.id}
              spec={spec}
              saved={spec.value}
              pageWidth={pageWidth}
            />
          ))}
          {page.resurrectButton !== undefined && (
            <button disabled={page.resurrectButton.disabled} onClick={onResurrect} style={buttonStyle(pageWidth)}>
              {page.resurrectButton.label}
            </button>
          )}
          <p
            style={{
              textAlign: 'center',
              fontSize: scaled(M.captionSize, pageWidth),
              margin: `${scaled(M.captionMarginTop, pageWidth)} 0 0`,
              color: BOOK_LOOK.leafMuted,
            }}
          >
            {pageCaption(pageIndex)}
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

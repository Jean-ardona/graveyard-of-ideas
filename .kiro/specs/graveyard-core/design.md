# Design: Graveyard of Ideas core

## Overview
Layered architecture: a pure domain core, a persisted store, and a rendering layer that only reads state. Animations are orchestrated by a small state machine.

## Data model (src/domain)
```ts
type Status = 'resting' | 'resurrected' | 'accomplished';
interface HistoryEntry { at: string; kind: 'created'|'buried'|'resurrected'|'rested'|'honored'|'action-done'|'note'; text?: string }
interface Project {
  id: string; title: string; description: string;
  goal?: string; abandonReason?: string; epitaph?: string;
  notes: string; links: string[];
  status: Status;
  slot?: number;               // only when resting
  reducedVersion?: string; nextAction?: string;
  result?: string; resultLink?: string;
  history: HistoryEntry[];
  createdAt: string; updatedAt: string; buriedAt?: string; resurrectedAt?: string;
}
interface AppData { schemaVersion: number; projects: Project[]; seeded: boolean; prefs: { quality: 'low'|'medium'|'high'; reducedMotion: boolean } }
```

## Domain functions (pure, tested)
`buryNewProject(input, projects, opts?)` — the single entry point for creation. Validates (title and description required, non-empty after trimming), allocates a free slot, and builds a resting project atomically. Returns `{ ok: true, project, projects }` or `{ ok: false, error: 'invalid_title' | 'invalid_description' | 'graveyard_full' }`. Input is never persisted on failure. The `opts` parameter accepts `{ now?, id? }` for deterministic testing.

`rebury(project, projects, opts?)` — re-assigns a slot to an existing project (used by `restAgain`). Pure, no mutation.

`resurrect`, `restAgain`, `honor`, `remove`, `allocateSlot`, `exportData`, `importData` (validate + migrate) — implemented in later tasks.

Invariants: a project exists exactly once; a slot is used by at most one resting project; **every resting project must have a slot** (enforced by `buryNewProject` — no slotless resting project can be created); resurrect never duplicates.

## Grave slots
A fixed list of slot positions on the terrain (e.g. 12). Tombs are rendered from resting projects by slot. Tomb shapes vary by slot (rounded, rectangular, worn) chosen deterministically.

## UI state machine (src/interaction)
exploring -> openingGrave -> reading -> closingGrave -> exploring
exploring/reading -> burying -> exploring
reading -> resurrecting -> exploring
any -> paused -> previous
A transition is rejected while a cinematic is running (guard). Skip jumps to the sequence's final step and calls cleanup.

For books, `openingGrave`, `reading` and `closingGrave` are not stored separately: they are derived from the phase of the book reading machine (see "Book interaction (task 5.3)"). In that design `openingGrave` means the book lifts, approaches and opens its cover; there is no slab animation.

## Player controller (src/interaction)
Keyboard: ZQSD, WASD and arrows, Shift to sprint. Typing targets are ignored; held keys are released on blur, tab hide and whenever walking is disabled. Walk speed 2.0 units/s, sprint 3.2 units/s (separate constants), frame delta clamped, bounds and box collisions with sliding.

Look is direct, with no smoothing, acceleration or dead zone. The pure `applyLook(look, movementX, movementY, sensitivity)` in `playerLook.ts` is applied once per mouse event: yaw and pitch change by delta times sensitivity, pitch is clamped to +/-75 degrees, and an axis whose delta exceeds 200 px is ignored (browser glitch filter). Sensitivity defaults to 0.0022 rad/pixel and is persisted under its own localStorage key by `store/lookSensitivity.ts` (safe read and write, stored value validated to 0.0003..0.02, default on any invalid value). A settings screen can write it later with `saveLookSensitivity`.

Pointer Lock is the default. `pointerLock.ts` holds a small mode state (`idle`, `locked`, `lost`, `released`, `fallback`) read by the controller each frame and by UI through `usePointerMode()`:
- A click on the canvas or Enter calls `requestPointer()`; on success the mode is `locked`, a center dot is shown (`ui/PointerHud`) and mouse movement drives `applyLook`.
- If the lock disappears while `locked` (Escape, focus loss) the mode becomes `lost`: walking stops, keys are released and a centered "Click to resume" prompt shows. The prompt does not capture clicks, so the canvas click re-locks.
- `releasePointer()` frees the cursor on purpose (mode `released`): walking and look stop and no prompt shows. `requestPointer()` locks again and needs a user gesture, for example the click that closes a book. The UI state machine (task 5.3) calls these when a book or the grimoire opens or closes. Both are exported from `src/interaction`.
- The existing `enabled` flag on `PlayerController` still suspends walking and look. Disabling it frees the cursor without a prompt; enabling it again shows "Click to resume" if the pointer was locked before.
- Fallback: if `requestPointerLock` is missing, the `pointerlockerror` event fires or the request promise rejects before any successful lock, the mode becomes `fallback`. Look then works by holding the left button and dragging, through the same `applyLook` with the same sensitivity, filter and clamp. Walking stays enabled and no prompt shows. A failure after a previous success (browsers refuse a new request right after Escape) keeps the current mode so the user can click again.

## Cinematics (src/cinematics)
Each sequence is a list of timed steps with a final-state function. Burial: grimoire closes, book materializes with light particles, camera frames slot, tomb appears, slab opens, book descends, slab closes, name engraves. Resurrection: book closes, warm light, amber particle disintegration, book removed, then smoke, specter forms, rises, flies away, fades, tomb and collider removed. Order A before B is enforced by awaiting step completion.

## Book (src/book)
3D cover, spine, page block and parchment pages. Editable content is embedded HTML on the page planes; the book is not made of 3D letters. Four parts: Ambition, Abandonment, Remains, Second chance.

Interaction with the book (lift, approach, open, page turning, close) is designed in the next section.

## Book interaction (task 5.3)

### Decision and scope
The closed book that already lies on the tomb base (task 5.2) is the interactive object. The tomb (task 5.1) is unchanged: no lid or slab animation is part of reading. The existing prompt "E - Open <name>" starts the sequence.

Superseded wording: Requirement 2.1 (slab slides open, book raised from the cavity) and 2.5 (book lowered into the cavity, slab closed) describe the old flow. The slab and cavity stay in the tomb for the burial cinematic (task 6.2). See "Open points".

Sequence (forward):
1. The book lifts off the base, about 0.6 s, ease-out.
2. It moves toward the player and turns to face the camera, about 0.8 s.
3. The cover opens, pivoting on the spine, about 0.8 s.
4. The first page shows the project name in an ancient font, then the page content fades in.
5. Escape or E plays the same sequence in reverse; the book returns to the base.

### Module layout
Pure modules have no React, Three.js or DOM imports and no timers. Components only apply their output.

```
src/book/
  bookTimings.ts        data: sequence durations, easing names, page-turn constants, reading pose offsets
  bookSequence.ts       PURE. phase machine + progress scalars (lift, approach, cover)
  pageTurn.ts           PURE. page model: index, drag progress, settle, leaf angles
  readingMachine.ts     PURE. composes sequence + pages, routes events, derived selectors
  readingKeys.ts        PURE. (key, isTyping, phase) -> event
  bookPageLayout.ts     PURE. project -> page descriptors (what each page shows)
  bookLook.ts           data: pale blue-gray colors, rim/emissive values
  bookFonts.ts          font family constants, fallback stack, ensureBookFont()
  BookSequenceDriver.tsx  R3F. useFrame: ticks the machine, applies transforms
  BookPageOverlay.tsx     HTML layer on the open page (replaces the tab panel of BookPages.tsx)
  useReadingInput.ts      keyboard + pointer drag -> machine events
  FieldEditor.tsx         extracted from BookPages.tsx, unchanged behavior (autosave)
src/interaction/
  uiMode.ts             UI mode type, guard, mapping from book phase
public/fonts/<family>/  woff2 + OFL.txt
```

Existing files that change: `Book.tsx` (hinged front board, leaf stack, root ref), `bookAssets.ts` (split cover geometry, shared leaf geometry, look materials), `bookHandles.ts` (handle also exposes `root` and `leaves`), `readingBook.ts` (keeps only the open project id; `openBook`/`closeBook` call the machine), `BookPages.tsx` (tab panel removed), `PlayerController.tsx` (new `inputLocked`), `pointerLock.ts` (one rule, see Pointer Lock below).

The machine is a module singleton with a `subscribe` for discrete changes only (phase, page status), read in React with `useSyncExternalStore`, the same pattern as `pointerLock.ts`. Per-frame values are read directly by the driver and never go through React.

### State and allocation rule
To avoid per-frame allocation, the state records are created once and mutated in place by the functions in these modules. The functions are still deterministic and side-effect free outside the record they receive, so tests create a record, call functions and assert on its fields. Discrete events never touch the DOM or the pointer; the driver and input hook perform effects after reading the result.

```ts
type BookPhase = 'closed' | 'lifting' | 'approaching' | 'coverOpening' | 'open' | 'closing';
type BookEvent = 'OPEN' | 'CLOSE' | 'SKIP';
interface SequenceState { phase: BookPhase; t: number; closePending: boolean }  // t in [0, TOTAL]
interface SequenceProgress { lift: number; approach: number; cover: number }     // each in [0, 1], eased
```

`t` is time on the forward timeline. Opening increases `t` toward `TOTAL`; closing decreases it toward 0. Every pose is a function of `t` alone, so reversing from any moment retraces the same path with no jump.

### Timings (data constants, `bookTimings.ts`)
```ts
SEQUENCE_TIMINGS = { liftSeconds: 0.6, approachSeconds: 0.8, coverSeconds: 0.8 }   // TOTAL = 2.2
MAX_FRAME_DELTA = 0.05          // same clamp as the player controller
LIFT_HEIGHT = 0.15              // meters above the base pose
READING_POSE = { distance: 0.55, down: 0.04 }   // in camera space, tuned on the target machine
COVER_OPEN_ANGLE = 3.05         // rad, about 175 degrees
PAGE_TURN = { deadzonePx: 4, fullTurnRatio: 0.8, commitThreshold: 0.5, settleSeconds: 0.3 }
PAGE_FADE_SECONDS = 0.15        // CSS opacity of the page content
```
Phase boundaries from `t`: lifting `t < 0.6`, approaching `t < 1.4`, coverOpening `t < 2.2`, open at `t = 2.2`. Easing: lift ease-out cubic; approach and cover ease-in-out cubic. Reduced animations (`prefs.reducedMotion`) dispatch `SKIP` right after `OPEN` or `CLOSE`.

### Sequence transition table
| State | OPEN | CLOSE | SKIP | Tick (dt) |
|---|---|---|---|---|
| closed | to lifting, if guard passes | ignored | ignored | nothing |
| lifting | ignored | to closing (t kept) | to open | `t += dt`; at `t >= 0.6` to approaching |
| approaching | ignored | to closing (t kept) | to open | at `t >= 1.4` to coverOpening |
| coverOpening | ignored | to closing (t kept) | to open | at `t >= 2.2` to open, `t = 2.2` |
| open | ignored | to closing if pages idle, else `closePending = true` | ignored | if `closePending` and pages idle, to closing |
| closing | ignored | ignored | to closed | `t -= dt`; at `t <= 0` to closed, `t = 0` |

Leftover time at a boundary is discarded. Entering `closed` resets the page model to page 0. `dt` is clamped to `MAX_FRAME_DELTA`. The guard for OPEN: current UI mode is `exploring`, pointer mode allows movement, and the target project rests.

### Invariants
- I1 `0 <= t <= TOTAL`; every progress value is in [0, 1].
- I2 While opening, `phase` matches the `t` ranges above; `closed` implies `t = 0` and all progress 0; `open` implies `t = TOTAL` and all progress 1.
- I3 `pointerLockReleased` is true exactly while `phase === 'open'`, including while a page turns. It is false in every other phase.
- I4 `inputLocked` (no walking, no look) is true exactly while `phase !== 'closed'`.
- I5 Page turning is active only while `phase === 'open'`, and the page model is at rest on page 0 whenever `phase === 'closed'`.
- I6 At most one book sequence runs; OPEN never restarts a running one.

### Movement during the sequence (decision: lock)
Walking and look are locked from the moment OPEN is accepted until the book is `closed` again. Escape or E reverses. Reasons:
- The player often still holds W when pressing E. Auto-close on movement would close the book at once.
- The book flies to a pose captured from the camera when OPEN is accepted. A moving camera would need per-frame retargeting, which costs work on a weak GPU and makes the book swim.
- Req 2.2 asks for a stable camera and book. The lock lasts 2.2 s at most and is always reversible.

`inputLocked` is a separate flag on `PlayerController`. It zeroes walking and look and releases held keys, but does not touch the pointer mode. The existing `enabled` flag cannot be used, because disabling it also frees the pointer (`modeOnSuspend`), which would break I3. The "E - Open" prompt is hidden while `inputLocked` is true. In click-and-drag fallback mode, look-drag is off while locked, so page dragging does not turn the view.

### Pointer Lock and cursor
- Pointer stays locked during lifting, approaching and coverOpening.
- On entering `open`, the driver calls `releasePointer()`. The exit is programmatic, so mode is `released` and no resume prompt shows. The cursor is then free for typing and dragging.
- When `phase` leaves `open` (closing starts), the driver calls `requestPointer()`. This needs a user gesture. E gives one. Escape does not in Chrome, so the request can be refused.
- `pointerLock.ts` change: a refused `requestPointer()` while mode is `released` sets mode `lost`, so the existing "Click to resume" prompt appears and one click locks again. Without this the player would stay stuck with no prompt.
- If the lock is lost during lifting, approaching or coverOpening (the browser consumes Escape to leave Pointer Lock), the driver dispatches `CLOSE`. This makes Escape reverse the sequence. At `closed` the prompt shows because the mode is `lost`.
- Edge detection (released to not released and back) is a pure helper `pointerEdge(prev, next)` so it can be tested; the effect calls stay in the driver.
- Cursor: CSS `cursor: grab` on hover over a page, `grabbing` while dragging (attribute `data-dragging`). Inputs and textareas keep `cursor: text`, buttons `cursor: pointer`.

### Page-turn model (`pageTurn.ts`)
```ts
interface PageTurnState {
  index: number;                       // current page, 0..PAGE_COUNT-1 (PAGE_COUNT = 3)
  status: 'idle' | 'dragging' | 'settling';
  direction: 'next' | 'prev' | null;
  progress: number;                    // 0..1 completion of the turn in progress
  settleTarget: 0 | 1;
}
```
Leaf `j` carries page `j` on its front. A turning leaf rotates rigidly about the spine axis, 0 to 180 degrees. Turning leaf `index` forward reveals page `index + 1` on the right; the left side shows the back of the turned leaf (blank parchment). The last leaf never turns forward.

Functions (all take the state, mutate it in place): `beginDrag`, `dragTo(state, dxPx, pageWidthPx)`, `endDrag`, `cancelDrag`, `turnByKey(state, 'next' | 'prev')`, `tick(state, dt)`, `isIdle`, `leafAngle(state, j)`.

- Direction is set when `|dx| >= deadzonePx`: drag left means `next`, drag right means `prev`. If that direction does not exist (first page, last page) the drag is ignored. Direction is locked for the rest of the drag; dragging back past the start just gives progress 0.
- `progress = clamp(|dx| / (pageWidthPx * fullTurnRatio), 0, 1)` in the locked direction. The angle follows the pointer one to one.
- `endDrag`: `progress >= 0.5` settles to 1 (turn completes, `index` changes by one); `progress < 0.5` settles to 0 (returns). Exactly 0.5 completes.
- `cancelDrag` (Escape during drag, `pointercancel`, window blur) always settles to 0.
- `turnByKey` works only when `idle` and the direction exists; it settles to 1. Key repeat is ignored.
- Settling moves `progress` linearly toward the target at `1 / settleSeconds` per second, so a partial turn takes proportionally less time. Reduced animations: settle is immediate.
- `leafAngle(state, j)`: turned leaves (`j < index`) are at pi; for `next` leaf `index` is at `progress * pi`; for `prev` leaf `index - 1` is at `(1 - progress) * pi`; all others 0.
- During `closing` and `coverOpening`, the rendered leaf angle is `leafAngle * cover`, so turned leaves fold back with the cover. No extra state.

No mesh deformation. Page curl stays on the polish backlog.

Allocation: three leaf meshes share one geometry and one material; the driver writes `rotation.y` of at most two leaves, and only when the value changed.

### Pages and the HTML layer
`bookPageLayout.ts` maps a project to descriptors; the overlay renders them.

| Page | Content | Source |
|---|---|---|
| 1 | Project name (ancient font), "Buried on <date>" | `title`, `buriedAt` formatted with `Intl.DateTimeFormat('en', { dateStyle: 'long' })`; line omitted if no date |
| 2 | "Why it rests" (editable), "The idea in one line" (editable) | `abandonReason`, `description` |
| 3 | "Realistic next action" (editable), resurrection button | `nextAction` |

The resurrection button is rendered disabled until task 7 passes an `onResurrect` handler; the rule "next action required" belongs to task 7.1. Edits keep using `editProject` through `FieldEditor` (autosave, unchanged).

The page layer is plain HTML positioned over the right page, not CSS 3D. Because the camera is frozen and the book pose is fixed in camera space, the page rectangle is projected once when `open` is reached and on window resize, using preallocated vectors. While `status !== 'idle'` the content is hidden (opacity 0, `pointer-events: none`); it fades in again when the turn ends. A "Close" button sits in the corner for mouse-only use and dispatches `CLOSE`. Long titles wrap (`overflow-wrap: anywhere`) and are limited to three lines.

Input routing (`useReadingInput.ts`, `readingKeys.ts`):
- Escape always means `CLOSE` (saved edits are autosaved, so nothing is lost; Req 2.6 closes the book, the menu opens on the next Escape in `exploring`).
- E means `CLOSE` only when the event target is not a typing target (`isTypingTarget`).
- Left and right arrows turn pages only when the target is not a typing target and `event.repeat` is false.
- Drag starts on `pointerdown` on the page surface, not on an `input`, `textarea`, `select` or `button` (`closest` check). The hook calls `setPointerCapture`, blurs the active field and sends deltas to `dragTo`. `pointerup` calls `endDrag`; `pointercancel` and window blur call `cancelDrag`.
- If the window is hidden, `useFrame` stops, so no time passes; the delta clamp prevents a jump on return.

### Visibility of the closed book
Colors live in `bookLook.ts` as data, tuned on the target machine in the dark scene. No amber anywhere on the book (amber is reserved for the resurrection embers).
- Page-edge band: the page block and leaves use a lighter pale blue-gray (start near `#b7c0cf`), clearly lighter than the cover.
- Cover border: a small shared procedural texture (about 128 by 128, one-line border in a mid blue-gray) used as `map` on the front board only. No extra mesh.
- Rim light: no new scene light, because a light added per book would raise shader cost for every material. A low `emissive` on the page-edge and cover-border materials gives the faint edge glow. A Fresnel shader patch is a possible upgrade only if the emissive version looks flat.
- The texture and materials are created in `createBookAssets` and disposed in `dispose()`.

### Fonts
| Candidate | Character | Notes |
|---|---|---|
| IM Fell English | old printed book | Most readable for arbitrary names, upper and lower case. Recommended. |
| Cinzel Decorative | engraved capitals | Lowercase becomes small capitals; strong look, less natural for long names. |
| UnifrakturCook | blackletter | Hard to read for long or unusual names; limited glyph coverage. |

All three are under the SIL Open Font License. Verify the license text in each download. Because subsetting a font can count as modification, check the Reserved Font Name clause in the OFL file before subsetting; if unsure, ship the unmodified files.

Loading and fallback:
- Files are served from `public/fonts/<family>/` (woff2 plus `OFL.txt`), declared with `@font-face`, `font-display: swap`, and `unicode-range` limited to Latin and Latin-1. No CDN, no remote URL.
- `ensureBookFont()` calls `document.fonts.load` once at start when a resting project exists, and never blocks the sequence. If the font is not ready when the first page appears, the fallback stack shows and swaps in later.
- Stack: `'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif`. Characters outside the subset (non-Latin names, emoji) fall back to the stack automatically.
- The ancient font is used for the page-1 title only. Field labels and editable text stay in the legible serif already used in `BookPages.tsx`.
- Implementation logs family, source URL, license, date and file sizes in `docs/ASSETS.md`.

### Fit with the UI state machine and pointer mode
| Book phase | UI mode | Pointer mode | inputLocked |
|---|---|---|---|
| closed | exploring | per pointer state | false |
| lifting, approaching, coverOpening | openingGrave | locked | true |
| open (including page turning) | reading | released | true |
| closing | closingGrave | released, then lock requested | true |

`uiMode.ts` holds the mode type (exploring, openingGrave, reading, closingGrave, burying, resurrecting, paused) and a guard `canStartCinematic(mode)`. The book machine is the only writer of the three grave modes and updates the mode only on phase changes, not per frame. Opening the book is refused in `burying`, `resurrecting` and `paused`. If a menu opens while reading (task 9.1), `paused` freezes ticks and restores the previous mode on resume. Task 7 will hand the open book to `resurrecting` through its own event; that hand-off is not designed here, and the four book parts stay separate meshes so the ember dissolve can treat each one.

### Performance (Low is the default)
- Only rotations and positions animate. No new lights, no shadows from the book, no post-processing, no CSS 3D.
- Geometries and materials are shared across all books and leaves; the reading pose, temporary vectors and quaternions are preallocated once and reused. The driver does nothing when the phase is `closed`, or `open` with idle pages.
- Allocation happens only on discrete events, never per frame.
- Measure on the target machine at the milestone; no performance claim is made here.

### Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection: opening completion, phase consistency and bounds were merged; reverse retrace, continuity and the open-close round trip were merged into two properties; the two frame-rate independence checks were merged; pointer and input invariants were merged into one property over arbitrary event sequences.

#### Property 1: Sequence state is always consistent
For any sequence of events and tick durations, `t` stays in [0, TOTAL], every progress value stays in [0, 1], the phase matches `t` while opening, `closed` implies `t = 0` and progress 0, and `open` implies `t = TOTAL` and progress 1.

**Validates: Requirements 2.1, 9.2**

#### Property 2: Opening completes
For any list of tick durations whose clamped sum is at least TOTAL, started by `OPEN` and with no other event, `t` never decreases and the machine ends in `open`.

**Validates: Requirements 2.1**

#### Property 3: Reversal retraces and never jumps
For any moment during opening, dispatching `CLOSE` leaves `t` unchanged, then `t` never increases and reaches 0 in `closed`; and for any two states with equal `t`, the progress values are equal whether the machine was opening or closing.

**Validates: Requirements 2.5, 2.6**

#### Property 4: Open then close round trip
For any tick splitting, `OPEN`, ticking to `open`, `CLOSE`, ticking to `closed` returns a state equal to the initial state, with the page model on page 0.

**Validates: Requirements 2.5**

#### Property 5: One sequence at a time
For any event sequence, `OPEN` is accepted only from `closed` and when the guard passes; `OPEN` never changes `t` or `phase` in any other phase.

**Validates: Requirements 9.1**

#### Property 6: Pointer and input invariants
For any sequence of events, ticks and page events, after every step `pointerLockReleased === (phase === 'open')`, `inputLocked === (phase !== 'closed')`, page turning is active only in `open`, and the page model is idle on page 0 in `closed`.

**Validates: Requirements 1.2.2, 2.2**

#### Property 7: Skip reaches the fixed points
For any phase, `SKIP` ends in `open` from lifting, approaching or coverOpening, and in `closed` from closing; from other phases it changes nothing.

**Validates: Requirements 8.3, 9.2**

#### Property 8: Frame-rate independence
For any total duration split into random clamped `dt` values, the sequence reaches the same phase and the page settle reaches the same state as with another split, within floating-point tolerance.

**Validates: Requirements 2.1, 8.3**

#### Property 9: Page model invariants
For any sequence of drag, release, cancel, key and tick events, `index` stays in [0, 2], `progress` in [0, 1], every leaf angle in [0, pi]; `idle` implies `progress = 0` and `direction = null`; `next` implies `index < 2`, `prev` implies `index > 0`; and the turned leaves always form a prefix (angles are non-increasing with `j` when idle).

**Validates: Requirements 2.2**

#### Property 10: The 50 percent rule
For any page, direction and drag distance, ending the drag with `progress >= 0.5` and ticking to idle changes `index` by exactly one in that direction; ending with `progress < 0.5` leaves `index` unchanged. `cancelDrag` never changes `index`.

**Validates: Requirements 2.2**

#### Property 11: Keyboard turning
For any page, `turnByKey('next')` then ticking to idle moves `index` up by one unless on the last page, where nothing changes; `'prev'` mirrors this; `next` then `prev` returns to the starting page; the result equals a completed drag in the same direction.

**Validates: Requirements 2.2**

#### Property 12: Closing waits for pages
For any state with a turn in progress in `open`, `CLOSE` does not leave `open` until the page model is idle, and the machine then reaches `closed` after enough ticks; no event sequence leaves a leaf mid-turn at `closing`.

**Validates: Requirements 2.5, 2.6**

#### Property 13: Rendered leaf angle follows the cover
For any state and leaf, the rendered angle `leafAngle * cover` is 0 when `cover = 0` and equals `leafAngle` when `cover = 1`.

**Validates: Requirements 2.5**

#### Property 14: Page layout shows the required content
For any resting project, the descriptors contain the title on page 1, the burial date when present, the reason and idea on page 2, and the next-action field and a resurrection button on page 3; the button is disabled when no handler is given.

**Validates: Requirements 2.3, 2.4**

#### Property 15: Key routing
For any key, typing flag and phase, Escape maps to `CLOSE` in every phase except `closed` and `closing`; E maps to `CLOSE` only when not typing; arrows map to a page turn only when not typing and in `open`; every other combination maps to nothing.

**Validates: Requirements 2.6**

### Error Handling
- Font fails to load: fallback stack, no message, no console output.
- `requestPointer()` refused after close: "Click to resume" prompt (mode `lost`).
- Project removed or no longer resting while a book is open (the existing `useReadingProject` returns null): dispatch `SKIP` then `CLOSE` so the book returns to `closed` and the pointer is requested again.
- Edit rejected by the domain (empty description): existing inline error stays; text remains on screen and the last saved value is kept.
- `OPEN` while another cinematic runs: ignored, no message.

### Testing Strategy (book interaction)
- Library: fast-check with Vitest; each property is a single test, at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>`. Files: `bookSequence.test.ts`, `pageTurn.test.ts`, `readingMachine.test.ts`, `readingKeys.test.ts`, `bookPageLayout.test.ts`.
- Event sequences are generated with `fc.array` of events and tick durations (including zero and above-clamp values) and checked after every step.
- Example tests: `bookLook` constants (edge luminance at least twice the cover luminance, blue channel not below red, hue outside amber range); `pointerEdge`; one render of the page overlay.
- Smoke: font files and `OFL.txt` exist, `docs/ASSETS.md` lists them.
- Manual on the target machine: sequence timing and smoothness, no stutter on first open, cursor shapes, Escape refusal then "Click to resume", font fallback by renaming the font file once.
- PBT does not apply to: rendering, CSS cursors, Pointer Lock browser behavior, per-frame allocation (checked by profiling).

### Open points
1. Requirements 2.1, 2.3 and 2.5 still describe the slab flow and the four content parts. A later session should update `requirements.md`.
2. The three pages do not show `goal`, `epitaph`, `notes` and `reducedVersion`, which the 5.2 book edited under four tabs. They stay editable in the grimoire (task 8.1). Decide whether page 3 should also hold the optional reduced version (Req 5.1).
3. "The idea in one line" is bound to `description`. Change `bookPageLayout.ts` if another field is intended.
4. Final font choice among the three candidates (default: IM Fell English).

## Quality presets
Low: reduced pixel ratio, simple/baked shadows, few particles, no post-processing. Medium and High raise these gradually. Presets are plain data consumed by the world.

## Persistence
Zustand store with a localStorage adapter, versioned JSON, debounced autosave, error surface. Import validates the schema before replacing; export downloads a JSON file.

## Simple mode
A non-3D view of the grimoire exposing all create, read, edit, resurrect, honor, export and import functions. Used as a fallback and as a low-end path.

## Testing strategy
Unit tests for domain functions. Property-based tests (fast-check) for the invariants and for export/import round trips. Manual performance checks on the target low-end machine at each milestone. The book interaction properties (task 5.3) are listed in "Book interaction (task 5.3)".

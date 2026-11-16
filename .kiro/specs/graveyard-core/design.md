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
1. The book lifts off the base, about 1.0 s, ease-out.
2. It moves toward the player and turns to face the camera, about 1.2 s.
3. The cover opens, pivoting on the spine, about 1.2 s.
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
  bookLook.ts           data: pale blue-gray colors, rim/emissive values, leaf paper and ink colors
  leafCurl.ts           PURE. leafCurl(progress, segments, out) angles; leafStrip(...) writes strip positions and normals in place
  leafFaces.ts          PURE. which text goes on which leaf face, wrapping with an injected measure, face keys, texture size
  pageCrossfade.ts      PURE. visibility model of the leaf texture and the HTML overlay
  leafCurlMesh.ts       adapter (Three.js, no React): curl geometry, in-place writes, swap and restore
  leafTextures.ts       adapter (canvas, no React): draws the face ops onto three canvas textures, redraw, dispose
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
SEQUENCE_TIMINGS = { liftSeconds: 1.0, approachSeconds: 1.2, coverSeconds: 1.2 }   // TOTAL = 3.4
MAX_FRAME_DELTA = 0.05          // same clamp as the player controller
LIFT_HEIGHT = 0.15              // meters above the base pose
READING_POSE = { distance: 0.55, down: 0.04 }   // in camera space, tuned on the target machine
COVER_OPEN_ANGLE = 3.05         // rad, about 175 degrees
PAGE_TURN = { deadzonePx: 4, fullTurnRatio: 0.8, commitThreshold: 0.5, settleSeconds: 0.3 }
PAGE_FADE_SECONDS = 0.15        // CSS opacity of the page content
```
Phase boundaries from `t`: lifting `t < 1.0`, approaching `t < 2.2`, coverOpening `t < 3.4`, open at `t = 3.4`. Easing: lift ease-out cubic; approach and cover ease-in-out cubic. Reduced animations (`prefs.reducedMotion`) dispatch `SKIP` right after `OPEN` or `CLOSE`.

### Sequence transition table
| State | OPEN | CLOSE | SKIP | Tick (dt) |
|---|---|---|---|---|
| closed | to lifting, if guard passes | ignored | ignored | nothing |
| lifting | ignored | to closing (t kept) | to open | `t += dt`; at `t >= 1.0` to approaching |
| approaching | ignored | to closing (t kept) | to open | at `t >= 2.2` to coverOpening |
| coverOpening | ignored | to closing (t kept) | to open | at `t >= 3.4` to open, `t = 3.4` |
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
- Req 2.2 asks for a stable camera and book. The lock lasts 3.4 s at most and is always reversible.

`inputLocked` is a separate flag on `PlayerController`. It zeroes walking and look and releases held keys, but does not touch the pointer mode. The existing `enabled` flag cannot be used, because disabling it also frees the pointer (`modeOnSuspend`), which would break I3. The "E - Open" prompt is hidden while `inputLocked` is true. In click-and-drag fallback mode, look-drag is off while locked, so page dragging does not turn the view.

### Pointer Lock and cursor
- Pointer stays locked during lifting, approaching and coverOpening.
- On entering `open`, the driver calls `releasePointer()`. The exit is programmatic, so mode is `released` and no resume prompt shows. The cursor is then free for typing and dragging.
- When `phase` leaves `open` (closing starts), the driver calls `requestPointer()`. This needs a user gesture. E gives one. Escape does not in Chrome, so the request can be refused.
- `pointerLock.ts` change: a refused `requestPointer()` while mode is `released` sets mode `lost`, so the existing "Click to resume" prompt appears and one click locks again. Without this the player would stay stuck with no prompt.
- If the lock is lost during lifting, approaching or coverOpening (the browser consumes Escape to leave Pointer Lock), the driver dispatches `CLOSE`. This makes Escape reverse the sequence. At `closed` the prompt shows because the mode is `lost`.
- Edge detection (released to not released and back) is a pure helper `pointerEdge(prev, next)` so it can be tested; the effect calls stay in the driver.
- Cursor: CSS `cursor: grab` on hover over a page, `grabbing` while dragging (attribute `data-dragging`). Inputs and textareas keep `cursor: text`, buttons `cursor: pointer`.

### Two drag zones and closing gestures (fix after task 5.3.6)

The drag side decides the action. Grab the right page and drag left to turn forward; grab the left page and drag right to turn back. The other way does nothing. On the first page the left zone closes the book and on the last page the right zone closes it, with the same 50 percent rule and no new mesh. The left zone is the projected right page mirrored around the projected spine (`mirrorPageRect`, written with the page rectangle, never per frame). `PageTurnState` gains `side`, `closeDrag` and `closeRequested`; `zoneAction(index, side)` returns `next`, `prev` or `close`. `CURL_STRENGTH` (default 0.6, in `bookTimings.ts`) scales the tip lag of `leafCurl`. Properties 28 to 32 (playbook P32 to P36): the wrong direction does nothing; next then previous returns to the same page; a closing gesture needs half the distance; no leaf is both turned and unturned; strength scales the bend.

### Cover scrub (fix after the two-zone drag fix)

A closing gesture scrubs the rigid cover about the spine, with no curl. The machine stays in `open` with `t = TOTAL` during the drag, so invariants I1 to I6 hold unchanged. The pure `coverScrub.ts` derives the cover open fraction from the drag: `1 - progress` (1 open, 0 closed), and the angle `COVER_OPEN_ANGLE * fraction`. The driver multiplies the cover progress by the fraction, and the leaves fold with it as in the closing sequence. On release below 50 percent, `progress` settles back to 0 like a returned page; Escape does the same. Past 50 percent, `startClosingFromCover` sets `t` inside the cover phase so that the eased cover progress equals the scrubbed fraction (inverse of the cover ease), then the normal closing runs: no jump. The page content hides during the scrub, as for a page turn. With reduced motion the fraction stays 1 and the release closes at once. Properties 33 to 36 (playbook P37 to P40): the angle is monotonic in the progress; release below 50 percent returns exactly to open; release above 50 percent reaches closed without a jump; the angle never leaves [0, `COVER_OPEN_ANGLE`] for any input.

### Back closing (fix after the cover scrub)

The back board is a second mesh in the `pageBlock` part (same geometry as the front board, same `coverMaterial` and so the same border texture, own hinge on the spine axis behind the block). It is not a fifth part; the mesh count is now 1, 1, 2, 3. The pure `backClose.ts` models the swing of the book about the spine axis, from 0 (open) to pi (closed, back up): `backSwingAngle(openFraction, approach) = pi * (1 - openFraction) * approach`, clamped, NaN counts as open and at the reading pose. A drag from the right zone on the last page is a closing gesture (`isBackClosingGesture`); it scrubs `swing = pi * progress` and the front stack folds by the same fraction, so the leaves stay where they lie while the back half comes over them. `SequenceState` gains `side: 'front' | 'back'`, set when closing starts (`back` only from the last page, by a released gesture, the Close button, Escape or a pending close that waited for a turn). A close while the book is still opening is always `front`. `SequenceProgress` gains `swing`. No timers.

Release past 50 percent calls `startClosingFromCover(state, fraction, true)`: no jump, because the swing at that time equals the dragged one. The closing timeline then runs as before except that the approach step is the flip: it lasts `BACK_FLIP.seconds` (timeline rate `BACK_FLIP_RATE`), and `swing` falls from pi to 0 as the approach falls from 1 to 0, a single continuous rotation of exactly 180 degrees about the long axis. At the end `swing = 0`, `cover = 0`, `approach = 0`, `lift = 0` and the side is `front` again, which is the normal closed pose, so there is no jump.

The flip cannot pass through the slab or the tomb because: (1) `swing > 0` only while `approach > 0`, which is only after the lift step has finished going backwards, so the lift is at its full `LIFT_HEIGHT` for the whole flip and the descent starts only after the swing is 0; (2) the swung half only adds material on the +z side of the book (the side that is up when it lies flat), so the lowest point of the book at any swing angle is the bottom face of the closed book (tested on the real model); (3) the position moves from the reading pose toward the base along a line that starts above the base. Reduced motion skips straight to the closed pose.

Overlay hidden (content and Close button, opacity 0, no pointer events) during the back drag; during the flip the overlay is not mounted, because the phase is `closing`. Properties 37 to 41 (playbook P41 to P45): the back board angle is monotonic in the drag progress and in [0, pi] for any input; release below 50 percent returns exactly to the last-page open state; release above 50 percent reaches closed back up and then the rest pose face up; the flip is one continuous rotation of exactly pi; both covers closed never coexists with a turning leaf.
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

The rigid rotation above is the model of the leaf angle. The curved turn (see "Curved page turn") adds a bend on top of it and never changes `leafAngle`, `renderedLeafAngle` or any page-model rule.

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
- Rotations and positions animate; the one exception is the vertex positions of the single turning leaf (see "Curved page turn"). No new lights, no shadows from the book, no post-processing, no CSS 3D.
- Geometries and materials are shared across all books and leaves; the reading pose, temporary vectors and quaternions are preallocated once and reused. The driver does nothing when the phase is `closed`, or `open` with idle pages.
- Allocation happens only on discrete events, never per frame.
- Measure on the target machine at the milestone; no performance claim is made here.

### Four-part contract (after task 5.3.5)
`BOOK_PARTS` and `bookParts.ts` no longer exist. The contract is now the `BookHandle` returned by `getBookHandle(projectId)`:
- `handle.parts` has exactly the keys `cover`, `spine`, `pageBlock` and `pages`. They are four distinct `Object3D`s, each reachable from `handle.root`, each holding its own meshes (`cover` and `spine` one mesh each, `pageBlock` two meshes: the page block and the back board, `pages` the three leaf meshes; seven meshes in all, was six before the back board). `handle.leaves` are the three leaf hinges inside `pages`.
- Task 7.2 dissolves each part through the handle, never by traversing the scene or by name. Every part is a group, so the dissolve walks the meshes inside each part (`part.traverse`); it must not assume one mesh per part. The back board is reachable only that way, through `parts.pageBlock`.
- These are mesh parts. The four content parts of Requirement 2.3 (Ambition, Abandonment, Remains, Second chance) are page content, not meshes.
- Curl and leaf text add no mesh and no part. The curl geometry replaces the geometry of an existing leaf mesh, and the textured materials replace its material, so the four parts and their mesh counts are the same in every phase.
- Test coverage: `book.test.ts` already checks that `createBookModel` builds four distinct parts with the right mesh counts, and that the handle is reachable by id and has three leaves. It does not check `parts` through the handle. Add one example test that reads `getBookHandle(id).parts` after `registerBookHandle`, checks the four keys, four distinct objects, reachability from `root`, and the mesh counts, and repeats the mesh-count check while a curl and textured materials are active.

### Curved page turn

The turning leaf bends like paper. The rigid angle stays the model; the bend is only how the leaf is drawn.

**Strip.** A leaf is a strip of `LEAF_CURL.segments = 12` segments of equal length `ds = leafWidth / 12`. `leafCurl(progress, segments, out)` (pure, `leafCurl.ts`) writes the absolute direction `phi[i]` of each segment into the preallocated `out` (Float64Array), measured about the spine axis like `leafAngle`: 0 points to the right side, pi to the left side. `progress` is the leaf fraction `leafAngle / pi`, so the input for a forward turn of leaf `index` is `progress`, and for a backward turn of leaf `index - 1` it is `1 - progress`.

```ts
LEAF_CURL = { segments: 12, tipLag: 0.8 }   // radians; tipLag < 1 keeps every angle in [0, pi]
// s = clamp(progress, 0, 1), NaN treated as 0
phi[i] = pi * s - tipLag * sin(pi * s) * w[i],   w[i] = i / (segments - 1)   // w[0] = 0; one segment: w = 0
```
- `phi[0]` is the spine angle `pi * s`, the same value as the rigid leaf angle, so the hinge never disagrees with the page model.
- The tip trails the spine by at most `tipLag * sin(pi * s)`, so the bend is zero at both ends and largest in the middle. Curvature between neighbours is uniform: `phi[i] - phi[i-1] = -tipLag * sin(pi * s) / (segments - 1)`, a circular arc.
- `leafStrip(phi, segments, width, depth, positions, normals)` (pure, same module) integrates the segment directions into positions in the hinge frame: `x += ds * cos(phi)`, `z += ds * sin(phi)`, the same orientation as the hinge rotation (`rotation.y = -angle`). The front face is the centerline offset by `+depth / 2` along the segment normal, the back face by `-depth / 2`, so the strip matches the flat leaf box at progress 0 and 1. Normals are written analytically (`(-sin phi, cos phi)`), so no `computeVertexNormals` and no allocation.

**When it applies.** Only the leaf returned by a new pure helper `turningLeafIndex(state)` in `pageTurn.ts` (the leaf with angle strictly between 0 and pi, or `null` when idle), and only while `status !== 'idle'`, `cover === 1`, and reduced motion is off. Idle pages, closed books, the cover, the other leaves and the leaves folding back with the cover all keep the existing flat geometry and shared materials.
- The hinge of the curling leaf is set to rotation 0 while its strip is drawn (the strip already carries the spine angle); on swap back it gets the usual `-renderedLeafAngle`. The swap is invisible because the strip is flat at progress 0 and 1 and the turn always starts and ends there.
- Direction does not change the shape: dragging back, or a turn to the previous page, passes through the same shapes at the same leaf fractions. There is no hysteresis, so reversing mid-drag retraces the same shapes.

**Lifetime and writes (`leafCurlMesh.ts`).**
- One curl geometry per open book (two strips of 13 by 2 vertices, UV and index built once, position and normal attributes `DynamicDrawUsage`, buffers preallocated). It is created when the book leaves `closed` and disposed when it returns to `closed`. Nothing is created for closed books.
- At turn start the turning leaf mesh gets the curl geometry (and `frustumCulled = false`, because the bounding sphere is not recomputed); at turn end it gets the shared flat leaf geometry back. At most one leaf is swapped at a time.
- Each frame of a turn: if the leaf fraction equals the last written value, nothing is written. Otherwise `leafCurl` and `leafStrip` write into the existing arrays and `needsUpdate` is set on the two attributes. No array, vector or object is created per frame. The last written fraction is reset to NaN at turn start to force the first write.
- No new light, no shadow casting (`castShadow` stays false), no change to the shared flat geometry or material.

**Reduced motion.** No curl. `finishTurn` (the existing `settleNow` path) ends a release immediately; while the pointer is still held the leaf follows the drag rigidly with the flat geometry.

### Text on the 3D leaves

Page text is drawn onto the faces of the leaves so it turns with the paper. The HTML overlay stays the editable layer when the page is at rest; the texture is what shows during a turn and while the cover opens and closes.

**Which text goes where (`leafFaces.ts`, pure).** `leafFaces(project, hasResurrectHandler, measure)` calls `layoutPages` and returns, for each of the three leaves, `{ front: DrawOp[], back: DrawOp[] }`. Front of leaf `j` is page `j`; every back is empty (blank parchment, as in the page model). So the content rules of `layoutPages` (never goal, epitaph or notes) apply unchanged. Coordinates and sizes are in page-width units (1 = width of the page face), so the same ops serve any pixel size.
```ts
type FontRole = 'title' | 'body';
type TextMeasure = (text: string, size: number, font: FontRole) => number;  // width in page-width units
type DrawOp =
  | { kind: 'text'; text: string; x: number; y: number; size: number; font: FontRole; align: 'left' | 'center'; tone: 'ink' | 'muted' }
  | { kind: 'box'; x: number; y: number; w: number; h: number; role: 'field' | 'button' };
```
- Wrapping inputs: the text, the line width (page width minus the padding of `PAGE_METRICS`), the font size, and the injected `measure`. Greedy word wrap; a paragraph break (`\n`) starts a new line; a word wider than the line breaks by character. The title is clipped to 3 lines with an ellipsis, like the overlay. A multiline field shows its first 5 lines, like an unscrolled textarea with `rows=5`; a single-line field shows one line.
- The canvas adapter passes `measure` from `ctx.measureText`; tests pass a fixed-width fake.
- `PAGE_METRICS` (data, tuned on the target machine): paddings `0.06` top and `0.07` sides (the same percentages as the overlay, which are relative to the width), title size, body size, line height, caption size, field padding. The overlay converts them to pixels with `rect.width * value`, so the overlay and the texture are scaled copies of one layout.
- `faceKey(ops)` is a string that is equal for equal ops.

**Texture size (`textureSize(faceWidth, faceHeight, maxWidth = 512, maxHeight = 768)`, pure).** The page face is `INNER_WIDTH x INNER_HEIGHT` (about 0.276 x 0.37, aspect 0.746), not 2:3, so a 512 x 768 canvas would stretch the text. The size is scaled to fit inside 512 x 768 with the face aspect kept: 512 x 686. Three textures of 512 x 686 are about 1.4 MB each (4.2 MB), `generateMipmaps = false`, linear filtering, sRGB color space, one per leaf.

**Drawing (`leafTextures.ts`, thin adapter).** Fills the paper color, draws the ops (`fillText`, `fillRect`/`strokeRect`), sets `needsUpdate`. It holds no logic beyond ops to canvas calls. If a 2D context is unavailable, no textures exist and the overlay works alone (see Error Handling).

**Lifetime.**
- Created when the book leaves `closed` (OPEN accepted), so the uploads happen during the lift, before the cover opens. Disposed (textures, canvases released, materials) when the phase returns to `closed`, in the same place that disposes the curl geometry. Closed books never have them.
- While open, each leaf mesh has a material array in the box group order `[edge, edge, edge, edge, front, back]`: `edge` is the shared leaf material, `back` a shared blank paper material, `front` a per-leaf material with the canvas texture as `map` and a low `emissiveMap` (same texture, start near 0.25, tuned on the target machine) so the page stays readable at night without a light. At `closed` the shared material is restored. The curl geometry uses groups with the same material indices (4 front, 5 back), so the same array works for both.
- Colors (`bookLook.ts`, data): `leafPaper` `#c3ccdb` (the overlay background today), `leafInk` `#141c30`, field fill `#dde3ee`, field border `#5a6a84`, muted `#3a4766`, button fill `#1d2740`, button text `#c8d8ff`, button border `#3b4d73`. Blue-gray, no amber. The overlay imports the same constants instead of its own hex strings. Example test: ink on paper contrast at least 7:1, blue channel not below red, hue outside the amber range.
- Fonts: titles use `BOOK_FONT_STACK`; the body uses a new named stack `BOOK_BODY_STACK` in `bookFonts.ts` (the legible serif stack, used by both the canvas and the overlay instead of the bare `serif`).

**Redraw.**
- Font: when the textures are created, `ensureBookFont().then(redrawAll)` is called without awaiting. Nothing waits on it; the sequence never depends on it. If the book closed before the promise resolves, the callback sees disposed textures and does nothing.
- Text: the store project is mapped through `leafFaces`; each leaf has a stored `faceKey`. A changed key marks that leaf dirty. A dirty leaf is redrawn at once if its texture is currently visible, and otherwise at the moment its texture becomes visible (turn start, or the phase leaving `open`). This keeps typing from redrawing a hidden canvas on every keystroke. Only the dirty leaves are drawn.
- The texture shows the saved value. A rejected edit (empty description) stays visible in the field only; the first turn shows the saved words, which is what the field shows after the turn anyway ("Your last saved words are kept").

**Cross-fade between texture and overlay.** Both draw the same page, so the swap has nothing to jump over:
1. Same rectangle. The overlay rectangle is the projection of `BOOK_PAGE_FACE` (the front face of the outermost leaf), and the texture covers exactly that face (UV 0 to 1). At `open` the book rests camera-aligned, so the projected face is a rectangle.
2. Same layout and metrics. Both consume `leafFaces` ops and `PAGE_METRICS` in page-width units (overlay: `rect.width * value`).
3. Same font and colors: `BOOK_FONT_STACK`, `BOOK_BODY_STACK` and the `bookLook` colors; the field boxes, button and "Page n of 3" caption are drawn on the texture too.
4. Same content: the saved values (see Redraw).
Remaining differences are small and hidden by the fade: the DOM text is crisp and the texture is filtered, and browsers wrap with their own algorithm (same greedy rule and widths, so lines should match). Text caret and selection exist only in the overlay. Verify the match by eye on the target machine at 100% zoom.

Ordering and duration (`pageCrossfade.ts`, pure):
- The overlay is wanted only when `phase === 'open'` and `status === 'idle'`.
- Turn start, or the phase leaving `open`: in one synchronous step, first dirty textures are redrawn and the front materials show the texture, then the overlay is hidden at once (`opacity 0`, `transition: none`). The machine listener runs inside the event, before React flushes, so the next frame shows the texture and the overlay is gone in the same paint. The driver renders every frame while a turn runs.
- Turn end (`idle` again, or `open` reached): the overlay fades in over `PAGE_FADE_SECONDS = 0.15` s, ease-out (the existing value). The texture stays visible during the fade.
- The overlay reports reaching opacity 1 (`transitionend` for `opacity`, or at once when the duration is 0). Only then the front slot is swapped to the blank paper material (never `visible = false`, so there is no see-through frame). If the report never arrives (hidden tab), the texture simply stays under the opaque overlay.
- Reduced motion: `crossfadeSeconds(true) = 0`. The overlay is shown at full opacity at once and the report is immediate, so the texture is hidden in the same step with no fade.
- Invariant: at every step either the texture is visible or the overlay is fully opaque, so the page is never blank.

**Cost.** Canvas drawing happens on discrete events (open, font load, changed text on a visible leaf, turn start with a dirty leaf). Nothing is drawn per frame.

### Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection: opening completion, phase consistency and bounds were merged; reverse retrace, continuity and the open-close round trip were merged into two properties; the two frame-rate independence checks were merged; pointer and input invariants were merged into one property over arbitrary event sequences. For the curl (Properties 16 to 22), "flat at the ends" and "no hysteresis" are kept apart because they fail for different reasons, while finite output and clamping were merged. For the leaf text (Properties 23 to 27), the paper color, the four-part contract and the draw calls are not properties (see Testing Strategy).

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

The next properties cover the curved page turn and the text on the leaves. Playbook numbering continues the rule: design property N is playbook P(N+9), so Properties 16 to 27 are P25 to P36.

#### Property 16: The leaf is flat at the ends (playbook P25)
For any segment count from 1 to 64, `leafCurl` at progress 0 gives every segment angle 0, and at progress 1 gives every segment angle pi; the strip positions at 0 and 1 equal the flat leaf (points along the line at angle 0, and angle pi) within tolerance.

**Validates: Requirements 2.2, 8.3**

#### Property 17: Arc length is constant (playbook P26)
For any progress and any segment count from 1 to 64, the polyline length of the strip centerline equals the leaf width within tolerance, every segment has length `width / segments`, and the first point is the hinge.

**Validates: Requirements 2.2**

#### Property 18: Angles are finite and inputs are clamped (playbook P27)
For any real, NaN or infinite progress, every angle is finite and in [0, pi], the result equals the result for `clamp(progress, 0, 1)` (NaN as 0), and the written positions and normals are finite.

**Validates: Requirements 2.2, 8.2**

#### Property 19: Curvature is symmetric around the middle of the turn (playbook P28)
For any progress in [0, 1] and any segment index, the curvature (the angle difference between neighbouring segments) at `progress` equals the curvature at `1 - progress` within tolerance, is never positive, and is largest in magnitude at progress 0.5.

**Validates: Requirements 2.2**

#### Property 20: The spine angle opens monotonically (playbook P29)
For any two progress values `a <= b` in [0, 1], the spine angle (segment 0) at `a` is at most the spine angle at `b`, and it equals `pi * progress`, the rigid leaf angle.

**Validates: Requirements 2.2**

#### Property 21: The shape depends on the progress alone (playbook P30)
For any sequence of progress values (a drag forward, back and forward again, or a turn to the next page followed by a turn to the previous page), every call with the same leaf fraction writes bit-identical angles and positions, whatever was written before and whatever the direction.

**Validates: Requirements 2.2**

#### Property 22: Only the turning leaf is deformed (playbook P31)
For any page-turn state, `turningLeafIndex` is `null` when the state is idle; otherwise it is the only leaf whose angle lies strictly between 0 and pi, and the leaf fraction passed to `leafCurl` equals that leaf's angle divided by pi. No leaf is curled when the cover progress is below 1 or reduced motion is on.

**Validates: Requirements 2.2, 8.3, 9.2**

#### Property 23: Each page goes on its own leaf face (playbook P32)
For any project and any handler flag, the front ops of leaf `j` contain exactly the text of page `j` from `layoutPages` (title, date, labels, saved values, button label, caption) and no text of another page; every back face has no text ops; no goal, epitaph or notes text appears on any face.

**Validates: Requirements 2.3, 2.4, 9.2**

#### Property 24: Wrapped lines fit the page (playbook P33)
For any text, any width and any measure function with a positive width per character, every wrapped line is no wider than the width unless it is a single character; the lines before any clipping keep every non-whitespace character in order; the line count never exceeds the limit; an ellipsis appears only when text was clipped.

**Validates: Requirements 2.3**

#### Property 25: The face key tracks the drawn text (playbook P34)
For any two projects, the face key of a leaf is equal exactly when the ops of that leaf are equal; changing any drawn text changes the key of its leaf and no other leaf's key; the same project always gives the same key.

**Validates: Requirements 2.4, 9.2**

#### Property 26: The texture size fits the limit and keeps the aspect (playbook P35)
For any positive face width and height and any positive limit, the texture width and height are integers of at least 1, do not exceed the limit, and the aspect ratio differs from the face aspect by at most one texel of rounding; the default limit is 512 by 768.

**Validates: Requirements 8.2**

#### Property 27: The cross-fade never uncovers the page (playbook P36)
For any sequence of phases, page statuses and overlay-opaque reports, after every step the texture is visible or the overlay is fully opaque; the overlay is opaque only when the phase is `open` and the status is idle; a turn start or leaving `open` makes the texture visible in the same step that hides the overlay; with reduced motion the fade duration is 0.

**Validates: Requirements 2.2, 8.3, 9.2**

### Error Handling
- Font fails to load: fallback stack, no message, no console output.
- `requestPointer()` refused after close: "Click to resume" prompt (mode `lost`).
- Project removed or no longer resting while a book is open (the existing `useReadingProject` returns null): dispatch `SKIP` then `CLOSE` so the book returns to `closed` and the pointer is requested again.
- Edit rejected by the domain (empty description): existing inline error stays; text remains on screen and the last saved value is kept.
- `OPEN` while another cinematic runs: ignored, no message.
- No 2D canvas context (or texture creation fails): no leaf textures are made, the leaves keep the shared paper material, and the overlay works alone. The cross-fade model then treats the texture as never visible and the overlay shows without a fade. No message, no console output.
- The book closes or the project disappears while the font promise is pending: the late redraw finds disposed textures and does nothing.

### Testing Strategy (book interaction)
- Library: fast-check with Vitest; each property is a single test, at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>`. Files: `bookSequence.test.ts`, `pageTurn.test.ts`, `readingMachine.test.ts`, `readingKeys.test.ts`, `bookPageLayout.test.ts`.
- Event sequences are generated with `fc.array` of events and tick durations (including zero and above-clamp values) and checked after every step.
- Example tests: `bookLook` constants (edge luminance at least twice the cover luminance, blue channel not below red, hue outside amber range); `pointerEdge`; one render of the page overlay.
- Curl and leaf text (Properties 16 to 27, playbook P25 to P36): new files `leafCurl.test.ts`, `leafFaces.test.ts`, `pageCrossfade.test.ts`, plus `turningLeafIndex` in `pageTurn.test.ts`. Each property is one fast-check test with at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>`. Generators: progress from `fc.double` including NaN, infinities and out-of-range values; segment counts 1 to 64; project text including empty, long, multi-line and non-Latin strings; a fixed-width fake `measure`; random event sequences for the cross-fade.
- Example tests for the adapters, without a GPU: curl geometry buffers keep the same array identity across writes and are written only when the progress changed; the geometry and textures are created when the book leaves `closed` and `dispose` is called on each at `closed`; the shared flat geometry and shared leaf material are restored; no mesh is added (four-part contract, see above); leaf paper contrast, blue not below red, hue outside amber; canvas drawing against a fake 2D context that records calls; overlay metrics equal `PAGE_METRICS * rect.width`; the overlay shows the saved value.
- Manual on the target machine: curl looks like paper and stays smooth, no jump at the swap from strip to flat leaf, text on the leaf matches the overlay at the cross-fade (no visible shift at 100% zoom), readable at night without amber, texture upload cost on the first open, font swap redraw.
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
Unit tests for domain functions. Property-based tests (fast-check) for the invariants and for export/import round trips. Manual performance checks on the target low-end machine at each milestone. The book interaction properties (task 5.3, Properties 1 to 41, including the curved page turn, the leaf text, the cover scrub and the back closing) are listed in "Book interaction (task 5.3)".

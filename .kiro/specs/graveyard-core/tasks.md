# Implementation Plan

## Overview
Build Graveyard of Ideas in layers: pure domain logic first (cheap, GPU-free, property-tested), then persistence, then the 3D world, tombs and books, the grimoire and burial, the resurrection sequence, and finally comfort, fallback mode and polish. Each top-level task is meant to be run in its own Kiro session and committed separately.

## Tasks

- [x] 1. Project setup
  - [x] 1.1 Vite + React + TypeScript strict, React Three Fiber, drei, Zustand, Vitest, fast-check. _Requirements: all_
  - [x] 1.2 Folder structure per steering/structure.md; MIT license; never ignore .kiro.
  - [x] 1.3 Render a minimal night scene (ground plane, fog, moon light, three boxes) and display the frame rate, so performance can be measured on the target machine.

- [x] 2. Domain core (no UI)
  - [x] 2.1 Types, createProject, allocateSlot, bury. _Requirements: 3, 4_
  - [x] 2.2 resurrect, restAgain, honor, remove with validation. _Requirements: 5, 6_
  - [x] 2.3 exportData / importData with schema validation and migration. _Requirements: 7_
  - [x] 2.4 Property-based tests for all invariants (see docs/KIRO_PLAYBOOK.md). _Requirements: 4, 5, 6, 7, 9_

- [x] 3. Store and persistence
  - [x] 3.1 Zustand store, versioned localStorage adapter, autosave, error handling. _Requirements: 7_
  - [x] 3.2 Seed three demo projects once only. _Requirements: 7.5_

- [x] 4. World
  - [x] 4.1 Night terrain, partial blue moon, mist, gate, paths, hut, dead trees, stones. _Requirements: 1.1_
  - [x] 4.2 Player controller (ZQSD/WASD/arrows), direct mouse look with Pointer Lock by default (click-and-drag fallback), bounds and collisions. _Requirements: 1.2, 1.3, 1.4_
  - [x] 4.3 Interaction prompts. _Requirements: 1.5_
  - [x] 4.4 Quality presets, default Low. Checkpoint: measure on the target machine. _Requirements: 8.1_

- [x] 5. Tombs and book
  - [x] 5.1 Tomb with slab and cavity, rendered from resting projects by slot. _Requirements: 2.1_
  - [x] 5.2 3D book model with embedded HTML pages and four parts, autosaved edits. _Requirements: 2.3, 2.4_
  - [x] 5.3 UI state machine; open/close sequences; reading mode; Escape handling. _Requirements: 2, 9_
    Design: "Book interaction (task 5.3)" in design.md. Split into nine sub-tasks (5.3.1 to 5.3.9), each one Kiro session and one commit, run in order. Sub-tasks are never marked optional because each one carries its own tests.
    Note: after 5.3.6 a set of corrections to 5.3.5 and 5.3.6 was built outside the spec: opening only from the front of the tomb (`isInFrontOfTomb`, `FRONT_MIN_DOT` 0.35); timings of 1.0 s, 1.2 s and 1.2 s; two drag zones; hand-scrubbed front cover and back board; an end position after the last page; back-close and the 180 degree flip; a close from the last page turns the leaf first; `CURL_STRENGTH`; the leaf stacking rule. They are documented in design.md "Corrections after 5.3.6" and covered by playbook P32-P50. Where a sub-task below says otherwise, the corrections win.
    Note: real-book faces (text on both faces, two pages per spread, editable fields on the left page) were considered and moved to docs/POLISH_BACKLOG.md; they need a page-model change.

  - [x] 5.3.1 Pure core and properties (no React, no Three.js, no DOM, no timers)
    - Scope: create `bookTimings`, `bookSequence`, `pageTurn`, `readingMachine`, `readingKeys`, `bookPageLayout` and `uiMode`, with the constants, transition table, invariants I1-I6 and allocation rule from the design (state records created once and mutated in place). `readingMachine` exposes `subscribe` for discrete changes and derived selectors (`pointerLockReleased`, `inputLocked`, UI mode). Add the pure helper `pointerEdge(prev, next)` (place it in `src/interaction/pointerLock.ts` as a new export only; do not change lock behavior yet).
    - Files: `src/book/bookTimings.ts`, `bookSequence.ts`, `pageTurn.ts`, `readingMachine.ts`, `readingKeys.ts`, `bookPageLayout.ts`; `src/interaction/uiMode.ts`, `src/interaction/pointerLock.ts` (export `pointerEdge` only), exports in `src/book/index.ts` and `src/interaction/index.ts`; tests `src/tests/bookSequence.test.ts`, `pageTurn.test.ts`, `readingMachine.test.ts`, `readingKeys.test.ts`, `bookPageLayout.test.ts`, plus a `pointerEdge` example test.
    - Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 8.3, 9.1, 9.2, 1.2.2
    - Acceptance criteria:
      - No import of React, Three.js, DOM globals, `setTimeout` or `requestAnimationFrame` in the seven new modules (checked by a test that scans their source text).
      - Each design property 1-13 and 15 is one fast-check test, at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>` (playbook P10-P22 and P24). Event sequences include zero and above-clamp `dt`.
      - Design property 14 (page layout content, playbook P23) is also covered here because `bookPageLayout` is created in this task. If the user prefers it in 5.3.5, move it and say so in the commit message.
      - Example tests: phase boundaries at t = 0.6, 1.4, 2.2; exactly 0.5 completes a turn; ends of the book are no-ops; `pointerEdge` for each transition pair.
      - The OPEN guard (mode `exploring`, pointer allows movement, project rests) is a pure function with example tests for each refusal.
      - Existing tests still pass; `tsc` strict has no errors.
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 8.3, 9.1, 9.2_

  - [x] 5.3.2 Book model rework and visibility look
    - Scope: hinged front board (pivot on the spine) and a shared leaf stack of three leaves sharing one geometry and one material. The four parts stay separate meshes so task 7.2 can dissolve each. Add `bookLook` with the pale blue-gray page-edge band, a small shared procedural cover-border texture (about 128 by 128) used as `map` on the front board only, and a low emissive rim on page-edge and cover-border materials. No amber, no new lights, no extra shadow casting. Materials and texture are created in `createBookAssets` and released in `dispose()`. The handle also exposes `root` and `leaves`. Book looks the same as before when closed apart from the new look.
    - Files: `src/book/Book.tsx`, `bookAssets.ts`, `bookHandles.ts`, `bookParts.ts` (only if needed), new `bookLook.ts`, `src/tests/bookLook.test.ts`, `src/tests/book.test.ts` (adjust).
    - Requirements: 2.3, 8.2, 9.3
    - Acceptance criteria:
      - Front board rotates about the spine axis when its pivot angle is set; at angle 0 it sits flush with the page block.
      - Geometries and materials are shared across all books and leaves; `dispose()` releases them all, including the texture (test counts disposals).
      - The four parts remain four separate meshes, each reachable from the handle.
      - `bookLook` tests: page-edge luminance is at least twice the cover luminance; blue channel not below red; hue outside the amber range for every color.
      - No `PointLight`, `SpotLight` or shadow flag added by the book (test on the built group).
      - Existing book and tomb tests pass; editing in the current tab panel still works until 5.3.5.
    - _Requirements: 2.3, 8.2, 9.3_

  - [x] 5.3.3 Sequence driver in R3F, input lock and pointer rule
    - Scope: `BookSequenceDriver` ticks the machine in `useFrame` and applies lift, approach and cover animation from the machine `t`, with the reading pose computed in camera space from a pose captured when OPEN is accepted, using preallocated vectors and quaternions. Add the `inputLocked` flag on `PlayerController` (zeroes walking and look, releases held keys, leaves pointer mode untouched, look-drag off in fallback). Change `pointerLock.ts` so a refused `requestPointer()` while mode is `released` becomes `lost`. Driver calls `releasePointer()` on entering `open`, `requestPointer()` when leaving `open`, and dispatches `CLOSE` if the lock is lost during lifting, approaching or coverOpening. E prompt starts the sequence and is hidden while `inputLocked`. Escape and E reverse. Reduced motion dispatches `SKIP` after OPEN or CLOSE. `readingBook.ts` keeps only the open project id; `openBook` and `closeBook` call the machine.
    - Files: new `src/book/BookSequenceDriver.tsx`, `src/book/readingBook.ts`, `src/book/useReadingInput.ts` (Escape, E and arrow routing via `readingKeys`; dragging comes in 5.3.5), `src/interaction/PlayerController.tsx`, `src/interaction/pointerLock.ts`, `src/interaction/InteractionController.tsx` and `src/ui/InteractionPrompt.tsx` (prompt wiring), `src/App.tsx` (mount driver), tests in `src/tests/interaction.test.ts` and `src/tests/player.test.ts`.
    - Requirements: 1.2.2, 2.1, 2.2, 2.5, 2.6, 8.3, 9.1, 9.2
    - Acceptance criteria:
      - Pressing E near a resting tomb lifts, approaches and opens the cover (the lift, approach and cover take 1.0 s, 1.2 s and 1.2 s, 3.4 s in all) when the player stands in front of the tomb; Escape or E reverses along the same path with no jump and the book rests on its base again.
      - While `inputLocked`, walking and look do nothing and held keys are released; leaving `closed` and returning to it toggles the flag exactly with the machine (test through the exported selectors).
      - Pointer is released on entering `open` with no "Click to resume" prompt; closing with E re-locks; a refused request after Escape sets mode `lost` and the prompt shows (unit test on the mode logic with a mocked request).
      - Pointer-lock loss during the opening phases dispatches CLOSE.
      - The driver does no work in `closed`, or in `open` with idle pages; no per-frame allocation (code review: no `new` or array/object literals inside `useFrame`; a test over the driver source rejects `new Vector3(` inside the frame callback).
      - Reduced motion reaches `open` or `closed` immediately.
      - The pages still show through the old tab panel until 5.3.5 and remain usable once open.
    - _Requirements: 1.2.2, 2.1, 2.2, 2.5, 2.6, 8.3, 9.1, 9.2_

  - [x] 5.3.4 Local fonts
    - Scope: ship local OFL font files (IM Fell English recommended; Cinzel Decorative or UnifrakturCook as alternatives; ask the user which one if the first choice cannot be downloaded) in `public/fonts/<family>/` with `OFL.txt`. Declare `@font-face` with `font-display: swap` and Latin and Latin-1 `unicode-range`. Add `bookFonts.ts` with the family constant, the fallback stack `'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif` and `ensureBookFont()` (one `document.fonts.load` call, never blocks, silent on failure). No CDN and no remote URL. Check the Reserved Font Name clause before any subsetting; if unsure ship the unmodified files.
    - Files: `public/fonts/<family>/*.woff2`, `public/fonts/<family>/OFL.txt`, `src/book/bookFonts.ts`, global CSS location already used by the app (or `index.html`), `docs/ASSETS.md`, `src/tests/bookFonts.test.ts`.
    - Requirements: 2.3, 8.2
    - Acceptance criteria:
      - Font files and `OFL.txt` exist and are listed in `docs/ASSETS.md` with family, source URL, license, date and file sizes.
      - Smoke tests: files exist, `@font-face` URLs are relative to the app (no `http`), stack ends in a generic `serif`, `ensureBookFont()` resolves when `document.fonts` is missing or rejects.
      - `ensureBookFont()` is called once at startup when a resting project exists, and nothing waits on it.
      - No console output on load failure.
    - _Requirements: 2.3, 8.2_

  - [x] 5.3.5 Pages overlay and page-turning UI
    - Scope: `BookPageOverlay` replaces the tab panel of `BookPages.tsx`. Three pages from `bookPageLayout`: page 1 title in the ancient font plus burial date; page 2 reason and idea (editable); page 3 next action and the optional reduced version ("A smaller version (optional)"), both editable, plus the resurrection button, disabled until task 7 supplies a handler (`goal`, `epitaph` and `notes` have no page and stay in the grimoire, task 8.1). Extract `FieldEditor` unchanged (autosave via `editProject`). Mouse drag turns pages with `grab` on hover and `grabbing` while dragging (`data-dragging`); arrow keys turn pages outside typing targets; leaf rotation in the driver (`leafAngle * cover`, at most two leaves written, only when changed); page content hidden (opacity 0, no pointer events) while a turn is not idle and fades in after. Close button dispatches CLOSE. Pointer is released when open and requested again on close. Page rectangle projected once on reaching `open` and on window resize.
    - Files: new `src/book/BookPageOverlay.tsx`, `FieldEditor.tsx`; `src/book/BookPages.tsx` (tab panel removed), `BookSequenceDriver.tsx` (leaf angles), `useReadingInput.ts` (drag, cancel on `pointercancel` and blur, `setPointerCapture`), `src/book/index.ts`, CSS for cursors, `src/tests/bookOverlay.test.tsx` (one render).
    - Requirements: 2.2, 2.3, 2.4, 2.6
    - Acceptance criteria:
      - Dragging at least half the turn distance completes a turn; less returns; Escape during a drag cancels the drag and keeps the page (Escape also closes after the page is idle).
      - Left and right arrows turn pages and do nothing inside inputs or textareas; the end position (after the last page) ignores the missing direction.
      - Dragging never starts on `input`, `textarea`, `select` or `button`; cursors are grab, grabbing, text and pointer as specified.
      - Content is hidden during a turn and returns after; title wraps (`overflow-wrap: anywhere`) and is limited to three lines.
      - Editing a field autosaves; an empty description keeps the existing inline error and the last saved value.
      - Close during a turn waits until the page model is idle, then closes.
      - The resurrection button renders disabled with no handler.
      - One overlay render test passes; all earlier tests still pass.
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 5.3.6 Curved page turn
    - Scope: the turning leaf bends like paper; the rigid leaf angle stays the page model. Add the pure module `leafCurl` (`leafCurl(progress, segments, out)`, `leafStrip(phi, segments, width, depth, positions, normals)`, `LEAF_CURL = { segments: 12, tipLag: 0.8 }`) and the pure helper `turningLeafIndex(state)` in `pageTurn.ts`. Add the adapter `leafCurlMesh` (Three.js, no React): one curl geometry per open book (two strips of 13 by 2 vertices, UV and index built once, position and normal attributes `DynamicDrawUsage`, buffers preallocated), created when the book leaves `closed` and disposed when it returns to `closed`, never created for a closed book. At turn start the turning leaf mesh gets the curl geometry (`frustumCulled = false`, hinge rotation 0 while the strip is drawn); at turn end it gets the shared flat geometry and the usual `-renderedLeafAngle` back. Each frame writes in place, only when the leaf fraction changed (last written fraction reset to NaN at turn start), then sets `needsUpdate` on the two attributes. Only the turning leaf is deformed, only while `status !== 'idle'`, `cover === 1` and reduced motion is off. Reduced motion: no curl, the leaf follows the drag rigidly with the flat geometry. No new lights, no amber, no new shadow casting (`castShadow` stays false), shared flat geometry and material untouched. Add the missing example test for the four-part contract through `getBookHandle(id).parts`. Add playbook entries P25-P31.
    - Files: new `src/book/leafCurl.ts`, `src/book/leafCurlMesh.ts`; `src/book/pageTurn.ts` (`turningLeafIndex` only), `src/book/bookTimings.ts` (`LEAF_CURL`), `src/book/BookSequenceDriver.tsx` (swap and in-place writes), `src/book/index.ts`; tests `src/tests/leafCurl.test.ts`, `src/tests/pageTurn.test.ts` (add `turningLeafIndex`), `src/tests/leafCurlMesh.test.ts`, `src/tests/book.test.ts` (parts through the handle); `docs/KIRO_PLAYBOOK.md` (P25-P31).
    - Requirements: 2.2, 2.3, 8.2, 8.3
    - Acceptance criteria:
      - `leafCurl.ts` imports no React, Three.js, DOM, timers (source-scan test, same as 5.3.1).
      - Design properties 16-22 are seven fast-check tests, at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>` for N = 16 to 22: 16 flat at the ends, 17 arc length constant, 18 finite angles and clamped inputs (NaN, infinities), 19 curvature symmetric around the middle, 20 spine angle opens monotonically, 21 shape depends on progress alone (bit-identical after forward, back, forward), 22 only the turning leaf is deformed (`turningLeafIndex`, no curl while cover is below 1 or reduced motion is on). Generators: progress from `fc.double` including NaN, infinities and out-of-range values; segment counts 1 to 64.
      - Adapter example tests (no GPU): geometry buffers keep the same array identity across writes; nothing is written when the fraction is unchanged; the curl geometry is created when the book leaves `closed` and `dispose` is called on it at `closed`; the shared flat geometry and shared leaf material are restored after each turn; at most one leaf is swapped at a time; `castShadow` stays false; no light is added.
      - In-place writes with no per-frame allocation: a test over the driver and `leafCurlMesh` source rejects `new ` and array or object literals inside the `useFrame` callback and the per-frame write function.
      - Reduced motion produces no curl: the flat geometry stays on the leaf during a drag and after release.
      - Example test (the missing four-part test): after `registerBookHandle`, `getBookHandle(id).parts` has exactly the keys `cover`, `spine`, `pageBlock` and `pages`, four distinct objects, each reachable from `handle.root`, with mesh counts 1, 1, 1 and 3; the same check passes again while a curl is active.
      - `docs/KIRO_PLAYBOOK.md` has entries P25-P31 for design properties 16-22 (design property N is playbook P(N+9)).
      - Manual check on the target machine is deferred to 5.3.9; the code only needs to run and pass tests here. All earlier tests pass; `tsc` strict has no errors.
    - _Requirements: 2.2, 2.3, 8.2, 8.3_

  - [x] 5.3.7 Pure leaf-face and cross-fade modules (no canvas)
    - Scope: the page text and the cross-fade are defined as pure modules, so that 5.3.8 only has to draw and wire them. Add the pure module `leafFaces` (`leafFaces(project, hasResurrectHandler, measure)` returning `{ front, back }` draw ops per leaf in page-width units. Text is on the FRONT face of each leaf only (the front of leaf j is page j); every `back` is an empty array; the end position has no content and no ops; the front ops of page 3 include the optional reduced version field (property 23); the page model, the overlay and I1-I6 are unchanged; greedy word wrap with an injected `measure`, title clipped to 3 lines with an ellipsis, multiline field limited to 5 lines, `PAGE_METRICS`, `faceKey(ops)`, `textureSize(faceWidth, faceHeight, maxWidth = 512, maxHeight = 768)`) and the pure module `pageCrossfade` (visibility model of the leaf texture and the overlay, `crossfadeSeconds(reducedMotion)`). The model follows this exact ordering, written as the pure model only: (1) turn start, or phase leaving `open`: the leaf texture becomes visible and the overlay becomes hidden, in one step and in that order, so the page is never uncovered; (2) turn end (`idle` again, or `open` reached): the overlay fades in over `PAGE_FADE_SECONDS = 0.15` s, ease-out, with the texture still visible during the fade; (3) only after an overlay-opaque report (opacity 1, or at once when the duration is 0) does the texture become hidden (the front slot goes back to the blank paper); if the report never arrives the texture stays visible under the opaque overlay; (4) reduced motion: `crossfadeSeconds(true) = 0`, overlay fully opaque at once, texture hidden in the same step, no fade. Shared constants, also consumed by the overlay: the `bookLook` leaf colors (`leafPaper` `#c3ccdb`, `leafInk` `#141c30`, field fill `#dde3ee`, field border `#5a6a84`, muted `#3a4766`, button fill `#1d2740`, button text `#c8d8ff`, button border `#3b4d73`), the new `BOOK_BODY_STACK` in `bookFonts.ts` (a pure constant that replaces the bare `serif`, used by the overlay now and by the canvas in 5.3.8) and `PAGE_FADE_SECONDS = 0.15`. `BookPageOverlay.tsx` imports these constants and `PAGE_METRICS` (`rect.width * value`) instead of its own hex strings and numbers, with no change to what it shows. No canvas, no Three.js, no texture, no material change and no driver change in this task. Add playbook entries P51-P55, appended after P50 in docs/KIRO_PLAYBOOK.md (P32-P50 already belong to the corrections after 5.3.6).
    - Files: new `src/book/leafFaces.ts`, `pageCrossfade.ts`; `src/book/bookLook.ts` (leaf colors), `bookFonts.ts` (`BOOK_BODY_STACK`), `BookPageOverlay.tsx` (shared constants only), `src/book/index.ts`; tests `src/tests/leafFaces.test.ts`, `pageCrossfade.test.ts`, `bookLook.test.ts` (leaf colors), `bookOverlay.test.tsx` (metrics and shared constants), `bookFonts.test.ts`; `docs/KIRO_PLAYBOOK.md` (P51-P55, after P50).
    - Requirements: 2.3, 2.4, 2.2, 8.2, 8.3, 9.2
    - Acceptance criteria:
      - `leafFaces.ts` and `pageCrossfade.ts` import no React, Three.js, DOM, timers (source-scan test).
      - Design properties 23-27 are five fast-check tests, at least 100 runs, tagged `Feature: graveyard-core, Property N: <title>` for N = 23 to 27 (Requirement 9.2 is cited by properties 23 and 25 only): 23 each page on its own leaf face (every back empty; the end position has no content; page 3 includes the reduced version; no goal, epitaph or notes text), 24 wrapped lines fit the page (fixed-width fake `measure`), 25 the face key tracks the drawn text, 26 texture size fits the limit and keeps the aspect (default limit 512 by 768, result 512 x 686 for the page face), 27 the cross-fade never uncovers the page (random sequences of phases, statuses and overlay-opaque reports; reduced motion gives duration 0). Generators include empty, long, multi-line and non-Latin text.
      - Cross-fade ordering test against the model: texture visible before the overlay is hidden in the same step; fade-in 0.15 s with texture still visible; blank-paper swap only after the opacity report; no report leaves the texture in place; reduced motion has no fade and no blank frame.
      - Overlay metrics equal `PAGE_METRICS * rect.width`; the overlay shows the saved value; the overlay imports the same colors and font stacks (no duplicated hex strings in the overlay).
      - Leaf colors in `bookLook`: blue channel not below red, hue outside the amber range; no new light or shadow.
      - `docs/KIRO_PLAYBOOK.md` has entries P51-P55 for design properties 23-27 (design 23 = P51, 24 = P52, 25 = P53, 26 = P54, 27 = P55), appended after P50.
      - All earlier tests pass; `tsc` strict has no errors.
    - _Requirements: 2.2, 2.3, 2.4, 8.2, 8.3, 9.2_

  - [x] 5.3.8 Leaf textures and overlay cross-fade wiring
    - Scope: page text is drawn onto the leaf faces so it turns with the paper. Needs 5.3.7 (no new pure logic here: use `leafFaces`, `pageCrossfade`, `PAGE_METRICS`, `BOOK_BODY_STACK`, `PAGE_FADE_SECONDS` and the leaf colors from 5.3.7). Add the canvas adapter `leafTextures` (no React): three canvases of at most 512 x 686 (the face aspect is about 0.746, so 512 x 686, not 512 x 768), `generateMipmaps = false`, linear filtering, sRGB, one texture per leaf, ops from `leafFaces` drawn with `fillText`, `fillRect` and `strokeRect`; field boxes, button and "Page n of 3" caption are also drawn on the texture. Textures are created when the book leaves `closed` (OPEN accepted) and disposed, with canvases and materials, when the phase returns to `closed`, in the same place as the curl geometry; a closed book never has them. While open, each leaf mesh uses the material array `[edge, edge, edge, edge, front, back]` (shared edge material, the back material at index 5 stays the shared blank paper and nothing is drawn for the end position, per-leaf front with the canvas texture as `map` and a low `emissiveMap`, start near 0.25) and the curl geometry uses the same material indices (4 front, 5 back). Redraw: `ensureBookFont().then(redrawAll)` after the textures are created, never awaited, harmless if the book closed meanwhile; and on a changed `faceKey` (a dirty leaf is redrawn at once if its texture is visible, otherwise when it becomes visible at turn start or when the phase leaves `open`; only dirty leaves are drawn). Cross-fade wiring in the driver and the overlay, exact ordering: (1) turn start, or phase leaving `open`: in one synchronous step first redraw dirty textures and show the texture on the front materials, then hide the overlay at once (`opacity 0`, `transition: none`); (2) turn end (`idle` again, or `open` reached): the overlay fades in over `PAGE_FADE_SECONDS = 0.15` s, ease-out, with the texture still visible during the fade; (3) the overlay reports opacity 1 (`transitionend` for `opacity`, or at once when the duration is 0), and only then the front slot is swapped to the blank paper material (never `visible = false`); if the report never arrives the texture stays under the opaque overlay; (4) reduced motion: `crossfadeSeconds(true) = 0`, overlay at full opacity at once, texture hidden in the same step, no fade. The overlay and the canvas consume the same `leafFaces` ops, `PAGE_METRICS`, `BOOK_FONT_STACK`, `BOOK_BODY_STACK` and `bookLook` colors. Paper blue-gray and readable at night through the emissive map; no amber, no new lights, no shadow casting. If no 2D context is available, no textures exist, the leaves keep the shared paper material and the overlay works alone with no message and no console output. No playbook entries here. The first manual look at the texture is deferred to 5.3.9.
    - Files: new `src/book/leafTextures.ts`; `src/book/bookAssets.ts` and `Book.tsx` (material array), `leafCurlMesh.ts` (groups with material indices 4 and 5), `BookSequenceDriver.tsx` (create, dispose, redraw, swap, cross-fade), `BookPageOverlay.tsx` (fade and opacity report), `src/book/index.ts`; tests `src/tests/leafTextures.test.ts` and updates to the existing book, overlay and driver tests.
    - Requirements: 2.3, 2.4, 2.2, 8.2, 8.3, 9.2
    - Acceptance criteria:
      - Texture size never exceeds 512 x 686 for the real page face; three textures use `generateMipmaps = false`.
      - Textures are created when the book leaves `closed` and `dispose` is called on every texture, canvas reference and material at `closed` (test counts disposals); closed books own none.
      - Redraw: a fake font promise resolving after creation triggers one redraw; resolving after close does nothing; a changed text redraws only the dirty leaf, and only when visible or at the moment it becomes visible; nothing is drawn per frame.
      - Driver-level cross-fade ordering behaves as the 5.3.7 model: texture visible before the overlay is hidden in the same step; fade-in 0.15 s with texture still visible; blank-paper swap only after the opacity report; no report leaves the texture in place; reduced motion has no fade and no blank frame.
      - Canvas drawing is tested against a fake 2D context that records calls.
      - Example tests: leaf paper and ink contrast at least 7:1; no `PointLight`, `SpotLight` or `castShadow` added; four parts and their mesh counts unchanged in every phase (reuse the 5.3.6 `parts` test).
      - Source scan: the `useFrame` callbacks in the driver and in `leafTextures`/`leafCurlMesh` contain no allocation (`new `, array or object literals, canvas creation, `fillText`).
      - No 2D context: the book still opens and the overlay works alone with no message and no console output.
      - All earlier tests pass; `tsc` strict has no errors.
    - _Requirements: 2.2, 2.3, 2.4, 8.2, 8.3, 9.2_

  - [x] 5.3.9 Integration and checkpoint
    - Scope: wire the whole flow and handle edge cases, measure on the target machine, update logs. Handle skip, reload and removed-project cases, now including the curl and the leaf text: a project removed or no longer resting while open dispatches SKIP then CLOSE, requests the pointer, and disposes the curl geometry and leaf textures; reload always starts `closed` with nothing created; SKIP during a curled turn finishes it and restores the flat leaf and shared materials; `paused` freezes ticks (curl and fade included) and restores the mode. Reduced motion verified end to end (no curl, no fade). Manual measurement on the target machine follows the single checklist in the acceptance criteria. Update `docs/KIRO_LOG.md`. Verify `docs/KIRO_PLAYBOOK.md` holds entries P25-P31 (added by 5.3.6) and P51-P55 (added by 5.3.7); P32-P50 were added by the corrections after 5.3.6. Fill any gap. Update `requirements.md` so 2.1, 2.3 and 2.5 describe the new flow, and record the page 3 decision (see the block below).
    - Files: `src/book/readingBook.ts`, `src/book/BookSequenceDriver.tsx`, `src/interaction/uiMode.ts` (only if integration needs it), `src/tests/` (integration tests), `docs/KIRO_LOG.md`, `docs/KIRO_PLAYBOOK.md` (check only), `.kiro/specs/graveyard-core/requirements.md`.
    - Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3
    - Acceptance criteria:
      - Integration test also covers curl and text: OPEN creates the curl geometry and leaf textures once; a curled turn swaps and restores the leaf; CLOSE, SKIP, project removal and `paused` leave no curl geometry, texture, canvas or material undisposed and the shared leaf geometry and material restored.
      - Reload (fresh module state) starts `closed` with no curl geometry and no textures; SKIP mid-turn lands on the correct final state without replaying.
      - Reduced motion end to end: no curl, no fade, and the overlay is opaque at once.
      - One manual checklist on the target machine, Low quality. Results are recorded in `docs/KIRO_LOG.md`; no performance claim without them:
        - frame rate during the opening sequence;
        - frame rate during a curled turn, compared with a flat turn;
        - first open with the texture upload (no visible stutter);
        - cross-fade look at 100% zoom (no visible shift or blank frame, readable at night, no amber);
        - cursor shapes;
        - Escape refusal, then "Click to resume";
        - font fallback by renaming the font file once.
      - `docs/KIRO_PLAYBOOK.md` contains P25-P31 (added by 5.3.6) and P51-P55 (added by 5.3.7); P32-P50 were added by the corrections after 5.3.6. This task only checks them.
      - Integration test: with a mocked pointer, OPEN to `open`, a page turn, CLOSE, back to `closed` ends with page 0, `inputLocked` false and an `unlocked` request issued.
      - Removing the open project in the store returns the book to `closed` and the player to a usable state.
      - OPEN is refused while mode is `burying`, `resurrecting` or `paused`.
      - `docs/KIRO_LOG.md` records what the spec, steering and property tests contributed in tasks 5.3.1 to 5.3.9, including the curl, the leaf text and the playbook entries P25-P31 and P51-P55.
      - `requirements.md` 2.1, 2.3 and 2.5 are rewritten for the new flow (book lifts off its base and approaches the player; three pages; book returns to its base) and left for the user's review in that session. The page 3 decision (page 3 holds `reducedVersion`; `goal`, `epitaph` and `notes` stay in the grimoire) is recorded there as already decided.
      - All tests pass; ask the user if questions arise.
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

  - **Open items and decisions**
    - Decided: page 3 holds `reducedVersion` next to the next action and the resurrection button. `goal`, `epitaph` and `notes` stay in the grimoire (task 8.1) and have no page.
    - Open: Requirements 2.1, 2.3 and 2.5 still describe the slab flow and four parts. Their wording is left to 5.3.9, where the user reviews it.

- [ ] 6. Grimoire and burial
  - [ ] 6.1 Lectern in the hut, create form, project list by status, guide-to-tomb transition. _Requirements: 3_
  - [ ] 6.2 Burial cinematic with skip and cleanup. _Requirements: 4_

- [ ] 7. Resurrection
  - [ ] 7.1 Next-action requirement UI. _Requirements: 5.1_
  - [ ] 7.2 Embers sequence, then specter sequence, strict ordering, tomb and collider removal. _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 7.3 Skip and reload during animation give the final state. _Requirements: 5.7_

- [ ] 8. After resurrection
  - [ ] 8.1 Grimoire management of resurrected and accomplished projects, rest again, honor, delete with confirmation. _Requirements: 6_

- [ ] 9. Comfort and fallback
  - [ ] 9.1 Menu, controls help, reduced animations, export/import UI. _Requirements: 7, 8.3_
  - [ ] 9.2 Simple non-3D mode with all functions. _Requirements: 8.4_

- [ ] 10. Polish and submission
  - [ ] 10.1 Textures and visual details, performance pass on the target machine.
  - [ ] 10.2 Demo video under 3 minutes, Kiro write-up, README, license check, asset list.
  - [ ] 10.3 Optional, last: sound with a mute button.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "4.2", "4.4"] },
    { "id": 4, "tasks": ["2.4", "3.1", "4.3"] },
    { "id": 5, "tasks": ["3.2", "5.1"] },
    { "id": 6, "tasks": ["5.2", "6.1"] },
    { "id": 7, "tasks": ["5.3.1", "7.1", "9.1"] },
    { "id": 8, "tasks": ["5.3.2", "5.3.4"] },
    { "id": 9, "tasks": ["5.3.3"] },
    { "id": 10, "tasks": ["5.3.5"] },
    { "id": 11, "tasks": ["5.3.6"] },
    { "id": 12, "tasks": ["5.3.7"] },
    { "id": 13, "tasks": ["5.3.8"] },
    { "id": 14, "tasks": ["5.3.9"] },
    { "id": 15, "tasks": ["6.2", "7.2"] },
    { "id": 16, "tasks": ["7.3", "8.1"] },
    { "id": 17, "tasks": ["9.2", "10.1"] },
    { "id": 18, "tasks": ["10.2", "10.3"] }
  ]
}
```

## Notes
- Run one top-level task per Kiro session and commit after each (for example "Task 2: domain core").
- Order of work: 1, 2 and 3 first (no graphics card needed), then 4 with the performance checkpoint before investing in visuals.
- Never run all tasks at once while credits are limited.
- Task 5.3 sub-tasks run strictly in order 5.3.1 to 5.3.9, one session and one commit each (for example "Task 5.3.1: pure book core"). 5.3.2 and 5.3.4 are independent of each other and can run in either order.
- Design properties 1-22 map to playbook P10-P31 (design property N is playbook P(N+9)). Properties 1-15 are P10-P24 (5.3.1), 16-22 are P25-P31 (written to docs/KIRO_PLAYBOOK.md in 5.3.6). P32-P50 belong to the corrections after 5.3.6 (P32-P36 two drag zones, P37-P40 cover scrub, P41-P45 back closing, P46-P50 end position). Properties 23-27 (leaf text and cross-fade) are P51-P55 (23 = P51, 24 = P52, 25 = P53, 26 = P54, 27 = P55), written in 5.3.7 after P50. 5.3.9 only checks that P25-P31 and P51-P55 exist.
- Task 5.3 has nine sub-tasks, 5.3.1 to 5.3.9, one session each.
- 5.3.6, 5.3.7, 5.3.8 and 5.3.9 run strictly in sequence (5.3.8 needs the pure modules of 5.3.7, and 5.3.6 and 5.3.8 both touch the leaf mesh and `BookSequenceDriver.tsx`). 5.3.7 is GPU-free (pure modules and constants only).
- Keep docs/KIRO_LOG.md updated with what the spec, steering and tests contributed in each session.
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

- [ ] 5. Tombs and book
  - [x] 5.1 Tomb with slab and cavity, rendered from resting projects by slot. _Requirements: 2.1_
  - [x] 5.2 3D book model with embedded HTML pages and four parts, autosaved edits. _Requirements: 2.3, 2.4_
  - [ ] 5.3 UI state machine; open/close sequences; reading mode; Escape handling. _Requirements: 2, 9_
    Design: "Book interaction (task 5.3)" in design.md. Split into six sub-tasks, each one Kiro session and one commit, run in order. Sub-tasks are never marked optional because each one carries its own tests.

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
      - Pressing E near a resting tomb lifts, approaches and opens the cover in about 2.2 s; Escape or E reverses along the same path with no jump and the book rests on its base again.
      - While `inputLocked`, walking and look do nothing and held keys are released; leaving `closed` and returning to it toggles the flag exactly with the machine (test through the exported selectors).
      - Pointer is released on entering `open` with no "Click to resume" prompt; closing with E re-locks; a refused request after Escape sets mode `lost` and the prompt shows (unit test on the mode logic with a mocked request).
      - Pointer-lock loss during the opening phases dispatches CLOSE.
      - The driver does no work in `closed`, or in `open` with idle pages; no per-frame allocation (code review: no `new` or array/object literals inside `useFrame`; a test over the driver source rejects `new Vector3(` inside the frame callback).
      - Reduced motion reaches `open` or `closed` immediately.
      - The pages still show through the old tab panel until 5.3.5 and remain usable once open.
    - _Requirements: 1.2.2, 2.1, 2.2, 2.5, 2.6, 8.3, 9.1, 9.2_

  - [ ] 5.3.4 Local fonts
    - Scope: ship local OFL font files (IM Fell English recommended; Cinzel Decorative or UnifrakturCook as alternatives; ask the user which one if the first choice cannot be downloaded) in `public/fonts/<family>/` with `OFL.txt`. Declare `@font-face` with `font-display: swap` and Latin and Latin-1 `unicode-range`. Add `bookFonts.ts` with the family constant, the fallback stack `'IM Fell English', 'Palatino Linotype', Palatino, Georgia, serif` and `ensureBookFont()` (one `document.fonts.load` call, never blocks, silent on failure). No CDN and no remote URL. Check the Reserved Font Name clause before any subsetting; if unsure ship the unmodified files.
    - Files: `public/fonts/<family>/*.woff2`, `public/fonts/<family>/OFL.txt`, `src/book/bookFonts.ts`, global CSS location already used by the app (or `index.html`), `docs/ASSETS.md`, `src/tests/bookFonts.test.ts`.
    - Requirements: 2.3, 8.2
    - Acceptance criteria:
      - Font files and `OFL.txt` exist and are listed in `docs/ASSETS.md` with family, source URL, license, date and file sizes.
      - Smoke tests: files exist, `@font-face` URLs are relative to the app (no `http`), stack ends in a generic `serif`, `ensureBookFont()` resolves when `document.fonts` is missing or rejects.
      - `ensureBookFont()` is called once at startup when a resting project exists, and nothing waits on it.
      - No console output on load failure.
    - _Requirements: 2.3, 8.2_

  - [ ] 5.3.5 Pages overlay and page-turning UI
    - Scope: `BookPageOverlay` replaces the tab panel of `BookPages.tsx`. Three pages from `bookPageLayout`: page 1 title in the ancient font plus burial date; page 2 reason and idea (editable); page 3 next action (editable) and the resurrection button, disabled until task 7 supplies a handler. Extract `FieldEditor` unchanged (autosave via `editProject`). Mouse drag turns pages with `grab` on hover and `grabbing` while dragging (`data-dragging`); arrow keys turn pages outside typing targets; leaf rotation in the driver (`leafAngle * cover`, at most two leaves written, only when changed); page content hidden (opacity 0, no pointer events) while a turn is not idle and fades in after. Close button dispatches CLOSE. Pointer is released when open and requested again on close. Page rectangle projected once on reaching `open` and on window resize.
    - Files: new `src/book/BookPageOverlay.tsx`, `FieldEditor.tsx`; `src/book/BookPages.tsx` (tab panel removed), `BookSequenceDriver.tsx` (leaf angles), `useReadingInput.ts` (drag, cancel on `pointercancel` and blur, `setPointerCapture`), `src/book/index.ts`, CSS for cursors, `src/tests/bookOverlay.test.tsx` (one render).
    - Requirements: 2.2, 2.3, 2.4, 2.6
    - Acceptance criteria:
      - Dragging at least half the turn distance completes a turn; less returns; Escape during a drag cancels the drag and keeps the page (Escape also closes after the page is idle).
      - Left and right arrows turn pages and do nothing inside inputs or textareas; first and last pages ignore the missing direction.
      - Dragging never starts on `input`, `textarea`, `select` or `button`; cursors are grab, grabbing, text and pointer as specified.
      - Content is hidden during a turn and returns after; title wraps (`overflow-wrap: anywhere`) and is limited to three lines.
      - Editing a field autosaves; an empty description keeps the existing inline error and the last saved value.
      - Close during a turn waits until the page model is idle, then closes.
      - The resurrection button renders disabled with no handler.
      - One overlay render test passes; all earlier tests still pass.
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [ ] 5.3.6 Integration and checkpoint
    - Scope: wire the whole flow and handle edge cases, measure on the target machine, update logs. Handle skip, reload and removed-project cases: a project removed or no longer resting while open dispatches SKIP then CLOSE and requests the pointer; reload always starts `closed`; `paused` freezes ticks and restores the mode. Reduced motion verified end to end. Update `docs/KIRO_LOG.md`. Update `requirements.md` so 2.1, 2.3 and 2.5 describe the new flow (see open items below).
    - Files: `src/book/readingBook.ts`, `src/book/BookSequenceDriver.tsx`, `src/interaction/uiMode.ts` (only if integration needs it), `src/tests/` (integration tests), `docs/KIRO_LOG.md`, `.kiro/specs/graveyard-core/requirements.md`.
    - Requirements: 2.1, 2.2, 2.5, 2.6, 8.1, 8.3, 9.1, 9.2, 9.3
    - Acceptance criteria:
      - Integration test: with a mocked pointer, OPEN to `open`, a page turn, CLOSE, back to `closed` ends with page 0, `inputLocked` false and an `unlocked` request issued.
      - Removing the open project in the store returns the book to `closed` and the player to a usable state.
      - OPEN is refused while mode is `burying`, `resurrecting` or `paused`.
      - Manual measurement on the target machine on Low quality: frame rate during the sequence and on the first open (no visible stutter), cursor shapes, Escape refusal then "Click to resume", font fallback by renaming the font file once. Results recorded in `docs/KIRO_LOG.md`; no performance claim without them.
      - `docs/KIRO_LOG.md` records what the spec, steering and property tests contributed in tasks 5.3.1 to 5.3.6.
      - `requirements.md` 2.1, 2.3 and 2.5 are rewritten for the new flow (book lifts off its base and approaches the player; three pages; book returns to its base). The decision on page 3 and `reducedVersion` below is recorded there once the user answers.
      - All tests pass; ask the user if questions arise.
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 8.1, 8.3, 9.1, 9.2, 9.3_

  - **Open items for the user (decide before 5.3.6)**
    - Requirements 2.1, 2.3 and 2.5 still describe the slab flow and four parts. 5.3.6 updates them once the user confirms the wording.
    - Decide whether page 3 also holds `reducedVersion` (Requirement 5.1 encourages it) or whether it stays editable only in the grimoire. `goal`, `epitaph` and `notes` also have no page; confirm they stay in the grimoire.

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
    { "id": 12, "tasks": ["6.2", "7.2"] },
    { "id": 13, "tasks": ["7.3", "8.1"] },
    { "id": 14, "tasks": ["9.2", "10.1"] },
    { "id": 15, "tasks": ["10.2", "10.3"] }
  ]
}
```

## Notes
- Run one top-level task per Kiro session and commit after each (for example "Task 2: domain core").
- Order of work: 1, 2 and 3 first (no graphics card needed), then 4 with the performance checkpoint before investing in visuals.
- Never run all tasks at once while credits are limited.
- Task 5.3 sub-tasks run strictly in order 5.3.1 to 5.3.6, one session and one commit each (for example "Task 5.3.1: pure book core"). 5.3.2 and 5.3.4 are independent of each other and can run in either order.
- Design properties 1-15 map to playbook P10-P24 (design property N is playbook P(N+9)).
- Keep docs/KIRO_LOG.md updated with what the spec, steering and tests contributed in each session.
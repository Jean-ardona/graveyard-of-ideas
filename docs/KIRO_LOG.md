# Kiro log

What the spec, steering and tests contributed in each session.

## Task 5.2: 3D book with embedded HTML pages

- **Spec:** requirements 2.3 (four parts: Ambition, Abandonment, Remains, Second chance) and 2.4 (edits saved automatically) set the scope. Task 5.3 (state machine, opening sequence) was left alone.
- **Steering:** `tech.md` drove the shared geometry and materials for all books (no per-book allocation), the night-blue palette (no amber on books) and the pure domain rule. `structure.md` placed the code in `src/book`.
- **Domain:** new pure `editProject` (`src/domain/edits.ts`) with the same length limits the import validation enforces, so an edit can never make the data unimportable.
- **Rendering:** each tomb holds a book made of four separate groups (cover, spine, page block, pages), registered by project id so the ember dissolve of task 7 can reach each part.
- **Pages:** the four parts are plain HTML fields; every change goes through the store and the existing autosave.
- **Tests:** `src/tests/book.test.ts` covers `editProject`, a property test that edited data stays exportable and importable, the store action and the book assets.
- **Open point:** the book stands behind the closed slab, so it shows only once the slab slides open (task 5.3). Until then the E prompt on a tomb opens the pages directly.

## Task 5.3.1: Pure book core and properties

- **Spec:** the design section "Book interaction (task 5.3)" gave the transition table, constants, invariants I1-I6 and the allocation rule, so the seven modules (`bookTimings`, `bookSequence`, `pageTurn`, `readingMachine`, `readingKeys`, `bookPageLayout`, `uiMode`) were written straight from it. Requirements 2, 8.3 and 9 fixed the scope: reversible open and close, skip to the final state, one cinematic at a time.
- **Steering:** `tech.md` and `structure.md` kept the core free of React, Three.js and timers, and the guard and mode mapping in `src/interaction`. `pointerEdge` is a new export in `pointerLock.ts`; lock behavior is unchanged.
- **Property tests:** design properties 1-15 (playbook P10-P24) are one fast-check test each, 200 runs, tagged `Feature: graveyard-core, Property N: <title>`. Event sequences include `dt = 0` and values above the clamp. No test found a bug in the first version of the code.
- **Example tests:** phase boundaries at 0.6, 1.4 and 2.2, a drag of exactly 50 percent completing a turn, no-ops at both ends of the book, every refusal of the OPEN guard, `pointerEdge` for each mode pair.
- **Purity test:** `bookPurity.test.ts` scans the source of the seven modules for React and Three.js imports, DOM globals and timers.
- **Decisions:** the machine is created by `createReadingMachine()` so tests get isolated instances; `readingMachine` is the app singleton. `subscribe` plus `version()` feed `useSyncExternalStore`. Leftover time at a phase boundary is not discarded except at the end points (`t = 2.2` and `t = 0`), which keeps frame-rate independence exact.
- **Not done here:** no driver, input hook, overlay, font or model change (tasks 5.3.2 to 5.3.6).

## 2026-11-15, Task 3: Store and persistence
Done: Zustand store with a versioned localStorage adapter, autosave and error handling (3.1), and a one-time seed of three demo projects (3.2).
Requirements covered: 7 (save, export and import), 7.5 (seed only once).
Steering and property tests: `tech.md` (rendering reads saved state and never owns it; pure domain layer kept free of React) and `structure.md` (store in `src/store`, domain never imports from it); the export/import property tests from task 2.4 back the persisted data format.
Open decisions: none

## Task 5.3.2: Book model rework and visibility look

- **Spec:** the design section "Visibility of the closed book" and requirements 2.3, 8.2 and 9.3 gave the look rules: pale blue-gray page edge, a small procedural cover-border texture used as `map` on the front board only, a low emissive rim instead of a light, no amber. The task text fixed the structure: hinged front board, three leaves on one geometry and one material, four separate parts, `root` and `leaves` on the handle.
- **Steering:** `tech.md` drove the shared geometry, materials and texture (created in `createBookAssets`, released in `dispose()`), no new lights or shadows, and a `DataTexture` built from raw pixels so no canvas is needed. `structure.md` kept everything in `src/book`.
- **Code:** new `bookLook.ts` (colors, texture, the two materials) and `bookModel.ts` (a plain function that builds the parts, so tests can inspect the built group). `Book.tsx` renders that model and registers the handle. The unused `bookPageBlock` and `bookPages` colors were removed from `world/config.ts`.
- **Tests:** `bookLook.test.ts` checks luminance (page edge at least twice the cover), blue not below red, hue outside 20 to 50 degrees for every color, and the texture pixels. `book.test.ts` checks four separate parts, shared geometry and materials, texture only on the front board, flush at angle 0, rotation about the spine axis, no light or shadow flag, handle lookup, and one dispose per geometry, material and texture. A first run of the axis test failed because it ignored the board thickness; the test was corrected, the code was right.
- **Results:** `npm test` 255 passed in 20 files; `npx tsc --noEmit` clean; `npm run build` clean (only the existing chunk-size warning).
- **Decisions to check:** the back board now belongs to the spine part (spine color, not cover color); the three leaves lie against the front board and the page block sits behind them; opening is a negative rotation about y (documented on `BookParts`); page block and leaves have separate materials with the same look. Colors are not yet tuned in the dark scene on the target machine.

## Task 5.3.3: Sequence driver, input lock and pointer rule

- **Spec:** the design section "Book interaction (task 5.3)" fixed the decisions: lock walking and look for the whole sequence, release the pointer on entering `open`, request it on leaving `open`, a refused request becomes `lost`, lock loss while opening dispatches CLOSE, reduced motion dispatches SKIP. Requirements 1.2.2, 2, 8.3 and 9 set the scope. The task text listed the files, so no other task was touched (no overlay, no drag, no fonts).
- **Steering:** `tech.md` drove the allocation rule (module-level vectors and quaternions, nothing created in `useFrame`) and "rendering reads state, never owns it": the driver only reads the machine's progress and writes transforms. `structure.md` kept the pure helpers (`inputLock.ts`) in `src/interaction` and the driver and key hook in `src/book`.
- **Code:** `BookSequenceDriver` ticks the machine, captures the base pose and the camera-space reading pose when OPEN is accepted, and writes lift, approach and cover (negative rotation about y) from the progress values, so reversing retraces the path. A machine listener handles discrete changes (start, skip, landing) and the pointer calls; the frame callback returns early in `closed` and in `open` with idle pages. `useReadingInput` routes keys through `routeReadingKey` in the capture phase, so the E that opens a book is not read as a close. `PlayerController` takes `inputLocked` (new pure `canWalk` and `isLooking`); the world no longer disables the player while reading, because disabling frees the pointer. `modeAfterLockFailure` maps a refusal while `released` to `lost`.
- **Tests:** `interaction.test.ts` covers open and close through `openBook` and `closeBook` (lock flag toggles with the machine, only the project id is kept, refused open, reduced motion) and the lock helpers. `player.test.ts` covers the refused request with a mocked `requestPointerLock` (rejection and throw). `bookDriver.test.ts` scans the driver source: no `new` and no `new Vector3(` inside the frame callback, preallocation at module level, early return for the idle cases. The existing 5.3.1 properties already cover the machine selectors and were not repeated.
- **Not verified without a GPU:** how the sequence looks and feels, the reading pose (distance, spine centering), the book passing through the closed slab, real Pointer Lock refusal after Escape, and frame rate.

## Fix session after 5.3.3: book on the tomb, slower sequence

- **Problem:** in the running app the closed book sat inside the dark cavity block (it looked like it came out of a block) and the opening was too fast.
- **Steering:** `tech.md` (shared geometry, no new lights or shadows, nothing allocated per frame) and `product.md` (the visible object on the tomb must be the book).
- **Code:** the cavity (`recess` geometry, `recessDark` material, `CAVITY`, `COLORS.tombRecess`) is gone, which also removes the thin dark bar that crossed the book (leftover recess edge, to be confirmed visually). A low stone `plinth` in front of the slab carries the book. The book now rests flat on it, cover up, scaled by `BOOK_REST_SCALE = 1.8` on the root only (geometry stays shared). `applyRestPose` sets that transform; `BookSequenceDriver` captures position, orientation and scale when OPEN is accepted and interpolates scale to 1, so closing lands exactly on the rest pose. The interaction prompt point is the middle of the book, and `tombCollider` takes a `frontReach` so the walking collider covers the plinth. The state machine, transitions and 5.3.1 properties were not touched.
- **Timings:** only the constants in `bookTimings.ts` changed: lift 1.0 s, approach 1.2 s, cover 1.2 s (total 3.4 s). `design.md` durations updated. The boundary example tests and the reading machine tests now derive their times from `LIFT_END`, `APPROACH_END`, `TOTAL_SECONDS`, `MAX_FRAME_DELTA` and `PAGE_TURN`.
- **Tests adjusted:** `tombs.test.ts` has no cavity assertions to change; it gained a collider test for the extended front. `book.test.ts` gained a rest-pose test (flat, on the surface, footprint scaled, geometry still shared). `bookSequence.test.ts` and `readingMachine.test.ts` no longer hard-code times.
- **Not verified without a GPU:** how the book looks on the plinth, that the black bar is gone, the feel of the slower sequence, and the book passing near the slab.

## Fix session after the rest-pose fix: open only from in front of the tomb

- **Problem:** the prompt "E - Open <name>" showed and the book opened while the player stood behind the tombstone, where the stone hides the book and the approach would pass through it.
- **Steering:** `tech.md` (pure logic without Three.js, nothing allocated per frame, no new lights or shadows) and `structure.md` (pure helper in `src/interaction`). `product.md`: the book must be reachable where it can be seen.
- **Facing found:** a tomb group is rotated by `rotation` about y and its plinth and book sit on local +z, so the tomb faces (sin rotation, cos rotation) on the ground. `Tomb.tsx` already placed the prompt point that way; the same vector is now registered as the facing.
- **Code:** new pure `src/interaction/tombFront.ts` with `isInFrontOfTomb(tombPosition, tombFacing, playerPosition, minDot)` and `FRONT_MIN_DOT = 0.35` (about 70 degrees). `Interactable` has an optional `tomb` field (position and unit facing, built once per tomb); `selectFocus` skips a tomb the player is behind, so the prompt disappears and another valid tomb is still chosen. `OpenGuardInput` has a new `playerInFront` boolean, one more refusal reason in `canOpenBook`; `openBook(projectId, playerInFront)` passes it, and the tomb's E handler computes it from `playerSession`. The state machine transitions and the timings are unchanged. An open or opening book is not closed when the player moves, because only the closed-state focus and the OPEN guard use the check.
- **Tests:** new `tombFront.test.ts` (front, 60 degrees, 90 degrees, behind, exact threshold, zero vector, height ignored) and a fast-check property, `Feature: graveyard-core, Property 16: Tomb front side` (a correction property; 15 was the highest number in use), 200 runs. `interaction.test.ts` gained two tomb selection tests; `readingMachine.test.ts` gained the guard refusal test and the new guard field in its generator.
- **Not verified without a GPU:** that the prompt vanishes when walking around a tomb in the real scene, that 70 degrees feels right near tomb corners, and that the book approach no longer crosses the stone.

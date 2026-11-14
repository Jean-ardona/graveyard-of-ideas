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

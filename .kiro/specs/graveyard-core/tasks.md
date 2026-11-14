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

- [ ] 3. Store and persistence
  - [x] 3.1 Zustand store, versioned localStorage adapter, autosave, error handling. _Requirements: 7_
  - [x] 3.2 Seed three demo projects once only. _Requirements: 7.5_

- [ ] 4. World
  - [x] 4.1 Night terrain, partial blue moon, mist, gate, paths, hut, dead trees, stones. _Requirements: 1.1_
  - [x] 4.2 Player controller (ZQSD/WASD/arrows), free-cursor look, optional Pointer Lock, bounds and collisions. _Requirements: 1.2, 1.3, 1.4_
  - [ ] 4.3 Interaction prompts. _Requirements: 1.5_
  - [ ] 4.4 Quality presets, default Low. Checkpoint: measure on the target machine. _Requirements: 8.1_

- [ ] 5. Tombs and book
  - [ ] 5.1 Tomb with slab and cavity, rendered from resting projects by slot. _Requirements: 2.1_
  - [ ] 5.2 3D book model with embedded HTML pages and four parts, autosaved edits. _Requirements: 2.3, 2.4_
  - [ ] 5.3 UI state machine; open/close sequences; reading mode; Escape handling. _Requirements: 2, 9_

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
    { "id": 7, "tasks": ["5.3", "7.1", "9.1"] },
    { "id": 8, "tasks": ["6.2", "7.2"] },
    { "id": 9, "tasks": ["7.3", "8.1"] },
    { "id": 10, "tasks": ["9.2", "10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3"] }
  ]
}
```

## Notes
- Run one top-level task per Kiro session and commit after each (for example "Task 2: domain core").
- Order of work: 1, 2 and 3 first (no graphics card needed), then 4 with the performance checkpoint before investing in visuals.
- Never run all tasks at once while credits are limited.
- Keep docs/KIRO_LOG.md updated with what the spec, steering and tests contributed in each session.
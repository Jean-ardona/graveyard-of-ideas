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

## Quality presets
Low: reduced pixel ratio, simple/baked shadows, few particles, no post-processing. Medium and High raise these gradually. Presets are plain data consumed by the world.

## Persistence
Zustand store with a localStorage adapter, versioned JSON, debounced autosave, error surface. Import validates the schema before replacing; export downloads a JSON file.

## Simple mode
A non-3D view of the grimoire exposing all create, read, edit, resurrect, honor, export and import functions. Used as a fallback and as a low-end path.

## Testing strategy
Unit tests for domain functions. Property-based tests (fast-check) for the invariants and for export/import round trips. Manual performance checks on the target low-end machine at each milestone.

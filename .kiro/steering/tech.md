---
inclusion: always
---
# Technical rules

## Stack
React + TypeScript (strict), Vite, Three.js via React Three Fiber, @react-three/drei, Zustand for state, browser localStorage (no server, no accounts), Vitest + fast-check for tests.

## Architecture rules
- Keep a pure domain layer (src/domain) with no React or Three.js imports: project model, status transitions, slot allocation, import/export validation. All business rules live there and are unit and property tested.
- Rendering and animation read the saved state; they never own it. A change is saved first, then the animation represents it.
- One finite state machine for UI modes: exploring, openingGrave, reading, closingGrave, burying, resurrecting, paused. Only one major cinematic at a time.
- Skipping or reloading mid-animation must show the correct final state without replaying the sequence.
- Clean up every temporary object (particles, specter, tomb collider) after use.

## Performance rules (target: weak integrated GPU, 8 GB RAM)
- Default quality is Low. Quality is persisted. Low means reduced pixel ratio, simple or baked shadows, few particles, no post-processing.
- Prefer simple procedural geometry, instancing and small textures. Dispose geometries, materials and textures.
- Never promise performance: measure on the target machine at each milestone.

## Assets and licenses
- Procedural geometry and textures first. External assets only if license and weight are verified and recorded in docs/ASSETS.md. No fragile remote URLs.
- Everything in the repo must be original or properly licensed (hackathon rule: submission must be solely owned, no third-party rights violated).

## Style
Small modules, descriptive names, no dead code, no console noise. Text strings in English.

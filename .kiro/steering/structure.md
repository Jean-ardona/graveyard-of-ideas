---
inclusion: always
---
# Project structure

```
src/
  domain/        pure logic: types, status transitions, slots, export/import, validation
  store/         Zustand store + persistence adapter (versioned JSON in localStorage)
  world/         3D scene: terrain, moon, fog, tombs, gate, hut, lighting, quality presets
  interaction/   player controller, camera modes, collisions, interaction prompts, UI state machine
  book/          3D book model + embedded HTML pages for reading and editing
  grimoire/      central grimoire UI (create, list, filter, manage resurrected/accomplished)
  cinematics/    burial and resurrection sequences, skip logic, cleanup
  ui/            menu, controls help, settings (quality, reduced motion), simple (non-3D) mode
  tests/         unit and property-based tests
docs/            KIRO_PLAYBOOK.md, ASSETS.md
.kiro/           steering, specs, hooks (never gitignored)
```

Rule: domain never imports from world, book, cinematics or ui.

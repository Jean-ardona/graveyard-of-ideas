# Polish backlog

Ideas considered and deliberately left out of the current scope. None of them blocks the hackathon submission.

## Product decision: burial ritual replaces the grimoire panel

**Decision.** The grimoire as a big book or list panel is dropped. A project is created by a guided quill ritual at the lectern (one field per page, quill-ink text; only title and description are required, and "Seal the tomb" saves as soon as both are filled). The project is saved first (`buryNewProject` through `commitBurial`), then a camera turn to the new tomb slot and the tomb's own book appearing with a cool pale glow represent the saved state. Spec: design.md "Burial ritual", sessions A (6.1b.1), B (6.1b.3), C (6.1b.5) and D (6.2.1, after task 7) of `graveyard-core`.

**Removed.** The grimoire panel, the project list by status (`GrimoirePanel`, `ProjectList`, `grimoireGroups`, the panel flag and session functions), the create form and the guide-to-tomb transition. Removal is part of Session C (6.1b.5). The lectern from 6.1a stays. `ProjectDetail.tsx` stays until the open item below is decided.

**Open item R1 (not decided): where resurrected and accomplished projects are shown.** With the list gone they have no place to be read or edited (Requirements 6.1 to 6.4). Idea: the tomb disappears and the book rests on the lectern or on a shelf in the hut, opened with E. Decide after task 7. Task 8.1 is blocked on this decision, and the menu "grimoire" entry (Requirement 8.3) depends on it too.

**Left for later.**
- Requirements wording (R2): 3.1, 3.3, 3.4, 4.1, 4.2 and 9.2 still describe the old grimoire, the list, the guide-to-tomb and "save before any animation".
- Tomb slab (R3, closed): the tomb keeps its slab and the book rests on it. The burial never opens it.
- Audio for the ritual: only a cue name is queued; the sound comes with 11.5.

## Cinematic rework (scheduled: task 13 of `graveyard-core`)

**Decision.** The flat outline-image specter is replaced by one `THREE.Points` of near-black particles with a pale-blue rim (400 on Low, 800 on High). The camera follows the specter and returns to the player. The burial camera dollies to about 3 m in front of the new tomb. The reveal glow is pale blue-white. Ritual pages and the resurrection dialog use a page summon animation with motes. Spec: design.md "Specter as particles", "Camera paths", "Burial camera", "Page summon animation" (Properties 81 to 95); tasks 13.1 to 13.9. This reworks the specter part of 7.2 and the camera turn of 6.2.1 without unchecking them.

**Left for later (not scheduled).**
- The burial dolly crosses the hut walls (the ritual starts inside the hut). Fix only if it looks wrong on the target machine: a short cut or fade at the wall.
- The page summon loop writes two short style strings per frame. If measurement shows a problem, switch to Web Animations keyframes sampled from the pure pose.
- Dolly speed grows with the distance to the slot (fixed `DOLLY_IN`). Raise `DOLLY_IN` if the farthest slot feels too fast.
- Resurrection camera only rotates; a travelling follow is not planned.
- Smoke is the gathering and shed particles; no separate smoke puffs.
- If a warm tint remains on the reveal glow after the `revealGlow` token, check the lantern sprite and the book's base color.

## Real-book leaf faces

**What.** The book would behave like a printed one: text on both faces of every leaf (front of leaf `j` is page `2j + 1`, back is page `2j + 2`), two pages visible per spread, and editable fields on the left page as well as the right one.

**Why it is not in scope.** It changes the page model, not only the rendering:
- `pageTurn.ts` indexes one page per position (`index` 0 to `END_INDEX`); a spread model needs two visible pages per position and a different mapping from index to leaves.
- Invariants I1 to I6 and the properties that range over page positions (playbook P18 to P22 and P32 to P50) would have to be restated.
- The overlay would need a second editable layer over the left page, with its own projected rectangle, and `bookPageLayout` would need left-page content.
- Closing gestures from the left zone currently mean "previous" or "close"; with editable left pages the drag zones need rethinking.

**Current decision.** Text is drawn on the front face of each leaf only. Back faces and the end position stay blank paper. The page model, the overlay and I1 to I6 are unchanged.

**If revisited.** Do it as its own spec change (design first, then a new page-model task), after the checkpoint task 5.3.9 and the hackathon demo.

## Book design pass (after task 7)

**Status: partly scheduled in the spec.** Task 12 of `graveyard-core` (design section F) runs after task 7: 12.1 is the pure, tested `sigilFor(projectId)` function and 12.2 paints the per-project sigil on the cover through one shared atlas texture. The items below stay in this backlog unless marked scheduled.

| Item | Status |
|---|---|
| Cover motif: sigil generated per project from its id | Scheduled (tasks 12.1 and 12.2). The shared motif is the fallback when more than 16 books exist or the measurement is too slow. |
| Cover: aged leather texture, worn edges, metal corner ornaments | Not scheduled |
| Title on the cover in `BOOK_FONT_STACK` | Not scheduled |
| Spine: relief bands and emblem | Not scheduled |
| Fore-edge: clasp or strap | Not scheduled |
| Ribbon bookmark | Not scheduled |
| Inside: aged parchment with stains and darker edges | Not scheduled |
| Runes: very faint cool emissive (the sigil strokes use a low cool emissive already) | Not scheduled beyond the sigil |

**What.** Dress the book so it looks aged and handmade, without changing its structure:
- Cover: aged leather texture with worn edges and metal corner ornaments.
- Cover motif: a central sigil or pale rune engraved on the cover. Candidate: generated per project from its id, so every book is recognizable. Fallback: one shared motif.
- Title: the project title on the cover, in the book font (`BOOK_FONT_STACK`).
- Spine: relief bands and an emblem.
- Fore-edge: a clasp or strap.
- Ribbon bookmark.
- Inside: aged parchment with stains and darker edges.
- Runes: a very faint cool emissive, so they read at night.

**Constraints.**
- Textures are drawn on a canvas, 256 to 512 px, and shared across all books. A per-project motif or title must not create a texture per book beyond what the budget allows; measure on the target machine before deciding.
- No normal maps. Relief is faked with painted shading and, if needed, a few extra vertices.
- No new lights. The rune glow uses `emissive` only.
- No amber anywhere on the book (amber is reserved for the resurrection embers). Emissive tint stays cool blue-gray.
- The four parts (`cover`, `spine`, `pageBlock`, `pages`) stay separate meshes, reachable through the book handle. New details (corner ornaments, clasp, ribbon) live inside the existing parts and follow the four-part contract in design.md.
- Textures and materials are created in `createBookAssets` and released in `dispose()`.
- Everything is procedural and original, so nothing needs a license entry in `docs/ASSETS.md`.

**When.** After task 7 (resurrection), so the book structure and the ember dissolve of task 7.2 are frozen before dressing it. Adding meshes or materials earlier would force rework of the dissolve.

**Check.** Frame rate on the target machine at Low quality before and after, and a look at night at the reading pose and at rest on the tomb.

## Still unscheduled

- Real-book leaf faces (text on both faces, two pages per spread, editable left page). Needs a page-model change.
- Book design pass, except the per-project sigil: leather cover with worn edges and corner ornaments, title on the cover, spine relief and emblem, clasp or strap, ribbon bookmark, aged parchment inside, extra rune glow.
- A CC0 skull model instead of the procedural one (only if it is under 500 triangles and logged in `docs/ASSETS.md`).
- A Fresnel shader patch for the book rim, only if the emissive rim looks flat.

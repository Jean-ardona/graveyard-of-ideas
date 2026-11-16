# Polish backlog

Ideas considered and deliberately left out of the current scope. None of them blocks the hackathon submission.

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

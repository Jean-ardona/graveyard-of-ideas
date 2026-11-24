# Kiro playbook (how to use this pack)

## 0. First steps
1. Create a public GitHub repo, copy this folder in, set your name in LICENSE (MIT), commit. Keep `.kiro/` committed.
2. Open the folder in Kiro. Check that it detects the steering files and the spec "graveyard-core". If a file format is not recognized in your Kiro version, recreate the file through Kiro's own steering/spec panels and paste the content.
3. In Kiro, run the spec tasks one at a time, starting at task 1. Let Kiro write code; use your own time for review, testing on your machine, and art direction.

## 1. Spending credits wisely
The planning is already written here, so credits go to implementation. Run one task per session, keep prompts short ("Implement task 2.1 from the spec"), and avoid asking Kiro to regenerate whole files.

## 2. Property-based tests to ask Kiro for (task 2.4)
- P1 Resurrect never duplicates: after resurrect, the project count is unchanged and ids stay unique.
- P2 Slot uniqueness: no two resting projects share a slot, ever, after any sequence of bury / resurrect / restAgain.
- P3 Slot ownership: only resting projects have a slot; resurrected and accomplished never do.
- P4 Export/import round trip: import(export(data)) equals data.
- P5 Import validation: malformed or hostile JSON is rejected and never replaces existing data.
- P6 Seed once: seeding never runs after the user has emptied the collection.
- P7 Resurrect requires a next action: resurrect without one always fails and leaves data unchanged.
- P8 History is append-only: history length never decreases, deletion aside.
- P9 State machine guard: no second major cinematic can start while one is running.

### Book interaction properties (task 5.3, details in the design)
- P10 Sequence consistency: t and progress stay in range, phase matches t, closed and open are fixed points.
- P11 Opening completes: enough ticks after OPEN always end in open, t never decreases.
- P12 Reversal retraces: CLOSE keeps t, then t only decreases to closed; pose depends on t only.
- P13 Open/close round trip returns to the initial state and page 0.
- P14 One sequence at a time: OPEN only from closed, never restarts a running sequence.
- P15 Pointer and input invariants: pointerLockReleased is true exactly in open (including page turning); inputLocked is true exactly when not closed.
- P16 Skip fixed points: SKIP ends in open when opening, in closed when closing.
- P17 Frame-rate independence: splitting the same duration into different dt values gives the same result.
- P18 Page model invariants: index, progress and leaf angles in range; idle means progress 0; turned leaves form a prefix.
- P19 50 percent rule: release at or above 50% completes the turn, below returns; cancel never changes the page.
- P20 Keyboard turning equals a completed drag; next then prev returns to the same page; ends are no-ops.
- P21 Closing waits for pages: CLOSE during a turn leaves open only when the page model is idle.
- P22 Rendered leaf angle follows the cover (0 when the cover is closed).
- P23 Page layout shows the required content per page (title and date; reason and idea; next action and reduced version; never goal, epitaph or notes); the resurrection button is disabled without a handler.
- P24 Key routing: Escape closes, E closes only outside text fields, arrows turn pages only outside text fields.

### Curved page turn (task 5.3.6, design properties 16-22; design property N is playbook P(N+9))
- P25 The leaf is flat at the ends: progress 0 gives every segment angle 0, progress 1 gives pi, and the strip lies on the flat leaf.
- P26 Arc length is constant: every segment has length width / segments, the strip starts at the hinge, the total equals the leaf width.
- P27 Angles are finite and inputs are clamped: NaN, infinities and out-of-range progress give the result of the clamped value; angles in [0, pi]; positions and normals finite.
- P28 Curvature is symmetric around the middle of the turn: same at progress and 1 - progress, never positive, largest at 0.5.
- P29 The spine angle opens monotonically: segment 0 equals pi * progress, the rigid leaf angle.
- P30 The shape depends on the progress alone: forward, back and forward again write bit-identical angles, positions and normals.
- P31 Only the turning leaf is deformed: `turningLeafIndex` is null at rest and otherwise the one leaf strictly between 0 and pi; no curl with the cover below 1 or with reduced motion.

### Two drag zones and closing gestures (fix after 5.3.6; test tags use design numbers 28-32, so playbook P(N+4))
- P32 The wrong direction does nothing: dragging right from the right page or left from the left page leaves the whole page state equal to its starting state, with no progress and no direction (no jitter).
- P33 Next then previous returns to the same page: a completed drag from the right zone followed by a completed drag from the left zone ends idle on the starting page.
- P34 A closing gesture needs half the distance: from the left zone on page 0 or the right zone in the end position, a release at or above 50% requests close and below it does not; no leaf moves; cancel never requests it.
- P35 No leaf is both turned and unturned: for any sequence of drags from both sides, keys and ticks, leaf angles are non-increasing, at most one leaf lies strictly between 0 and pi, and idle means every leaf is exactly 0 or pi.
- P36 Curl strength scales the bend: strength 0 is rigid, 1 is the full tip lag, a stronger curl never bends less; flat ends, constant arc length, finite angles and symmetry hold at any strength.

### Cover scrub on the closing gesture (fix after the two-zone drag fix; test tags use design numbers 33-36, so playbook P(N+4))
- P37 The cover angle is monotonic in the drag progress: a longer closing drag never opens the cover more; the angle is `COVER_OPEN_ANGLE * (1 - progress)`.
- P38 Release below 50% returns exactly to the open state: after release or cancel, the book is `open` at `t = TOTAL`, cover progress 1, the page model equals a fresh one and the cover angle is exactly `COVER_OPEN_ANGLE`.
- P39 Release above 50% reaches closed without a jump: the closing starts at the scrubbed cover value, the cover never reopens, and the book ends `closed` on page 0.
- P40 The cover angle never leaves the open-to-closed range: for any progress (NaN, infinities, zero, out of range), any status and reduced motion, the open fraction is in [0, 1] and the angle in [0, `COVER_OPEN_ANGLE`].
### Back closing from the end position (fix after the cover scrub; test tags use design numbers 37-41, so playbook P(N+4)); updated by the end-position fix: the back-close gesture now starts in the end position (index `END_INDEX = PAGE_COUNT`), not on the last page
- P41 The back board angle is monotonic in the drag progress and stays in range: a longer drag from the right zone in the end position never lowers it; for any input (NaN, infinities, out of range, any side, index or reduced motion) it is in [0, pi].
- P42 Release below 50% returns exactly to the end-position open state: after release or cancel, the book is `open` at `t = TOTAL`, side `front`, swing 0, cover 1, the page model equals a fresh one in the end position.
- P43 Release above 50% reaches closed with the back up and then the rest pose face up: the swing at release equals the dragged one, it reaches pi, then the book ends `closed`, all progress values 0, side `front`, page 0.
- P44 The flip is one continuous rotation of exactly 180 degrees: from back up, the swing never increases, each step is bounded, the total is pi, it only turns while the book is at full lift, and it lasts `BACK_FLIP.seconds`.
- P45 Both covers closed never coexists with a turning leaf: for random sequences of open, skip, close, tick, keys and drags, a closed front cover with the back closed or the book closed has no turning leaf; a back close only happens in the end position.

### End position after the last page (test tags use design numbers 42-46, so playbook P(N+4))
- P46 Next from the last page reaches the end position and next from the end is a no-op: by key or by a drag past 50%, the page model equals a fresh one at `END_INDEX` with every leaf turned; a key does nothing there and a drag from the right zone is a closing gesture, not a turn.
- P47 Previous from the end position returns to the last page: by key or by a drag from the left zone, leaves 0 and 1 stay turned and the last leaf is unturned; next then returns to the end position.
- P48 The back board is never closed while a leaf is unturned: for random sequences of open, skip, close, keys, drags and ticks, whenever the swing is pi, the dragged back board is at pi, or a back closing is running, every leaf angle is pi.
- P49 Close from the last page ends closed with all leaves turned first and the book face up on its base: the book stays open until the automatic turn has landed, closes from the open pose with no jump (t = TOTAL, cover 1, swing 0), all leaves are turned during the whole closing, and it ends `closed` with all progress 0, side `front` and a fresh page model.
- P50 Close from the end position equals the back close: a close from the end follows exactly the same sequence (phase, `t`, swing, cover) as the pure back close started from the open pose.
- P51 Each page goes on its own leaf face (design property 23): the front ops of leaf j hold exactly the text of page j from `layoutPages` (title, date, labels, saved values, button label, caption), every back is empty, the end position has no face, no goal, epitaph or notes text appears, and no op leaves the page rectangle.
- P52 Wrapped lines fit the page (design property 24): with any positive width per character, every line is no wider than the width unless it is a single character, the lines keep every non-whitespace character in order, the line count never exceeds the limit, and an ellipsis appears only when text was clipped.
- P53 The face key tracks the drawn text (design property 25): the key of a leaf is equal exactly when its ops are equal, the same project gives the same key, and changing one drawn text changes the key of its own leaf and no other.
- P54 The texture size fits the limit and keeps the aspect (design property 26): integers of at least 1, never above the limit, each side within one texel of the exact scaled size; the page face gives 512 x 686 with the default limit 512 x 768.
- P55 The cross-fade never uncovers the page (design property 27): after every step the texture is visible or the overlay is opaque, the overlay is opaque only for an open book at rest, a turn start or leaving `open` shows the texture and hides the overlay in the same step, the texture goes only after the opacity report, and reduced motion has duration 0 with no blank frame.
### Haunted experience layer (Costume Contest; design properties 47-67, so playbook P(N+9); tasks 11.1 to 11.10 and 12.1)
Run order: tasks 11.1 (P58), 11.2 (P56, P57) and 11.3 (P63, P65, P75) are the foundation and run BEFORE 6.1a (the grimoire), in that order. Tasks 11.4 to 11.10 (P59-P62, P64, P66-P74) run after resurrection (tasks 7 and 8) and the menu (9.1), in numeric order. Task 12.1 (P76) stays after task 7. Task numbers did not change, so the references below are still valid.
- P56 Contrast is symmetric and bounded (design 47, task 11.2): `contrastRatio(a, b)` equals `contrastRatio(b, a)`, lies in [1, 21], and is exactly 1 for a color against itself.
- P57 Theme variables round trip (design 48, task 11.2): `parseCssVars(tokensToCssVars(map))` equals the map.
- P58 The keeper's voice never guilts (design 49, task 11.1): every copy function keeps the name unchanged, and the rest of the string matches no banned pattern and has no exclamation mark.
- P59 Subtitles follow the script (design 50, task 11.4): null only in gaps; the visible text is a word-aligned prefix; the revealed word count never decreases; line starts strictly increase.
- P60 The entrance always reaches the correct final state (design 51, task 11.4): valid phases, `t` in range, only `playing` advances, skip and natural end give the same outcome, reduced motion never plays.
- P61 The seen flag is set at ENTER and never cleared (design 52, task 11.4): replay never clears it; a seen start is `done`; ENTER unlocks audio.
- P62 Entrance visuals are bounded (design 53, task 11.4): finite values, densities and alpha in [0, 1], deterministic, whisper gain 0 outside word windows, a smaller motion scale never moves faster.
- P63 Comfort flags only remove effects (design 54, task 11.3): calm mode or reduced animations turns off flashes, shakes and fast mist; `motionScale` is 1 only when both are off.
- P64 The audio mix is silent until unlocked and respects mute and comfort (design 55, task 11.5): gains in [0, 1], master 0 when locked or muted, no thunder without flashes, wind gain non-decreasing in the strength.
- P65 Preferences migrate and round trip (design 56, task 11.3): `calmMode` and `muted` false, `introSeen` equal to the old `seeded`, export then import returns equal data.
- P66 Wind is bounded and continuous (design 57, task 11.6): unit direction, strength in [0, 1], changes proportional to the time step.
- P67 Leaves stay in the graveyard (design 58, task 11.6): positions finite and inside the bounds, count constant, zero `dt` changes nothing.
- P68 Spectre paths are continuous, bounded and harmless (design 59, task 11.7): speed limit, opacity cap 0.35, opacity 0 below the near distance, non-decreasing in the distance.
- P69 Lightning respects the flash limits (design 60, task 11.8): minimum interval, at most one flash per second, multiplier in [1, 1.6] and exactly 1 outside a flash, nothing starts when not allowed.
- P70 Thunder follows the flash by the distance delay (design 61, task 11.8): delay `min(distance / 343, 12)`, never before the flash, gain in [0.05, 0.6] and non-increasing.
- P71 Skull placements avoid obstacles (design 62, task 11.9): exact count, inside the bounds, outside every obstacle, minimum spacing, deterministic.
- P72 Scare moments happen only where allowed (design 63, task 11.10): zero offset unless exploring, book closed, no sequence and shakes enabled; starts only while walking.
- P73 The shake is bounded and smooth (design 64, task 11.10): envelope in [0, 1], zero at both ends, offset under the peak, look state unchanged.
- P74 Scare cooldown and duration (design 65, task 11.10): 2 to 3 s, one at a time, cooldown respected, deterministic by seed.
- P75 The atmosphere budget fits the limits (design 66, task 11.3): leaves 30 to 60, spectres 3 to 5, no count decreases with quality, Low is the smallest.
- P76 The sigil is deterministic, bounded and symmetric (design 67, task 12.1): same id gives the same spec, 6 to 14 strokes, fold 3 to 8, points inside the unit disc, rotational symmetry.
### Burial ritual (design properties 68-76, so playbook P(N+9); task 6.1b.1 writes P77, P78, P79, P80, P81 and P85; P82 comes with session C and is extended by session D, which also writes P83 and P84)
- P77 The step machine keeps a valid step and only skips optional steps (design 68, task 6.1b.1): `0 <= step < 7` after every event; a required step is never passed with invalid text or skipped; optional steps can be skipped; SEAL is accepted exactly when `canSeal(draft)`; `cinematic` is entered only from a valid last step or an accepted SEAL.
- P78 Forward then back restores the step and the draft (design 69, task 6.1b.1): advancing k valid steps and going back k steps returns to the same step with the same draft values.
- P79 The draft never reaches the store before the commit, and cancel before it restores the previous state (design 70, task 6.1b.1): a projects array held by reference is unchanged and the machine module has no store import; CANCEL in `writing` gives `idle` with an empty draft and a new START begins at step 0 with an empty draft.
- P80 Step validation agrees with the domain, and sealing equals skipping through (design 71, task 6.1b.1): a draft whose steps all validate is accepted by `buryNewProject` when a slot is free; SEAL gives the same input as SKIP_STEP through the remaining optional steps; link text passes only if every non-blank line is a safe http or https link and the count is within the limit.
- P81 The previewed slot is free and is the allocated slot (design 72, task 6.1b.1): `allocateSlot` is null exactly when every slot is used by a resting project, otherwise it is unused and equals the slot `buryNewProject` allocates.
- P82 The commit is single, atomic and precedes the cinematic (design 73, task 6.1b.5, extended by task 6.2.1): over any sequence of events, `commitBurial` runs at most once per ritual; after a success the list is the initial list plus exactly one complete resting project with a unique free slot; after a failure the list is reference-identical to the initial one. Task 6.2.1 adds that no timeline tick runs before COMMIT_OK, for any mix of ticks, commit requests and `dt` (zero, NaN, above the clamp); the driver creates its run only on COMMIT_OK, so before it there is nothing to tick (`burialDriver.test.tsx`).
- P83 Any skip or reload point ends in the final state, and the reveal-pending flag is UI-only (design 74, task 6.2.1): for any tick history and any skip (Escape, Enter, Space or a lost lock), the result is one resting project at its committed slot, the camera facing it, glow sprite removed, flag cleared, ritual idle and input free; the flag is cleared by skip, DONE and unmount; a fresh start after a reload has no flag; the persisted payload with the flag set equals the payload with it cleared; a store snapshot at any tick is the initial list before the commit and the initial list plus one complete project after it (`burialDriver.test.tsx`, `revealPending.test.ts`).
- P84 The timeline is bounded, frame-rate independent, in place, and instant with reduced motion (design 75, task 6.2.1): every progress value (turn, appear, glow, settle) stays in [0, 1] for any `dt` (negative, NaN, infinite, above the clamp), the same total time split differently below the clamp gives the same progress, the timeline, progress and effects records keep their identity, skip lands on the final state for any time, and with reduced motion or calm mode one tick reaches the final state (`burialTimeline.test.ts`).
- P85 Locks and the one-cinematic guard (design 76, task 6.1b.1): `inputLocked` is true exactly when the phase is not `idle`, the pointer is released exactly while `writing`, START is accepted only from mode `exploring`, and a book OPEN is refused while the ritual phase is not `idle`.

### Resurrection sequence (design properties 77-80, so playbook P(N+9); task 7.2)
- P86 The embers finish and the book is gone before any specter step begins (design 77, task 7.2): over any `dt` sequence (zero, NaN, negative, above the clamp), no smoke, form, rise, fly or fade progress is above 0 until the embers step is complete, all four parts (cover, spine, pageBlock, pages) are at 1 and `bookGone` is set; each step starts only when the previous one is at 1; `done` only after the last step.
- P87 The resurrection timeline is bounded, frame-rate independent, in place and instant with reduced motion (design 78, task 7.2): every progress value in [0, 1], position never decreases, the same total time split differently below the clamp gives the same step and time, the state, progress and effects records keep their identity, and one instant tick equals the final-state function (also the hook for task 7.3: a skip at any moment equals the final-state function and cleans up like a natural end; Escape, Enter, Space or a lost lock skip; a reload mid-sequence starts with no held tomb and no replay, because `resurrect` flushes the save synchronously and the held list is never persisted).
- P88 Embers are amber and bounded, and the specter is harmless (design 79, task 7.2): every ember color has red >= green >= blue and the three ember tokens are in the amber hue range; smoke opacity and specter opacity stay in [0, 1] and are 0 before the book is gone and after the end; the specter moves away from the tomb along a fixed heading, never back toward it, within a bounded distance; counts grow with quality and Low is the smallest.
- P89 Save first, one resurrection at a time, the tomb is released at the end (design 80, task 7.2): whenever the sequence may run the project is already saved as Resurrected (once, no duplicate, slot cleared); a start is accepted only from the open book, alone, for a resting project with a next action, and a refusal leaves the store untouched; at most one tomb is held; ending the sequence releases it, so the tomb, its collider and its book handle are removed (example test `tombRetiring.test.tsx`).

Page-count semantics changed with the end position: `index` runs from 0 to `END_INDEX` (3) while `PAGE_COUNT` stays 3, so P9, P10, P11 and P28 to P35 now range over every position (0 to 3), and "next" is possible from the last page. The old rule "the last page closes from the right zone" moved to the end position.

## 3. Hooks worth creating in Kiro
- On save of files in src/domain: run the domain test suite.
- On creating a new file in src/world or src/cinematics: remind to dispose geometries/materials and add cleanup.
- Before commit: check that .gitignore does not exclude .kiro, and that LICENSE exists.

## 4. Write-up outline (Kiro usage section)
- Which Kiro apps you used and how they differed.
- Spec-driven development: how requirements (EARS) became design and tasks, and how this compared to vibe coding.
- Steering: which files (product, tech, structure, hackathon) made the biggest difference.
- Hooks: the workflows automated above and their effect.
- Property-based testing: which invariants (P1-P9), and any bug it caught.
- Honest limits: what you did not use.

### How the spookiness serves function (write-up outline)
Judges ask whether the haunted theme enhances the function. One line per element, each with the concrete feature it maps to:
- The closed book means the idea is resting. It stays on its tomb and nothing asks for it.
- The next action is the key to resurrection. The book only wakes with one realistic next action (requirement 5.1), and the entrance teaches this.
- The lantern (the hut with the lectern, the central grimoire) is where you manage projects: create, list, rest again, honor.
- The embers are for resurrection only. Amber appears nowhere else (tokens, book, effects), so the color itself says "this idea is waking".
- The entrance voice is onboarding. The unseen guide is a whisper with synchronized subtitles that teach walking, opening a book with E and the next action; it is shown once, skippable and replayable.
- Supporting points: the sigil identifies each book at a glance; wind and sound tell where you are; scares never block work (no flash or shake while a book is open, calm mode and reduced animations turn them off); the copy never guilts.
- Evidence to cite: P56-P76 (contrast, copy tone, entrance, comfort, scare limits), the copy coverage test, the amber scan and the Low-quality measurements in `docs/KIRO_LOG.md`.

## 5. Differentiation to state clearly (existing graveyard apps exist)
Existing projects mostly generate a graveyard from a GitHub profile. This one is personal and local, first-person and physical (the book leaves its tomb), and resurrection requires a realistic first step.

## 6. Risks to watch
Performance on weak GPUs (test early, Low by default); scope (sound last); video quality (the full loop must fit under 3 minutes); disclose any pre-existing prototype work.

## 7. Submission checklist
Public repo + license visible; /.kiro committed; working URL or test build; text description; video under 3 min on YouTube; write-up; category = Costume Contest; all text in English; deadline December 4, 2026, 2:00 pm PT.

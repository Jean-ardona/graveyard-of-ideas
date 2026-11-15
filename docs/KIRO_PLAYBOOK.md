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
- P34 A closing gesture needs half the distance: from the left zone on page 0 or the right zone on the last page, a release at or above 50% requests close and below it does not; no leaf moves; cancel never requests it.
- P35 No leaf is both turned and unturned: for any sequence of drags from both sides, keys and ticks, leaf angles are non-increasing, at most one leaf lies strictly between 0 and pi, and idle means every leaf is exactly 0 or pi.
- P36 Curl strength scales the bend: strength 0 is rigid, 1 is the full tip lag, a stronger curl never bends less; flat ends, constant arc length, finite angles and symmetry hold at any strength.

### Cover scrub on the closing gesture (fix after the two-zone drag fix; test tags use design numbers 33-36, so playbook P(N+4))
- P37 The cover angle is monotonic in the drag progress: a longer closing drag never opens the cover more; the angle is `COVER_OPEN_ANGLE * (1 - progress)`.
- P38 Release below 50% returns exactly to the open state: after release or cancel, the book is `open` at `t = TOTAL`, cover progress 1, the page model equals a fresh one and the cover angle is exactly `COVER_OPEN_ANGLE`.
- P39 Release above 50% reaches closed without a jump: the closing starts at the scrubbed cover value, the cover never reopens, and the book ends `closed` on page 0.
- P40 The cover angle never leaves the open-to-closed range: for any progress (NaN, infinities, zero, out of range), any status and reduced motion, the open fraction is in [0, 1] and the angle in [0, `COVER_OPEN_ANGLE`].

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

## 5. Differentiation to state clearly (existing graveyard apps exist)
Existing projects mostly generate a graveyard from a GitHub profile. This one is personal and local, first-person and physical (the book leaves its tomb), and resurrection requires a realistic first step.

## 6. Risks to watch
Performance on weak GPUs (test early, Low by default); scope (sound last); video quality (the full loop must fit under 3 minutes); disclose any pre-existing prototype work.

## 7. Submission checklist
Public repo + license visible; /.kiro committed; working URL or test build; text description; video under 3 min on YouTube; write-up; category = Costume Contest; all text in English; deadline December 4, 2026, 2:00 pm PT.

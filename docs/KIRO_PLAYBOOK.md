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

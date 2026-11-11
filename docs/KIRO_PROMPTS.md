# Kiro prompt pack — Graveyard of Ideas (v2)

> Rôle de ce fichier : c'est le **seul** endroit où vivent les prompts à coller dans Kiro. Je ne code pas : je
> prépare les prompts, les garde-fous et l'audit de conformité. Les prompts sont en **anglais** — le livrable doit
> être en anglais (règle Devpost « Language Requirements ») et Kiro suit mieux ses steering quand la langue du
> prompt = langue du repo.
>
> Contraintes prises en compte dans cette v2 : **Kiro IDE** comme surface principale, **GPU intégré modeste**
> comme machine cible, **bonus Kiro Crew planifié**, pas de bonus « Ghost of Kiroween Past ».

---

## 0. Comment utiliser ce pack

**On travaille tâche par tâche dans l'ordre de `.kiro/specs/graveyard-core/tasks.md`, une tâche = un prompt = une
session Kiro = un commit.** Ce fichier est un distributeur, pas un script à dérouler : les blocs `P0.x`, `P11`,
`P12-P16`, `C1-C3` sont à coller au moment indiqué dans la table ci-dessous, et jamais avant.

| Où on en est | Ce qu'on fait dans Kiro | Bloc de référence |
|---|---|---|
| **Tâche 0** | adoption de la spec dans le panneau + `docs/KIRO_LOG.md` | P0.1 |
| 1.1 | scaffold Vite + React + R3F (versions vérifiées) | ci-dessous §« 1.1 » |
| 1.2 | structure de dossiers, licence, `scripts/kiro-check.mjs` | P0.3 |
| 1.2 bis | filets de sécurité : budget de perf, hooks, agents custom | P0.4, P0.5, P0.6 |
| 1.3 | scène nocturne minimale + readout FPS | P1 addition |
| 2.1 – 2.3 | domaine pur | P2 |
| 2.4 | tests unitaires + PBT (dont génération Kiro) | P2 + P2bis |
| 3.x | store + persistance | P3 |
| 4.1 – 4.3 | monde, contrôleur, prompts d'interaction | P4 |
| 4.4 | **checkpoint perf, go/no-go** | **P11** |
| après 4.x | smoke test + captures via Playwright MCP | P0.7 |
| 5.x | tombes + livre + machine à états | P5 |
| 6.x | grimoire + inhumation | P6 |
| 7.x | résurrection | P7 |
| 8.x | après résurrection | P8 |
| 9.x | confort + mode simple | P9 |
| 10.1 | polish visuel | prompt « pauvre visuellement » |
| 10.2 | README, write-up, vidéo, blog, audit | P12 → P16 |
| 10.3 | son procédural | — |
| hors sprint | repo Crew séparé | C1 → C3 |

**Boucle de travail avec l'agent Arena :** tu colles le prompt → tu me rapportes la fin de réponse de Kiro (ou le
diff, ou la sortie d'erreur) → je vérifie contre la requirement concernée → je te donne soit le prompt de
correction, soit la tâche suivante. Ne saute pas le rapport : c'est là que les dérives se voient, pas dans le code.

**Permissions locales (confort, pas un livrable)** : le plus simple est de cliquer **Always allow** sur la popup
d'approbation la première fois que chaque commande apparaît. Si tu préfères le déclarer, le fichier est
`~/.kiro/settings/permissions.yaml` (portée utilisateur, donc **hors repo et invisible des juges**) :

```yaml
rules:
  - capability: shell
    match: ["npm *", "npx *", "node *", "git *", "ls *", "cat *"]
    effect: allow
  - capability: shell
    match: ["rm -rf *", "sudo *", "curl *", "git push --force *", "git reset --hard *"]
    effect: deny
  - capability: fs_read
    effect: allow
  - capability: fs_write
    match: [".git/**", "*.env"]
    effect: deny
```

`deny` gagne toujours sur `allow`, indépendamment de la portée. Les `match` sont des préfixes : une commande chaînée
(`npm i && npm run build`) ne s'auto-exécute que si chaque segment est couvert. Ne touche pas au sandbox local
(`sandbox_network`) : ses règles d'hôtes peuvent bloquer `registry.npmjs.org`. Le fichier de portée workspace vit sous
`~/.kiro/workspace-roots/<hash>/permissions.yaml` — jamais dans le repo, raison pour laquelle la politique qui compte
est celle des agents custom (P0.6).

**Règles d'hygiène de prompt (elles protègent tes 4 000 crédits) :**

1. **Une session Kiro = une tâche.** Chat neuf à chaque tâche. Un chat long = contexte dilué = fichiers régénérés en entier.
2. Prompt court + référence au spec : « Implement task 4.2 from the spec. » — le détail est déjà écrit dans `.kiro/specs/`.
3. Jamais « refactor the whole folder ». Toujours le plus petit diff possible.
4. Boucle de vérification = `npm run check`, pas mon avis de humain.
5. `/compact` ou chat neuf dès que la session dépasse ~3 échanges de code.
6. Modèle économique pour le boilerplate/CSS/README ; modèle fort pour le design, les cinématiques et le debug.
7. Après chaque tâche : `git commit -m "Task N: <what>"`. L'historique de commits est ta preuve « built during the Submission Period ».

**Décisions d'architecture verrouillées par ce pack** (le « pourquoi » est dans §9) :

| Sujet | Décision |
|---|---|
| Catégorie | Costume Contest |
| Bouche/livre | objet 3D **avec overlay DOM** pour lire et éditer — pas d'`<input>` dans du HTML 3D |
| Backend | aucun : localStorage + export/import JSON |
| Perf | budget de frames **dur**, Low par défaut, tout procédural, **zéro post-processing** |
| Déployé | Netlify ou Vercel auto-déployé depuis le repo public |
| Audio | WebAudio procédural (vent + drone), **tout dernier**, avec mute |
| Surface | Kiro IDE ; 1 session CLI de 15 min pour pouvoir comparer honnêtement dans le write-up |

---

## 1. P0 — Fondations Kiro (≈ 1 journée, meilleur ROI du hackathon)

### P0.1 — Adoption du workspace + journal

```
Read .kiro/steering/product.md, tech.md, structure.md, hackathon.md and all three files in .kiro/specs/graveyard-core/.
Do not write any application code.
1. Confirm each steering file is loaded and tell me its inclusion mode.
2. List every conflict, ambiguity or missing boundary between the steering files and the spec (numbered, with file
   references). Flag anything that would make a requirement untestable.
3. Make .kiro/specs/graveyard-core a real Kiro spec so its tasks are visible and trackable in the Kiro spec panel.
   If the panel cannot adopt hand-written markdown, recreate the spec through the panel and move the existing content
   into it verbatim: keep the EARS sentences, the requirement numbering and the wave graph in tasks.md.
4. Fix two wording issues you will have seen in step 2: requirement 1.1 must say "exactly three tombs on first
   launch, one per seeded resting project"; requirement 8.4 must say the non-3D mode is also what loads when WebGL
   is unavailable or the device has no keyboard, and must never show a blank screen.
5. Create docs/KIRO_LOG.md with a table: | Session | Task | Kiro feature used | What it caught or changed |.
   Add one row now for this session.
Stop after these five steps and show me the list from step 2.
```

### P0.2 — Décision « le livre » (documentée, pas débattue)

La machine cible est un GPU intégré modeste : le débat A/B est déjà tranché en faveur de B. Ce prompt sert à
**graver la décision dans design.md** (les juges notent la démarche, pas seulement le code).

```
Design decision record, no implementation.
Requirement 2 and design.md assume the book's editable content is embedded HTML on the page planes. The target
machine is a weak integrated GPU, and reading and editing must stay reliable. Compare, in writing:
A. drei <Html transform> with real form inputs inside the 3D book.
B. 3D book as the physical object (cover, spine, page block, animated page turn) + a DOM overlay panel styled as the
   parchment page, used for reading and editing.
C. Baked canvas-texture pages, editing only from the grimoire.
Cover focus loss, Pointer Lock / cursor conflict, occlusion and z-order, text sharpness at Low quality, mobile,
implementation cost. Then append a section "Decision: book UI" to .kiro/specs/graveyard-core/design.md choosing B,
stating exactly what the 3D book still does on its own (open, turn pages, close, react to E and Escape) and that the
overlay is presentation of the same saved state, never a second source of truth. State the WebGL-unavailable
fallback rule. Update requirement 2.2 wording to match.
```

### P0.3 — Script de vérification (la boucle de tout le reste)

```
Create the verification tooling. Scope: package.json scripts + one script file, no app code.
- npm run check = tsc --noEmit && vitest run --silent && node scripts/kiro-check.mjs
- npm run typecheck and npm run test kept as separate scripts for hooks.
- scripts/kiro-check.mjs (node, zero dependencies) exits 1 with a clear message if any of:
  .gitignore ignores .kiro in any form, including patterns like "*" or ".*";
  LICENSE missing or not MIT;
  README.md has no "Run" section;
  src/domain imports from world, book, cinematics, interaction, ui, grimoire or store;
  a file under src/world, src/book, src/cinematics or src/interaction contains "new THREE." with no dispose of the
  same identifier in that module;
  a file under src/world or src/cinematics creates a particle system whose count exceeds the budget declared in
  .kiro/steering/perf-budget.md (if that file does not exist yet, skip this check silently);
  src/ references a remote asset URL that is not listed in docs/ASSETS.md.
Print "ok" and exit 0 when every check passes. Keep the checker fast: under one second, no network, no build.
```

### P0.4 — Budget de performance (steering dédié + règle chiffrée)

Nouveau fichier steering — c'est ce qui empêche Kiro de « jolifier » la scène jusqu'à 12 fps.

```
Create .kiro/steering/perf-budget.md with front matter:
---
inclusion: fileMatch
fileMatchPattern: ["src/world/**/*.tsx", "src/book/**/*.tsx", "src/cinematics/**/*.tsx", "src/interaction/**/*.tsx",
  "src/ui/**/*.tsx"]
---
Hard performance contract for a weak integrated GPU. The Low preset must hold 50 fps idle and never drop under 30 fps
during the heaviest cinematic, with twelve tombs present. Enforced rules for generated code:
- device pixel ratio capped at 0.75 on Low, 1.0 on Medium, never above 1.0 on High;
- one directional light, no point lights inside cinematics except a single flickering lantern with distance falloff;
- shadow map maximum 1024 on Medium and High, shadows disabled on Low; use ContactShadows with frames={1} or a baked
  blob texture, never a per-frame shadow re-render;
- no post-processing at any preset; no bloom, no DOF, no SSAO, no SSR, no MeshReflectorMaterial;
- no fog volume raymarching: fog is three.js FogExp2 plus at most two camera-facing mist planes;
- particle budget: 900 on Low, 2500 on High, single Points geometry per effect, no per-particle mesh;
- all repeated props (stones, dead trees, grass tufts, fence posts) instanced through InstancedMesh;
- textures procedural, maximum 512x512, no external image downloads;
- geometry: merge or instance, keep draw calls under 80 at Low, keep the whole scene under 150k triangles;
- every cinematic must reuse pooled objects instead of allocating per frame; nothing in a render or tick function
  may create a THREE.*, a new array literal of vectors or a material;
- a quality preset may only scale effect parameters, never remove a function from the product.
When a change would break this contract, stop and say so instead of implementing it.
```

### P0.5 — Hooks Kiro (ton playbook les promettait, ils n'existaient pas)

```
Create agent hooks as JSON v1 files in .kiro/hooks/, one file per hook, all enabled, schema
{"version":"v1","hooks":[{name,description,trigger,matcher,action}]}.
1. domain-tests.json — trigger PostFileSave, matcher \.(ts|tsx)$, action command "npx vitest run --silent". Purpose:
   domain regressions surface at authoring time.
2. resource-hygiene.json — trigger PostFileCreate, matcher ^(src/(world|book|cinematics|interaction))/.*\.tsx?$,
   action agent prompt: add dispose for every geometry, material, texture and render target this file creates, make
   cleanup idempotent, and confirm the change stays inside .kiro/steering/perf-budget.md.
3. task-quality-gate.json — trigger PostTaskExec, no matcher, action command "npm run check". If it fails, report
   the failure verbatim and fix it before the task is marked done.
4. spec-sync.json — trigger PostTaskExec, action agent prompt: if the finished task changed behaviour, a requirement
   number or a data field, update .kiro/specs/graveyard-core accordingly and append a row to docs/KIRO_LOG.md. Never
   edit requirements.md silently: summarise the edit in your reply.
5. review-on-stop.json — trigger Stop, action agent prompt: run the graveyard-reviewer custom agent on the current
   diff and report blocking issues only.
Do not add any hook that runs a build or starts a dev server. Keep matchers narrow and make sure no hook can fire on
its own output.
```

### P0.6 — Agents custom + steering contextuel

```
Create three files.
1. .kiro/agents/graveyard-reviewer.md — a read-only reviewer. Tools limited to reading and search: no write, no
   shell, no deploy. resources: file://.kiro/steering/**/*.md plus the three spec files. System prompt: audit the
   working diff against requirements.md and report only blocking issues, numbered, as file:line + violated
   requirement + the smallest fix. Always check: (a) any animation that owns state instead of representing saved
   state; (b) undisposed three.js resources; (c) UI text that guilts, punishes absence or threatens loss; (d) a
   resurrected project duplicated or deleted; (e) any tomb, monument or lantern left after resurrection; (f) missing
   skip or reload handling; (g) assets missing from docs/ASSETS.md; (h) anything violating
   .kiro/steering/perf-budget.md.
2. .kiro/agents/graveyard-polisher.md — an art-direction implementer, same resources, allowed to edit only src/world,
   src/book, src/ui and the quality presets. System prompt: raise emotional quality without changing behaviour,
   public APIs or tests; stay procedural; obey the perf budget; stop and ask before adding a dependency or asset.
   Both agents also declare Kiro capability-based permissions explicitly, in the format this Kiro version expects, so
   the policy is committed and reviewable instead of living in ~/.kiro/settings/permissions.yaml:
   graveyard-reviewer gets fs_read allow and fs_write deny for "**" (it must be structurally unable to patch code);
   graveyard-polisher gets fs_write allow limited to ["src/world/**","src/book/**","src/ui/**","src/interaction/**"]
   and shell allow for ["npm run check *","npm run test *","git diff *","git status *"], with deny on package.json,
   package-lock.json, .kiro/** and .git/**. Both deny rm, sudo, curl and force-push. If a rule cannot be expressed in
   the schema, say so in your reply instead of writing a config that silently does nothing.
3. Two steering files, leaving the existing four untouched:
   .kiro/steering/scene-rules.md, inclusion fileMatch on ["src/world/**/*.tsx","src/book/**/*.tsx",
   "src/cinematics/**/*.tsx","src/interaction/**/*.tsx"]: the visual laws — cold moonlit palette, amber is the only
   warm hue and only for what is alive or leaving, the moon is a partial blue moon, embers are never blue, the
   specter is harmless and never chases, one major cinematic at a time, every cinematic skippable and landing on the
   exact final state, all geometry procedural, instance repeated props, dispose everything, camera never leaves the
   terrain, stone moves slowly and heavily while embers move quickly and lightly.
   .kiro/steering/test-rules.md, inclusion fileMatch on ["**/*.test.ts","**/*.test.tsx","src/tests/**/*"]: domain
   logic gets unit tests; invariants P1-P9 of docs/KIRO_PLAYBOOK.md get property-based tests with fast-check; every
   test names the requirement it protects in a comment; never mock the domain in domain tests; a failing test is
   fixed by changing code, never by relaxing the property.
```

### P0.7 — MCP Playwright (smoke test + captures)

```
The Playwright MCP server is available in this workspace. Use its browser tools; do not add a test framework.
1. Start the dev server, open the app, and report every console error or warning verbatim.
2. Drive the golden path once: create a project in the grimoire, bury it, walk to its tomb, open the book, edit one
   field, close it, resurrect it with a next action and watch the sequence end. Report each step pass or fail with
   what you observed.
3. Measure frame rate at Low during each of the four states and append it to docs/PERF.md.
4. Save three screenshots to docs/screenshots/ (wide graveyard at night, book open mid-page with the overlay, the
   embers moment) and reference them in README.md. They must contain only the three seeded demo projects, never my
   real project titles or notes.
5. Resize to a phone viewport and to a keyboardless state: confirm the app shows a clear message plus the non-3D
   mode and never a blank screen or a crash.
```

---

## 2. P1 → P10 — Le build

### Tâche 1.1 — scaffold (coller après la tâche 0)

```
Implement task 1.1 from .kiro/specs/graveyard-core/tasks.md. No scene, no store, no UI: this task only proves the
toolchain runs.
- Vite + React + TypeScript with strict enabled, plus noUncheckedIndexedAccess and exactOptionalPropertyTypes.
- React, @react-three/fiber and @react-three/drei must be a version-compatible set. Do not guess: install them, read
  back the resolved versions and their peer requirements, and record one row in docs/KIRO_LOG.md with the reasoning.
- Do not add @react-three/postprocessing, any effect library, any CSS framework or any component library.
- Zustand, Vitest and fast-check installed and wired (vitest runnable with one trivial test).
- Path alias @/ -> src. tsconfig, vite config and package.json scripts: dev, build, typecheck, test.
Report the version table you resolved and the exit status of each script. Update nothing else.
```

### Tâche 1.2 — structure + garde-fous (prompt-mère + P0.3)

```
Implement task 1.2 from the spec: the folder skeleton from .kiro/steering/structure.md, the MIT license check, and
.gitignore that never excludes .kiro. Then create npm run check = typecheck && vitest run --silent && node
scripts/kiro-check.mjs, where scripts/kiro-check.mjs implements the repo checks listed in docs/KIRO_PROMPTS.md
under "P0.3". Keep the checker dependency-free and under one second. Empty folders get a one-line index.ts only when
the build needs it. Do not create components yet.
```

**Prompt-mère**, à réutiliser en changeant seulement le numéro :

```
Implement task <N> from .kiro/specs/graveyard-core/tasks.md. Scope: subtasks <N.1>..<N.k> only. Read
.kiro/specs/graveyard-core/design.md and the steering first, including perf-budget.md and scene-rules.md.
Follow structure.md exactly.
Rules: smallest diff that satisfies the listed requirements; no new dependency without asking me first; the domain
layer stays pure, no React and no three.js imports; nothing in the render layer owns state, save first then animate;
every cinematic skippable and terminating in the exact saved final state; dispose everything you create; stay inside
the frame budget.
Definition of done: npm run check passes, the listed requirements are satisfied, those checkboxes are ticked in
tasks.md, and docs/KIRO_LOG.md gets one row describing what the spec, a test or a hook caught.
End by telling me how to verify it by hand in three steps.
```

Additions à coller sous le prompt-mère, bloc par bloc :

- **P1 (1.x)** — `Add an FPS and draw-call readout toggled with P, visible at every preset, without a stats library. Vite: strict TypeScript, alias @/ -> src, no CSS framework, no dev-only heavy plugins.`
- **P2 (2.x)** — `No UI in this session. Export every domain function from src/domain/index.ts. Keep them pure: (data, args) => data. Then write property tests for invariants P1-P9 of docs/KIRO_PLAYBOOK.md with fast-check, 1000 sequences each, printing a deterministic seed on failure.`
- **P2bis** — `Now use Kiro's spec property-based testing for graveyard-core on requirements 4, 5, 6, 7 and 9. Show me which invariants it proposes, keep the ones that map to P1-P9, drop the redundant ones, and tell me which invariant you could not express and why.`
- **P3 (3.x)** — `Persistence must be lossless: a failed write keeps the in-memory state and shows a non-blocking error banner. Migrations run on load and unknown keys are preserved, never dropped. Seeding writes exactly three demo projects with invented, obviously fictional titles.`
- **P4 (4.x)** — `Build the world to the perf budget, then run the P11 checkpoint before any visual polish.`
- **P5 (5.x)** — `Reading must work with a keyboard only: E opens the nearby tomb, PageUp/PageDown or arrows turn pages, Tab focuses fields, Escape closes. Autosave debounced 400ms, always flushed on close. The overlay and the 3D book read the same store.`
- **P6 (6.x)** — `The grimoire is the functional spine: every field of the data model must be reachable from it. Burial reserves the grave slot before the first animation frame, so a crash mid-cinematic cannot orphan a project.`
- **P7 (7.x)** — `Hard ordering for resurrection: embers run until the book is fully gone, only then does the tomb change; black smoke, then a dark spectral silhouette, rise, fly away, fade, vanish; only then remove tomb, collider and temporary objects. Amber for embers, never blue. No marker, monument or lantern remains. Skip or reload lands on that final state with no replay.`
- **P8 (8.x)** — `restAgain must re-validate that a slot is free and must keep identity, notes and history. Honor writes a result and link and creates no monument. Delete is the only destructive action and needs explicit confirmation naming the project.`
- **P9 (9.x)** — `The simple non-3D mode shares the store and the domain so it cannot drift from the 3D mode; it is also what loads when WebGL is unavailable. Menu: resume, grimoire, quality, reduced animations, export/import, controls, sound.`
- **P10 (10.x)** — `Visual details inside the perf budget, then every prompt of §4 and §5.`

### P11 — Checkpoint performance (après la tâche 4, obligatoire, go/no-go)

```
Performance checkpoint. The target machine is a weak integrated GPU.
1. Add the readout if missing: FPS min/avg/1%-low, draw calls, triangles, estimated GPU memory, JS heap, time to
   first frame.
2. Measure at Low, Medium and High for four states: idle exploring, book open with overlay, mid-burial,
   mid-resurrection with twelve tombs in the scene.
3. Write docs/PERF.md as a 4x3 table plus a one-line verdict per state.
4. If Low is under 50 fps idle or under 30 fps during a cinematic, propose the five cheapest wins, apply the top
   three (pixel ratio, shadow strategy, particle counts, instancing, texture size), re-measure and show the
   before/after table.
5. Never reach for post-processing, and never delete a function to hit the target: simplify the effect only.
6. If the target still cannot be met after step 4, stop and write a "Plan B" section in docs/PERF.md describing the
   fixed-camera variant: the same world, three authored camera angles and click-to-travel instead of free walking,
   with what that removes from the frame budget and what it changes in requirements 1.2, 1.3 and 1.4. Do not
   implement Plan B without my approval.
```

---

## 3. Dépannage (à réutiliser en continu)

**Bug :**
```
Bug report. Reproduce: <steps>. Expected per Requirement <X.Y>: "<quote the EARS line>". Actual: <what happens>.
1. Write the smallest failing test that encodes the expected behaviour, run it, show it red.
2. Explain the root cause in three sentences before touching any code.
3. Fix with the smallest diff, show it green.
4. State whether requirements.md or design.md must change, and do it.
```

**Kiro a dérivé hors périmètre :**
```
Revert everything outside the scope of task <N>. Show me git status and a per-file reason for each remaining change.
If a file is needed, say which requirement forces it; otherwise delete it.
```

**Ça marche mais c'est pauvre visuellement (passe Costume Contest) :**
```
Switch to graveyard-polisher. Improve only the look and feel of <state>: the graveyard at night, the open book, the
embers moment or the specter. Keep behaviour, APIs and tests untouched. Targets: a coherent moonlit palette with one
warm accent, readable silhouettes against fog, contact shadows that ground the tombs, slow heavy easing on stone and
quick light easing on embers, subtle secondary motion (grass sway, mist drift, dust in the moonbeam), no floating
geometry, no duplicated textures. Describe the before/after, then apply. Stay inside the Low frame budget in
docs/PERF.md and list any rule in perf-budget.md a target would break before you touch it.
```

**Le ton des textes sonne faux :**
```
Rewrite every user-facing string in the app. Voice: calm, short, slightly poetic, second person, English. Never
guilt, never threaten, never punish absence, never say "failed". Burial is entrusting, resurrection is a first step
and not a rebirth, honoring is gratitude. Show the full before/after list for approval before editing files.
```

---

## 4. P12 → P16 — Les livrables de soumission

### P12 — README

```
Write README.md for judges. Sections in this order: one-line pitch; what it is and the real problem it serves
(abandoned projects, no ritual to restart them); the three screenshots from docs/screenshots/; the core loop as six
bullets; a Controls table (ZQSD/WASD/arrows, mouse look, E, Escape, Tab, P, quality presets); Run it (npm install,
npm run dev, npm run check, npm run build); the deployed URL; Data and privacy (fully local, localStorage,
export/import JSON, seeding only on first launch, nothing leaves the browser); Performance (the measured table from
docs/PERF.md on an integrated GPU, and the rule that Low never removes a function); Architecture in ten lines with
the folder map from steering/structure.md; Built with Kiro (link docs/KIRO-USAGE.md and the .kiro directory:
steering, spec, hooks, agents); Assets (link docs/ASSETS.md: procedural plus MIT, no remote files); License MIT.
Plain language, no marketing adjectives, English.
```

### P13 — Write-up « how Kiro was used » → `docs/KIRO-USAGE.md`

C'est le document qui décide de « Technological Implementation ». Les juges posent des questions précises : on y
répond dans leur ordre.

```
Write docs/KIRO-USAGE.md from docs/KIRO_LOG.md, the .kiro directory and git history. Concrete and honest, no
puffery. Structure it exactly on the Devpost question list:
- Surfaces used: Kiro IDE for everything structural, one Kiro CLI session for comparison (say what the CLI did
  differently and whether you would use it again), Kiro Crew for the Graveyard Keeper in the separate repo.
- Custom agents: name both, and give the specific thing graveyard-reviewer caught, with the file, the requirement it
  protected and the commit that fixed it.
- Agent hooks: each of the five files, the workflow it automated, and a measurable effect (bugs caught before
  commit, minutes saved, regressions prevented).
- Spec-driven development: how EARS requirements became design and tasks, one case where the spec prevented a wrong
  implementation, one case where the spec was wrong and you edited it first, and an honest comparison with the vibe
  coding you would otherwise have done.
- Steering: which file made the biggest difference, and why perf-budget.md and test-rules.md use fileMatch instead of
  always — say what always-on would have cost.
- Property-based testing: invariants P1-P9, the bug fast-check caught, and the invariant you could not express.
- MCP: the Playwright smoke test and screenshots, and what it enabled that a manual pass would not have.
- Kiro powers and skills: if you did not use them, say so and say what you used instead. Do not invent usage.
End with "Limits": what you did not use, what Kiro got wrong, and what you would rebuild. Keep it under 900 words.
In the first paragraph, state plainly how the work was split: the concept and the first draft of the requirements were
written with a chat assistant before implementation began, and everything that exists as code, tests, hooks, agents
and documentation was produced inside Kiro, task by task, with the log in docs/KIRO_LOG.md. No hedging, no omission.
```

### P14 — Démo vidéo (< 3 min, pièce publique sur YouTube)

```
Write docs/DEMO.md: a 2:45 shot list for a screen recording of this app, English, with exact timings, on-screen
action and the narration line per shot.
Beats: 0:00 the graveyard at night and the problem in one sentence; 0:20 the grimoire, create a project; 0:45 the
burial cinematic; 1:15 walk to a tomb, open the book, read the four parts, edit one field; 1:50 resurrect with a
next action, embers then specter; 2:10 the grimoire shows it Resurrected, mark the action done; 2:25 quality presets
and the non-3D mode in five seconds; 2:35 the repo URL and a "built with Kiro" card.
Rules: the target machine is a weak integrated GPU, so turn the perf readout OFF during recording and state the
measured frame rates in the README and in one caption line of the video instead; record at 1280x720 to keep the
capture overhead low; no data that could look like a real person's projects; no third-party trademarks on screen; no
music I do not own — the in-app procedural WebAudio ambience is the only audio allowed.
Also give me: a 12-second opening hook, the final card text, and a cursor choreography note per shot so the recording
never stalls waiting for an animation to load.
```

### P15 — Blog + post social (bonus quasi gratuits)

```
Two artifacts, in English, both publishable during the Submission Period.
1. docs/BLOG.md — about 900 words, titled around "a graveyard for abandoned projects, built spec-driven with Kiro".
   It must state it is written as part of the Kiroween 2026 hackathon, include real numbers from docs/PERF.md, one
   property-based test that caught a real bug, and three screenshots. Write for readers who care about the workflow,
   not for fans of the app.
2. docs/SOCIAL.md — a post that BEGINS with the exact hashtag #KiroweenHackathon26, then my favourite thing about
   Kiro and how it changed the way I approach development. First person, specific, one original observation about
   spec-driven versus vibe coding, no emoji spam. Suggest which image from docs/screenshots/ to attach.
```

### P16 — Audit de conformité final (ne jamais sauter)

```
Run a submission compliance audit against .kiro/steering/hackathon.md and the actual repository. Report PASS or FAIL
per line with the evidence you checked:
1. Repo public, LICENSE present, MIT, detected by GitHub in the About section.
2. .kiro/ committed with steering, specs/graveyard-core, hooks and agents; .gitignore does not exclude .kiro in any
   form, including patterns like "*" or ".*".
3. npm run check passes on a clean clone of HEAD; npm run build succeeds; the deployed URL serves this same commit.
4. The app works with empty localStorage, with the three seeded projects, and after importing an exported JSON file.
5. No asset without a docs/ASSETS.md entry; no copyrighted music or images; no third-party trademarks in
   screenshots or in the video.
6. Every user-facing string and every document is in English.
7. README has real run instructions; docs/KIRO-USAGE.md exists; the demo script fits under three minutes.
8. Nothing in the repo reveals private project names, notes, emails or local paths of mine.
9. Category stated as Costume Contest. Ghost of Kiroween Past not claimed. Bonus claims limited to what is genuinely
   backed: blog URL and social post only if published, Crew app only if the separate repo is public.
Then output the paste-ready Devpost text: project title, one-line description, full description of features and
functionality, category, tech stack, and the exact list of bonus prizes to tick with the reason for each.
Do not modify code. For each failure, give the minimal fix as a separate short prompt.
```

---

## 5. C1 → C3 — Bonus « Best Kiro Crew App » ($1 000, repo séparé, 2 soirs)

**Prérequis de règle :** le Kiro Crew app doit être **nouveau** pendant la période de soumission, avoir **son propre
repo GitHub public**, et le compte GitHub doit être le même que celui de la soumission principale. Le write-up Crew
est évalué par l'équipe Kiro, uniquement parmi les 50 meilleures soumissions éligibles — donc ça reste un bonus
faible priorité, à lancer **après** la vidéo enregistrée.

**Le design qui rend ça crédible (et pas gadget) :** le cimetière est un objet récurrent — on y revient chaque
semaine, et rien dans l'app ne peut te rappeler d'y revenir parce qu'il n'y a pas de serveur. Le Keeper **est** ce
rappel : il vit dans le repo Crew, il a une mémoire, un cron, et il écrit une note pour une tombe précise.
**Confidentialité :** l'app est locale, donc le Keeper ne lit **jamais** le localStorage. Il lit un fichier exporté à
la main.

### C1 — Le repo Crew

```
Create a sibling project folder named crew-graveyard-keeper, a separate git repository that must not contain any of
my real project data.
The Keeper is one persistent Kiro Crew agent with one schedule. Behaviour:
- it reads data/graveyard.json in that repo, the file format being the app's exported JSON (same schemaVersion,
  projects, prefs); data/demo-graveyard.json ships with three invented projects and is the committed default;
  data/graveyard.json is gitignored so private data never reaches GitHub;
- every Friday at 18:00 it selects at most two resting projects, and for each writes docs/keeper-notes/<id>.md with
  a 15-minute next action, a one-line reduced version, and a draft epitaph, in the app's voice: calm, short, never
  guilt-tripping, never threatening loss, never suggesting deletion;
- if a project has been resting for more than 90 days it says so once and then goes quiet about it for 30 days;
  no streaks, no scores, no nagging;
- it never edits the main app repo, opens no pull request there, and runs no shell command beyond reading and writing
  its own docs folder.
Reuse the steering files of the main repo for voice and rules by copying them in, and state in the README which
files were copied.
```

### C2 — Ce qu'il faut livrer pour le bonus

```
Write crew-graveyard-keeper/README.md: what the Keeper is, why a persistent cross-session agent fits an app about
returning to things later (and why an IDE session cannot do that job), setup steps, the schedule definition, where
the exported JSON goes and why private data is gitignored, and how to run one iteration manually. Then write
docs/KIRO-CREW.md: a 200-word feature description for the Devpost bonus field, in English, no marketing tone,
naming the memory, the schedule and the permissions the agent has.
```

### C3 — À intégrer au write-up principal

```
In docs/KIRO-USAGE.md, the Kiro Crew paragraph must state honestly: what Crew did that the IDE could not (a job that
runs on a schedule with memory across sessions), that it was a separate small repo built in two evenings, and that
parallel sub-agents were deliberately avoided because they multiply credit use on a fixed budget.
```

**Piège de crédits :** Crew fait tourner des agents en parallèle et **brûle des crédits beaucoup plus vite** qu'une
session IDE. Un seul agent, un seul cron, **zéro sub-agent**, et lance-le une fois manuellement avant de l'activer
en hebdomadaire.

---

## 6. Budget de crédits (4 000, 23 jours)

| Bloc | Sessions | Estimation | Statut |
|---|---|---|---|
| P0 fondations | 7 | ~400 | obligatoire |
| P1–P3 domaine + store | 4 | ~600 | obligatoire |
| P4 monde 3D + P11 perf | 4 | ~1 000 | obligatoire, go/no-go |
| P5–P6 livre + grimoire + inhumation | 4 | ~900 | obligatoire |
| P7–P8 résurrection + suites | 3 | ~700 | obligatoire |
| P9 confort + fallback | 2 | ~350 | obligatoire |
| P10–P16 polish + livrables | 4 | ~400 | obligatoire |
| C1–C3 Crew | 3 | ~300 | optionnel, après la vidéo |

Garde **~15 % non dépensés** : le polish d'art direction et les retries de génération sont ce qui assèche un
compte. Et **demande les 4 000 credits maintenant** : formulaire avant le **1er décembre 12:00 PT**, rattrapage
impossible après, vérification d'identité avec nom Devpost identique à la pièce d'identité, codes à utiliser avant
le 4 décembre.

---

## 7. Planning (deadline 4 déc. 2026 14:00 PT — viser le dépôt le 3)

- **12–18 nov.** — P0, P1–P4, P11. **Go/no-go sur le 3D** à la fin de la semaine : si Low ne tient pas 30 fps en
  cinématique, on discute du Plan B caméra fixe (P11 step 6) avant d'investir plus.
- **19–25 nov.** — P5 → P8. C'est le cœur de la démo : l'ouverture du livre, l'inhumation, les braises, le spectre.
- **26 nov. – 1 déc.** — P9 → P16, URL déployée, C1–C3 si le budget le permet. **Aucune feature nouvelle après le 1er déc.**
- **2–3 déc.** — enregistrement vidéo (2 prises : une pour le rythme, une propre), montage, `docs/KIRO-USAGE.md`,
  post de blog publié (la fenêtre se ferme avec la soumission), draft Devpost sauvegardé, puis soumission le 3.

---

## 8. Ce que la v1 du plan laissait passer (corrigé par ce pack)

1. **`.kiro/hooks/` n'existait pas** alors que `docs/KIRO_PLAYBOOK.md` §3 en décrivait trois → P0.5.
2. **`docs/KIRO_LOG.md`** était référencé par `tasks.md` Notes mais absent → créé en P0.1, alimenté par le hook `spec-sync`.
3. **Specs écrites à la main, hors panneau Kiro** : pas de suivi de tâches, pas de vagues, pas de PBT généré → P0.1 + P2bis.
4. **Aucun garde-fou de performance chiffré** : « prefer simple geometry » ne suffit pas à empêcher Kiro d'ajouter
   bloom + 5 000 particules → P0.4, et le checker P0.3 le fait respecter.
5. **Requirement 1.1 « exactly three tombs » vs 12 slots** : reformulé en P0.1 step 4.
6. **Pas de règles clavier** alors que la souris tourne en Pointer Lock → P5 + exigence de repli sans clavier.
7. **Rien sur mobile/WebGL absent** → le simple mode devient le fallback officiel (P0.2, P9), pas une case du spec.
8. **Fuite de données perso dans les captures et la vidéo** → verrouillé en P0.7, P12, P14, et par le gitignore de C1.
9. **« Insufficient use of Kiro » = disqualification possible à la discrétion des juges** : le pack couvre specs,
   steering (y compris `fileMatch`), hooks, agents custom, PBT, MCP, et Crew — avec un usage réel pour chacun, pas
   décoratif.

---

## 9. Pourquoi ces décisions

- **Costume Contest plutôt que Resurrection** : en Resurrection, on te compare à de vraies technos mortes ressuscitées,
  et ton sujet (projets abandonnés) n'est pas une techno obsolète — le lien resterait métaphorique. En Costume Contest,
  la règle est « n'importe quelle app, mais une interface hantée, polis et inoubliable » : ton cimetière **est** la
  fonction (la tombe contient le projet, la résurrection est une vraie action avec une vraie donnée), et les juges
  doivent voir un produit complet. Comme les cinq critères pèsent 20 % chacun, on garde Design acquis d'avance et on
  va chercher Impact + Implémentation + Présentation avec les prompts P0, P13, P14.
- **Overlay DOM pour le livre** : Pointer Lock + `<input>` dans du HTML 3D transformé, c'est le point de mort
  classique (focus qui saute, occlusion, texte flou à Low, IME, défilement). L'objet 3D garde tout le rituel (ouvrir,
  tourner, refermer) ; l'édition — qui doit être confortable — vit au-dessus. Le 3D ne devient jamais source de vérité.
- **Overlay + budget dur pour le GPU modeste** : ce qui fait plomber une scène procédurale, c'est l'ombre par frame,
  le post-processing et les particules par mesh. D'où `ContactShadows frames={1}`, un seul directional light, pixel
  ratio plafonné, Points unique par effet, draw calls < 80.
- **Vidéo sans readout de FPS** : sur GPU intégré, avec l'overhead du capture, un chiffre à 30 fps se lit comme un
  défaut. Les mêmes chiffres dans le README et en légende = preuve technique sans pénalité de Design.
- **Powers non utilisés, et c'est assumé** : aucun power du catalogue n'apporte quelque chose à une app WebGL
  sans backend. Le write-up doit le dire (les juges préfèrent l'honnêteté à l'invention).
- **Crew = bonus à faible priorité mais cohérent** : un cron hebdo avec mémoire traversant les sessions, c'est la
  seule brique Kiro qui a un vrai argument produit ici — et ça se construit en deux soirs, dans un repo séparé,
  sans toucher au budget de l'app principale.

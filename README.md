# BUTTERFLY

**Change the world. Keep the moment.**

BUTTERFLY is a small 3D narrative world. Move a bridge closure, inspect how a delivery changes, then use **Keep this moment** to find and apply an intervention that preserves the 16:50 photograph while the closure stays in force.

## Run the local sample

Requires Node.js 22.12 or later. From this directory:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The header explicitly says **Local sample** when Sanity is not configured. Click **Close bridge at 16:15**, select **The photograph**, click **Keep this moment**, preview an option, then **Apply to my variant**. The timeline and **Reset variant** complete the journey.

```bash
npm run build
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:browser
```

Playwright saves reviewed journey screenshots in `screenshots/`. The scene requires WebGL; a text view and all controls remain available when WebGL cannot start. Space plays or pauses, arrow keys seek one minute, and reduced motion disables automatic playback.

## Architecture

- `fixtures/harbor.ts` is the local world in the same validated shape as a live frozen revision.
- `src/world` defines the Zod model, reference checks and allowlisted patches.
- `src/engine` is pure TypeScript. `simulate`, `compare` and `keepThisMoment` have no React, Sanity, network, clock or model dependency.
- `src/scene` renders the diorama from world positions, route geometry and simulation results. `src/ui` manages each visitor's local patch, timeline and inspector.
- `src/sanity` contains structured Studio types, draft adapter, frozen revision reader and Director tool. `scripts/` holds authorized seed, status and publication commands.

The engine uses integer minutes from the explicit `originMinute`. Intervals are `[start, end)`: departure at `end` is unavailable, while a crossing that completes exactly at `end` is valid. A prerequisite completed exactly when an event begins is satisfied. Paths use earliest arrival with allowed waiting, positive connection durations and stable ID tie breaks. A connection must remain available for its whole traversal. Events are resolved in dependency order; simultaneous independent events use stable IDs. Effects occur only for possible events. A missing fact or incomplete network yields `unknown` where appropriate. No event is moved automatically when it becomes impossible.

The sample has a 10 minute bridge path, 35 minute land path and existing but inactive 20 minute ferry path. Setup takes 10 minutes after delivery. The search enumerates finite intervention values, at most two interventions and 30 candidates by default. Every candidate is simulated against the current variant. Results are ordered by fewer interventions, then smaller total event time shifts, then stable ID. This is an explored finite domain, not a claim of global optimality. Preview leaves the variant untouched. Apply repeats the search against the anchored revision and patch.

## Sanity mode

Create **your own** Sanity project and a dedicated `butterfly` dataset. Do not point this app at another project's dataset. Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SANITY_PROJECT_ID`: your dedicated project ID.
- `NEXT_PUBLIC_SANITY_DATASET=butterfly`.
- `SANITY_API_TOKEN`: server or local CLI only, with appropriate rights to that project and dataset.

The public experience reads the active frozen revision without a visitor login or write token. Configure public read access for a public demo. If the live read fails, the app labels the visible fallback **Local sample (live unavailable)** and displays the connection error. `/studio` uses Sanity's own editor authentication. Its **Director** tool loads the draft when present, runs the same engine and displays the same scene. Reload Director after editorial changes. The App SDK was reviewed but is not required for this first version; Studio's authenticated custom tool keeps authoring in one application.

```bash
npm run seed:sanity
npm run status:sanity
npm run publish:sanity -- --expected-rev=<pointer _rev from status>
```

Seed uses `createIfNotExists` and does not replace editorial edits. Publication is an explicit CLI action: it reads the draft (or published authoring document), validates it outside Studio, simulates it, creates a complete frozen snapshot, then atomically changes the active pointer with `ifRevisionId`. A conflict fails and requires reinspection; it is never merged silently. Anonymous visitors can only change an isolated local variant. A live pointer update signals that a new revision exists; the open variant stays on its original snapshot until reload. No anonymous write API exists.

## Current status and limits

The local journey, unit tests, browser tests, Studio schemas, adapter, Director and publication CLI are implemented. No Sanity credentials were available in the build environment, so seed, authenticated Studio editing, live Content Lake reads and publication have **not** been exercised against a real project. The browser journey and screenshots used the local sample. This first world supports positive-duration paths, waiting, fixed and dependent events, typed facts and a bounded intervention catalog. It rejects cycles and contradictory input facts. It does not model arbitrary city economies, transit capacity, simultaneous resource contention or incremental simulation. Visuals are an original procedural kit; there are no third-party art assets. Google Fonts are loaded at runtime with system fallbacks.

The current lockfile has 14 npm audit findings, including 3 high findings in Sanity CLI transitive dependencies. Compatible dependency updates were applied; see the build notes for what remains.

See [BLUEPRINT.md](docs/BLUEPRINT.md) for the operational model and [BUILD_NOTES.md](docs/BUILD_NOTES.md) for actual verification and submission work remaining. Original code is MIT licensed.

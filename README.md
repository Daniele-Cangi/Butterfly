# BUTTERFLY

**Change the world. Keep the moment.**

BUTTERFLY is a small 3D narrative world. Move a bridge closure, inspect how a delivery changes, then use **Keep this moment** to compare the original composition, the missed moment and engine-verified recovery previews. Applying a preview changes only your local variant.

## Run the local sample

Requires Node.js 22.12 or later. From this directory:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The header explicitly says **Local sample** when Sanity is not configured. The first composition is possible: delivery at 16:30 and setup at 16:40. Click **Close bridge at 16:15**, select **The photograph**, inspect why it was missed, then use **Keep this moment**. Compare the original, variant and recovery preview in the same MomentFrame. Apply a preview to your local variant, then reset it.

```bash
npm run build
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:browser
```

Playwright saves journey screenshots in `screenshots/`. The scene uses one WebGL canvas; a text view and all controls remain available when WebGL cannot start. Space plays or pauses, arrow keys seek one minute, playback speed is selectable, and reduced motion disables automatic playback. Actor locations sample precomputed, timed route legs at the shared playhead.

## Architecture

- `fixtures/harbor.ts` is the local world in the same validated shape as a live frozen revision.
- `src/world` defines the Zod model, reference checks and allowlisted patches.
- `src/engine` is pure TypeScript. `simulate`, `compare` and `keepThisMoment` have no React, Sanity, network, clock or model dependency.
- `src/scene` renders the diorama from world positions, timed route itineraries and simulation results. The city is the main interface. Pure MomentFrame selectors decide presence and arrangement visibility before the scene places composition actors; unknown locations use a visibly uncertain marker at the last known position.
- `src/ui` keeps the world/result pair coherent for each displayed version, manages the visitor's local patch, continuous shared playhead, timeline and contextual inspector. Scene movement mutates Three.js refs from deterministic samples; it does not update React state per frame.
- `src/sanity` contains structured Studio types, draft adapter, frozen revision reader and Director tool. `scripts/` holds authorized seed, status and publication commands.

The engine uses integer minutes from the explicit `originMinute`. Availability starts are inclusive; a connection cannot depart at its exclusive end, but a crossing that finishes exactly at the end is valid. A prerequisite completed exactly when an event begins is satisfied. Earliest-arrival routing allows waits at intermediate places and requires each connection to remain available for its full crossing. The returned itinerary records planned and actual departures, waits and individually timed road, bridge and ferry geometry. Visual position is sampled by distance along each path, with the same fractional playhead used by every scene version. Stable connection IDs break equal-arrival ties. Effects occur only for possible events. A missing fact, unresolved movement or incomplete network yields `unknown` where appropriate; unresolved locations do not create ghost actors. No event is moved automatically when it becomes impossible.

The sample has a 10 minute bridge path and 35 minute overland path. The pre-existing ferry alternative takes 20 elapsed minutes: 5 minutes to the pier, a 5 minute wait for its 16:30 operating window, 7 minutes across the water and 3 minutes to the plaza. Setup takes 10 minutes after delivery. The other recovery departs at 16:00 and completes the bridge crossing by 16:10. The search enumerates finite intervention values, at most two interventions and 30 candidates by default. Every candidate is simulated against the current variant. Results are ordered by fewer interventions, then smaller total event time shifts, then stable ID. This is an explored finite domain, not a claim of global optimality. Preview leaves the variant untouched. Apply repeats the search against the anchored revision and patch.

The featured event, its authored time and place, actor/prop IDs, composition positions, story artifact, presentation roles and event order are world data. MomentFrame switches coherent world and simulation pairs at that same target time. The frame consults actual actor and prop positions: a composition coordinate is used only when the entity is at the required place; an impossible or uncertain entity is not rendered as a solid participant. A missed moment remains available in a separate Original view. While MomentFrame is open, scene, inspector, event labels, accessible summary and clock all stay at the target time; seek and playback controls are disabled until the visitor returns to the neighborhood. Display clocks round to the nearest minute; simulation comparisons retain fractional minutes.

## Sanity mode

Use a Sanity project created for BUTTERFLY and one of its existing dedicated datasets. Do not point the app at another project's content, and do not create a dataset just to run the local sample. Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SANITY_PROJECT_ID`: the dedicated project ID.
- `NEXT_PUBLIC_SANITY_DATASET`: the existing dataset name.
- `SANITY_API_TOKEN`: optional server/CLI token. Never prefix it with `NEXT_PUBLIC_`.

The public experience reads the active frozen revision without a visitor login or write token. Configure published read access for a public demo. If that read fails, the app labels the visible fallback **Local sample (live unavailable)** and displays the connection error. `/studio` uses Sanity Studio authentication. Its **Director** tool validates the draft, runs the same engine and displays the same scene; use **Reload draft** after editorial changes. The local scripts use the existing Sanity CLI login when no `SANITY_API_TOKEN` is set; the signed-in role still needs the required dataset permissions. The App SDK was reviewed but is not required for this version.

```bash
npm run seed:sanity
npm run status:sanity
npm run publish:sanity -- --expected-rev=<pointer _rev from status>
```

Seed uses `createIfNotExists` and does not replace editorial edits. Publication is an explicit CLI action: it reads the draft (or published authoring document), validates and simulates that authoritative content, creates a complete frozen snapshot, then atomically changes the active pointer with `ifRevisionId`. A conflict fails and requires reinspection; it is never merged silently. The public reader verifies pointer, revision document and snapshot identities before use. Anonymous visitors can only change an isolated local variant. A live pointer update signals a new revision; the open variant stays anchored until reload. There is no anonymous write API.

## Current status and limits

The local journey, 41 behavior tests, four browser flows, Studio schemas, adapter, Director and publication CLI are implemented. The configured Sanity project permits published anonymous reads, but its authenticated CLI user was denied `create` on the existing `production` dataset. No Butterfly authoring document or revision was created, and no live world was read or published. The Studio browser check opens at `http://localhost:3000/studio`, which is listed in Sanity CORS; `127.0.0.1` is a separate origin. The browser reaches Sanity's login/provider UI, but Studio authentication and live authoring have not been tested. Browser screenshots use the local fixture while the UI honestly displays the live-unavailable state. This first world supports positive-duration paths, timed route segments and waits, fixed and dependent events, typed facts and a bounded intervention catalog. It rejects cycles and contradictory input facts. It does not model arbitrary city economies, transit capacity, simultaneous resource contention or incremental simulation. Visuals are an original procedural kit; there are no third-party art assets. Google Fonts are loaded at runtime with system fallbacks.

The current lockfile has 14 npm audit findings, including 3 high findings in Sanity CLI transitive dependencies. Compatible dependency updates were applied; see the build notes for what remains.

See [BLUEPRINT.md](docs/BLUEPRINT.md) for the operational model and [BUILD_NOTES.md](docs/BUILD_NOTES.md) for actual verification and submission work remaining. Original code is MIT licensed.

# BUTTERFLY operational blueprint

## Invariants

`World` is validated by `validateWorld` before simulation or publication. IDs are stable, every nested document belongs to one world, connection endpoints are explicit places, and requirements use a small typed operator set. Connection geometry is visual only. Source facts use explicit intervals; derived facts come from possible event effects. Free text never decides claim truth.

The visitor's closure is a `setConnectionEnd` operation anchored to `baseRevision`. Allowed recovery interventions come only from the world's finite catalog. Keep this moment anchors the featured event ID, authored time, required place, actors and props. Recovery cannot patch the target or reopen the locked closure. Each candidate is applied to the current variant, simulated and checked. `found`, `already-satisfied`, `exhausted`, `limit-reached` and `indeterminate` are separate results. A limited search can still include verified alternatives.

For the sample: original delivery 16:30, setup 16:40, photo possible; closed bridge delivery 16:55, setup 17:05, photo impossible, ceremony possible, Gazette claim unsupported. Departing at 16:00 recovers via the bridge. Activating the existing ferry recovers with delivery 16:40 and setup exactly at the 16:50 photo. The ferry route is authored as road to pier (5 minutes), a scheduled wait (5 minutes), ferry crossing (7 minutes) and road to plaza (3 minutes). The elapsed trip is 20 minutes. Departure at 16:10 alone fails because the bridge closes during the crossing.

Routes contain planned departure, actual departure, arrival and ordered wait/movement steps. Each connection's visual segments carry their own integer duration and geometry; their durations sum to the connection duration. The pure sampler uses elapsed segment time and distance along its polyline, so seeking to the same minute gives the same position. Unknown trips do not move actors. An impossible trip produces no effects and leaves the resource where its last verified movement placed it.

MomentFrame is a camera framing of the same R3F scene and prefabs, sampled at the featured event's exact authored time. Its composition positions, event bindings, display order and artifact binding come from the world presentation data. Original, variant and recovery preview each pass a matching validated world and simulation. The scene does not display crates as flowers until the arrangement event is possible and has completed. Original composition remains available by selecting the Original version.

## Content and publication

Studio authoring uses nested typed objects for entities, links, per-connection route segments, windows, facts, events, requirements, claims, featured compositions, presentation roles and interventions. `toDraftDocument` and `fromDraftDocument` map these to the same `World` as the local fixture. The Director tool reuses validation, simulation and scene rendering under Studio authentication, passing the patched world/result pair together. Publication requires a service token only in a local/server CLI, validates and simulates authoritative content, creates `butterflyWorldRevision.snapshotJson` and conditionally moves `butterflyWorldPointer`. The public reader dereferences only the active frozen snapshot once. It never dereferences mutable editorial documents during a visitor's session.

The runtime playhead is one shared ref. React updates the displayed clock at a throttled rate; R3F samples entity trajectories and mutates object refs per frame. Playback pauses when the tab is hidden, has selectable speeds, and is disabled when reduced motion is requested. Seeking remains available. With no WebGL context, the same selected simulation is summarized in the text view.

## Phase 2 verification

- `npm test`: 25 tests exercise the retained 18 base/review regressions plus timed segments, intermediate waits, seek repeatability, exact arrival, ferry sampling, unknown movement, coincident geometry, target time and identifier changes.
- `npm run test:browser`: Playwright checks original composition, bridge closure, missed moment, artifact claim, all three MomentFrame versions, the ferry's wait at the pier, ferry preview and Apply, the independent early departure, reset, mobile reduced motion and the Studio config message.
- Browser screenshots are stored under `screenshots/` and are reviewed after each run. These tests use the local fixture; Sanity live configuration is not asserted.

Do not log or commit `.env.local` or a service token. Do not expose a write route to anonymous clients. Keep StoryArtifact text as plain untrusted text. If extending to Markdown, sanitize it before rendering. Any future App SDK or Workflow use must follow current Sanity docs and retain the pure engine as the authority for outcomes.

## Commands

`npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:browser`, `npm run seed:sanity`, `npm run status:sanity`, `npm run publish:sanity -- --expected-rev=...`.

## Official references checked

- [Sanity Challenge Path Two](https://dev.to/challenges/sanity-2026-09-16)
- [Contest rules](https://dev.to/page/sanity-challenge-v26-09-16-contest-rules)
- [App SDK introduction](https://www.sanity.io/docs/app-sdk/sdk-introduction) and [authentication](https://www.sanity.io/docs/app-sdk/sdk-authentication)
- [Content Lake transactions](https://www.sanity.io/docs/content-lake/transactions)
- [Custom Studio tools](https://www.sanity.io/docs/studio/custom-studio-tool) and [embedded Studio](https://www.sanity.io/docs/nextjs/embedding-sanity-studio-in-nextjs)
- [Next.js App Router](https://nextjs.org/docs/app) and [React Three Fiber](https://r3f.docs.pmnd.rs/)

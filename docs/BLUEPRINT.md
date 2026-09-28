# BUTTERFLY operational blueprint

## Invariants

`World` is validated by `validateWorld` before simulation or publication. IDs are stable, every nested document belongs to one world, connection endpoints are explicit places, and requirements use a small typed operator set. Connection geometry is visual only. Source facts use explicit intervals; derived facts come from possible event effects. Free text never decides claim truth.

The visitor's closure is a `setConnectionEnd` operation anchored to `baseRevision`. Allowed recovery interventions come only from the world's finite catalog. Keep this moment anchors the featured event ID, authored time, required place, actors and props. Recovery cannot patch the target or reopen the locked closure. Each candidate is applied to the current variant, simulated and checked. `found`, `already-satisfied`, `exhausted`, `limit-reached` and `indeterminate` are separate results. A limited search can still include verified alternatives.

For the sample: original delivery 16:30, setup 16:40, photo possible; closed bridge delivery 16:55, setup 17:05, photo impossible, ceremony possible, Gazette claim unsupported. Departing at 16:00 recovers via the bridge. Activating the existing ferry recovers with delivery 16:40 and setup exactly at the 16:50 photo. The ferry route is authored as road to pier (5 minutes), a scheduled wait (5 minutes), ferry crossing (7 minutes) and road to plaza (3 minutes). The elapsed trip is 20 minutes. Departure at 16:10 alone fails because the bridge closes during the crossing.

Routes contain planned departure, actual departure, arrival and ordered wait/movement steps. Each connection's visual segments carry their own integer duration and geometry; their durations sum to the connection duration. The pure sampler uses elapsed segment time and distance along its polyline, so seeking to the same minute gives the same position. Unknown trips do not move actors. An impossible trip produces no effects and leaves the resource where its last verified movement placed it.

Requirement evaluation and scene sampling use the same entity-position semantics. A planned route only affects reads at or after its departure time; an intermediate wait has a definite place, movement has no definite place, and exact arrival is at the destination. A transport being evaluated is excluded from its own prerequisites. A second in-progress movement causally needed to answer a later location read is reported as a temporal dependency cycle.

MomentFrame is a camera framing of the same R3F scene and prefabs, sampled at the featured event's exact authored time. Its composition positions, event bindings, display order and artifact binding come from the world presentation data. Original, variant and recovery preview each pass a matching validated world and simulation. A pure selector confirms an entity is at the moment's place before using a staging coordinate; absent actors are omitted, and unknown actors get a translucent marker at their last known position. Flowers become an arrangement only after successful setup and while they remain at the plaza. Original composition remains available by selecting the Original version. While the frame is open, the effective time is the goal time for rendering, event labels, inspector and clock; seek/play controls stay locked until exit. Clock text rounds to nearest minute while model comparisons keep the unrounded value.

## Content and publication

Studio authoring uses nested typed objects for entities, links, per-connection route segments, windows, facts, events, requirements, claims, featured compositions, presentation roles and interventions. `toDraftDocument` and `fromDraftDocument` map these to the same `World` as the local fixture. Studio exposes operator options and conditional fields, then validates the whole model through `fromDraftDocument`; publication repeats validation and simulation against authoritative Content Lake data. The Director tool reuses validation, simulation and scene rendering under Studio authentication, passes the patched world/result pair together and offers explicit reload. The authorized local CLI may use its existing Sanity login or a server-only API token. Publication creates a complete `butterflyWorldRevision.snapshotJson` and conditionally moves `butterflyWorldPointer` with `ifRevisionId`. The public reader verifies pointer, revision document and snapshot IDs before use. It never dereferences mutable editorial documents during a visitor's session.

The runtime playhead is one shared ref. React updates the displayed clock at a throttled rate; R3F samples entity trajectories and mutates object refs per frame. Playback pauses when the tab is hidden, has selectable speeds, and is disabled when reduced motion is requested. Seeking remains available. With no WebGL context, the same selected simulation is summarized in the text view.

## Phase 2 verification

- `npm test`: 42 tests across 6 files exercise the retained scenario/review regressions, time-aware route sampling and arrival positions, fractional display, MomentFrame presence, recovery search, Sanity authoring conditionals and publication concurrency.
- `npm run test:browser`: 4 Playwright Chromium flows check original composition, bridge closure, missed moment and article claim, all MomentFrame versions, ferry wait, recovery preview and Apply, early departure, reset, fractional seek/playback, target-time lock, mobile reduced motion and Studio configuration.
- Browser screenshots are stored under `screenshots/` and opened for visual review. These tests use the local fixture; Sanity live configuration is not asserted as successful.

## Phase 3 state and verification

- Local position semantics, MomentFrame presence selectors, target-time locking and nearest-minute display formatting are exercised by `npm test` and the fractional seek/playback browser flow.
- The Sanity schema offers explicit operators and conditional fields; Studio and publication both call the same validated adapter. Frozen publication re-simulates authoring data and guards the pointer with `ifRevisionId`; the local conflict test mutates the pointer after the read and confirms the new active ID is preserved.
- Read-only CLI checks found the owner's existing `production` dataset and no Butterfly documents. Anonymous reads are enabled. `npm run seed:sanity` reached Content Lake but returned HTTP 403 (`create` permission required); the CLI user cannot seed or publish. The CORS listing contains `http://localhost:3000`; this is the origin used by the Studio browser test (`127.0.0.1` is distinct). The browser reaches Sanity's login/provider UI, but Studio authentication and live authoring have not been tested. No dataset, content, CORS setting, or revision was created by this run. Live authoring and publication remain blocked by dataset permissions.
- Browser screenshots and Playwright use the local fixture, with the app explicitly labeling `Local sample (live unavailable)` while the pointer is absent. No deployment or challenge submission has been performed.
- The PR review's three schema/simulation findings are covered: conditional Studio fields are visible for matching event/requirement/intervention kinds, place entities omit `initialPlaceId`, and known semantic places remain feasible without optional display coordinates. The location test includes a completed route with no place/entity rendering coordinates.
- The follow-up review findings are covered: the initial pointer can have an empty `activeRevisionId` before the first publication, and the Sanity adapter discards stale hidden event fields according to the event kind while direct engine validation rejects irrelevant dependency fields. Regression tests verify that a stale hidden dependency on a fixed event does not create a false cycle and that the actual photograph remains possible.
- The route-sampling review finding is covered: after a successful transport to a place without authored display coordinates, the actor retains the endpoint sampled from its completed route rather than snapping back to its previous position.

Do not log or commit `.env.local` or a service token. Do not expose a write route to anonymous clients. Keep StoryArtifact text as plain untrusted text. If extending to Markdown, sanitize it before rendering. Any future App SDK or Workflow use must follow current Sanity docs and retain the pure engine as the authority for outcomes.

## Commands

`npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:browser`, `npm run seed:sanity`, `npm run status:sanity`, `npm run publish:sanity -- --expected-rev=...`.

## Official references checked

- [Sanity Challenge Path Two](https://dev.to/challenges/sanity-2026-09-16)
- [Contest rules](https://dev.to/page/sanity-challenge-v26-09-16-contest-rules)
- [App SDK introduction](https://www.sanity.io/docs/app-sdk/sdk-introduction) and [authentication](https://www.sanity.io/docs/app-sdk/sdk-authentication)
- [Content Lake transactions](https://www.sanity.io/docs/content-lake/transactions)
- [Content Lake perspectives](https://www.sanity.io/docs/content-lake/perspectives) and [drafts](https://www.sanity.io/docs/content-lake/drafts)
- [Studio validation](https://www.sanity.io/docs/studio/validation) and [CLI authentication](https://www.sanity.io/docs/apis-and-sdks/cli-authentication)
- [Custom Studio tools](https://www.sanity.io/docs/studio/custom-studio-tool) and [embedded Studio](https://www.sanity.io/docs/nextjs/embedding-sanity-studio-in-nextjs)
- [Next.js App Router](https://nextjs.org/docs/app) and [React Three Fiber](https://r3f.docs.pmnd.rs/)

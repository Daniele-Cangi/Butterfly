# BUTTERFLY operational blueprint

## Invariants

`World` is validated by `validateWorld` before simulation or publication. IDs are stable, every nested document belongs to one world, connection endpoints are explicit places, and requirements use a small typed operator set. Connection geometry is visual only. Source facts use explicit intervals; derived facts come from possible event effects. Free text never decides claim truth.

The visitor's closure is a `setConnectionEnd` operation anchored to `baseRevision`. Allowed recovery interventions come only from the world's finite catalog. Keep this moment anchors the featured event ID, its authored time, its required place and requirement types. Recovery cannot patch the target or reopen the locked closure. Each candidate is applied to the current variant, simulated and checked. `found`, `already-satisfied`, `exhausted`, `limit-reached` and `indeterminate` are separate results. A limited search can still include verified alternatives.

For the sample: original delivery 16:30, setup 16:40, photo possible; closed bridge delivery 16:55, setup 17:05, photo impossible, ceremony possible, Gazette claim unsupported. Departing at 16:00 recovers via bridge. Activating the existing ferry recovers with delivery 16:40 and setup exactly at the 16:50 photo. Departure at 16:10 alone fails because the bridge closes during the crossing.

## Content and publication

Studio authoring uses nested typed objects for entities, links, windows, facts, events, requirements, claims and interventions. `toDraftDocument` and `fromDraftDocument` map these to the same `World` as the local fixture. The Director tool reuses validation, simulation and scene rendering under Studio authentication. Publication requires a service token only in a local/server CLI, validates and simulates authoritative content, creates `butterflyWorldRevision.snapshotJson` and conditionally moves `butterflyWorldPointer`. The public reader dereferences only the active frozen snapshot once. It never dereferences mutable editorial documents during a visitor's session.

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

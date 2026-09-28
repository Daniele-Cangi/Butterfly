# Build notes

## Work performed

The target directory contained only `work/` and `outputs/`; there was no existing Git repository, project or `AGENTS.md`. The app was initialized in `outputs/butterfly` with its own Git repository. No cloud project, remote repository or deployment was created.

Official Next.js, React Three Fiber, Sanity App SDK/authentication, Content Lake transactions, embedded Studio and contest documentation were checked before implementation. Installed versions were checked against package peer requirements. React was updated to 19.3.0 when Sanity's Portable Text dependency requested a newer 19.2 patch than the first install. The first lint run found a synchronous effect state update; that was corrected. A custom camera replacement passed DOM tests but was visually wrong; screenshot review exposed it and the scene returned to R3F's built-in orthographic camera with resize-dependent zoom. A temporary route line formed a loop; it was replaced with a line that follows the path and disposes its geometry and material. The mobile camera and header were adjusted after screenshot review.

## Verification

- `npm run typecheck`: passed after the implemented files were complete.
- `npm run lint`: passed after effect and camera fixes.
- `npm test`: 13 behavior tests passed. These run the actual simulator and recovery search, including the stated times, full crossing availability, exact boundary, waiting, missing cargo, no effects from impossible events, both recoveries, ineffective candidate rejection, search states, changed data links, determinism, reference integrity, locks, stale revisions and visitor isolation.
- `npm run test:browser`: 3 Playwright Chromium tests passed. The desktop test closes the bridge, inspects the missed photograph and unsupported Gazette claim, compares original traces, previews and applies a recovery, seeks the timeline and resets. The mobile test checks reduced motion and horizontal overflow. A third test checks the Studio's missing-configuration message. The journey tests collect page and console errors; none were reported. The first Studio test attempt timed out during initial development compilation; rerunning with a suitable timeout and DOM-ready navigation passed.
- `npm run build`: production build passed after the content and camera refinements; repeated after the dependency update before handoff.
- Screenshots were opened and reviewed: `screenshots/01-bridge-closed-desktop.png`, `02-recovery-preview-desktop.png`, `03-recovered-desktop.png`, `04-recovery-mobile.png`. The last mobile view shows both banks and the bridge; the first camera attempt did not and was discarded.

No Sanity credentials were present. Live Content Lake reads, Studio login, seed and publication are therefore configuration-blocked and have not been represented as tested. No App SDK app, Workflow or AI runtime was installed. The Director is an authenticated Studio custom tool.

`npm audit fix` without forced major changes could not clear all transitive advisories. Updating compatible `styled-components` and Vitest releases reduced the audit from 18 to 14 findings (11 moderate, 3 high). The remaining high findings are in Sanity CLI transitive packages (`adm-zip`, `js-yaml`, `smol-toml`); npm proposed a breaking Sanity downgrade, which was not applied. Review these upstream dependencies before a public deployment, especially any privileged authoring environment. A clean `npm ci` from the lockfile succeeded after the updates.

## Path Two submission still to do

The [current challenge page](https://dev.to/challenges/sanity-2026-09-16) and [contest rules](https://dev.to/page/sanity-challenge-v26-09-16-contest-rules) require a published DEV submission using the Path Two template and `#sanitychallenge` tag, plus a Sanity project ID or public dataset URL. The contest page lists October 4, 2026 at 11:59 PM PDT as the deadline, one submission per path, and evaluation of honest build process, functionality, schema thoughtfulness and originality. A project and dataset must be configured, seeded, live tested and explicitly published before a credible submission. Deployment and DEV publication need separate authorization. An agent session upload is optional; inspect it for secrets before any public sharing. The app has not been submitted.

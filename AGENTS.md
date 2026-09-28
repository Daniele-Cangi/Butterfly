# Butterfly agent notes

- Keep the engine pure TypeScript and deterministic. Never make story outcomes depend on display labels.
- Validate every world, reference, patch and publication outside Studio. Preserve `baseRevision`, the visitor closure and the featured moment during recovery.
- Never place a Sanity write token in `NEXT_PUBLIC_*`, browser code, fixtures or logs. Public Apply changes only local variant state.
- Preserve editorial documents. Seed with `createIfNotExists`; publish only via an authorized CLI call with the current pointer `_rev`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:browser` and `npm run build` after behavioral changes. Review the generated screenshots.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

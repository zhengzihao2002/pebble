<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Release numbering

Every new commit must include a `Release-Type: major|minor|patch|none` footer.
Use major for a broad app/architecture milestone, minor for an additive feature,
patch for a fix/refinement, and none for documentation/tests/merge-only work.
Minor resets patch; major resets minor and patch. Keep detailed commit bodies.
Before committing, run `node scripts/prepare-release.mjs TYPE` using the same
release type and stage `src/lib/releaseSnapshot.json`. The app reads its
displayed version directly from this checked-in file on all platforms, including
downloaded source without Git or hosting metadata.
Do not add a visible build counter or commit hash.
Historical classifications live in `src/lib/releaseHistory.ts`; do not rewrite
those decisions casually or change dependency versions for release numbering.

# Sportslab source and previews

**Current workflow: local development with Vercel production releases.** The user stopped Sites publishing on September 25, 2026 and explicitly requested a GitHub push and Vercel deployment on September 26, 2026. Keep routine edits local; publish future releases when requested. Sites publishing remains inactive.

Use the root `public/` files and the page renderers in root `lib/` as the shared frontend source. The reconciled Sites checkout is `sites-unified-sync/`. The older `sites-*` folders are historical working copies; their files should not replace current changes without comparison.

## Local preview

Run `npm start` to preview the root application that Vercel deploys. The optional Sites preview below requires the separate local `sites-unified-sync/` checkout, which is not part of this repository.

Run `node scripts/preview-site.mjs` from the project root to serve the combined Sites build at `http://127.0.0.1:4182`. This preview loads `sites-unified-sync/dist/server/index.js`, reloads it when a build changes, and disables browser caching for local responses.

The old `sites-calculator-design` preview command forwards to this shared preview. It no longer serves its separate calculator build.

## Preparing updates

For local edits, copy changed frontend source into the existing `sites-unified-sync/` build directory, then run its `scripts/build.mjs` and `scripts/check.mjs`. This is a local build; no Sites plugin or publishing command is needed. The historical publishing steps below are inactive unless the user asks to resume them.

1. Open the existing Sportslab Site with the installed Sites workflow before preparing a publication. Preserve any newer remote edits and reconcile them into the root frontend files.
2. Copy the root frontend assets and the root versions of the page-rendering modules into `sites-unified-sync/`. Preserve the Site's hosting manifest, build adapter, and Git metadata. OCR vendor files remain served by the existing upstream service.
3. Build and check the reconciled checkout with `node scripts/build.mjs` and `node scripts/check.mjs` from `sites-unified-sync/`.
4. Publish that exact source and build using the Sites publishing workflow. The localhost preview then serves the same artifact automatically.

The Sites frontend continues to use the existing upstream service for live API data. Source synchronization does not migrate that service or copy browser-local user records between origins.

GitHub commits and pushes require the user's explicit request.

## Vercel releases

The `main` branch of `dafonsed/NFL-Lab` is connected to the Vercel `nfl-lab` project. Run `npm test` and `npm run check`, commit the root application source and push to `main`. Confirm the Vercel commit status and the Production deployment status match the pushed commit, then check the live routes and assets. Local `sites-*` checkouts, reports and environment files are not release source.

## Bet tracker

The single tracker route is `/ev/tracker`, with optional `?sport=mlb` (or another supported sport). Dashboard My picks and EV Tools Bet Tracker open the same page. `/bets`, `/bets/`, `/bets.html` and the old `/ev#tracker` bookmark redirect there.

Tickets use `nfl-lab.personal-bets.v1`. Valid manual records from the older EV workspace are imported once, with atomic receipts stored alongside tickets; original EV data is retained. Browser records remain local to their origin.

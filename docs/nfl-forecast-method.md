# NFL workload candidate and prediction record

The original `independent-v1` scores, weights, opportunity calculations and default ordering in `lib/model.mjs` are unchanged. `workload-v1` is an experimental second analysis, never a replacement for a missing sportsbook line.

## What it calculates

- Workload: mean pass attempts, carries or targets over the last three completed appearances.
- Efficiency: total relevant production divided by total opportunities over up to ten prior appearances. Receiving yards use targets; combined yards add the rushing and receiving components.
- Anytime TD: `1 - exp(-(expected rushing TDs + expected receiving TDs + mean special-teams TDs))`. Passing TDs do not count. Its error calibration treats touchdown occurrence as binary; rare offensive fumble-recovery TDs are a known limitation of the weekly training target.
- Simple comparison: the unchanged five-appearance mean of the target statistic (TD occurrence for anytime TD).
- All samples precede the selected week and game date. Current or unfinished games cannot enter the sample. A training artifact cannot be used to reconstruct its own training season or earlier seasons.

Historical prediction/outcome pairs are stored by market and position. Comparable forecast sizes are within 40% of the projection, with a minimum width of 15 yards or two counts; TD probability uses a 0.15 window. At least 100 matching errors are required for a lean. Count outcomes are integer-valued and bounded at zero; yardage can be negative. Scenarios come from the current projection plus the historical forecast error. The displayed range spans the 10th–90th scenario percentiles. Its measured coverage is reported, rather than assumed to equal 80%. TD frequency uses add-one smoothing of historical binary outcomes in the matching window.

Over and under are separate comparisons to the actual posted total. Equal outcomes count as pushes. The candidate may show a research lean when the estimated **unconditional** side probability is at least 60% and all checks pass. This fixed threshold has not been optimized on the holdout or validated as a betting edge; no prices, vig, ROI or profit are calculated.

No clear lean is returned for fewer than five appearances, a sample including another team, no current-season appearance, a 30% change in carries/targets/attempts between the latest two and preceding three games, a 15-point change in snap share, stale inputs, insufficient comparable errors, missing/final/in-play/older-than-two-hour lines, reported injury concerns, unavailable availability checks, or neither side reaching the threshold. These are conservative research exclusions, not new original-model weights.

Availability comes from ESPN's anonymous NFL injury feed, joined by the roster's ESPN athlete ID. Source and check time are retained. No injury listing is **not** a confirmed active status or a full-workload guarantee. Current injury reports are not applied to historical games. Injury information flags uncertainty; it does not fabricate redistributed opportunities.

## Reproducible historical evaluation

Run `npm run evaluate:nfl`. The fixed protocol is 2022 warm-up, 2023 training errors, 2024 validation and 2025 holdout. No parameters were selected from the latest 2026 week or the holdout. Every historical projection uses only earlier appearances. Four variants are shown: five-game mean, workload-window change only, efficiency-window change only, combined candidate.

`lib/artifacts/nfl-forecast.json` contains the error pairs, declared rules and content hash. `lib/artifacts/nfl-evaluation.json` contains the report and source URLs, fetched times and SHA-256 receipts. Both are included in deployments; runtime requests do not refit the candidate.

The historical dataset uses today's corrected weekly stats and evaluates players with a published current weekly row and at least five earlier rows. It does not reconstruct point-in-time rosters, injuries, snap-only appearances, or historical book lines. Projection error is not a betting hit rate. Results are mixed, so the candidate remains experimental. Future refits require a new version/artifact and a fresh chronological evaluation; a deployment never silently rewrites earlier forecasts.

## Durable pregame record

Vercel uses a **private Blob store**, with separate production and preview prefixes. Local development uses `data-independent/predictions`; it does not write into the production archive. Credentials remain server-side. No third-party analytics app is a data source.

The first available pregame snapshot per NFL week, market and UTC day is immutable. A snapshot is written only when at least one upcoming player has a fresh, matched pregame line. All upcoming players on that board are included so missing lines and exclusions remain visible. Records include the source receipts, statistical sample, availability check, original score/projection/version, candidate projection/probabilities/reasons/version/artifact, average comparison, exact book/line/source/hash/quote time, actual capture time and scheduled kickoff. Writes explicitly reject overwrite; concurrent local writes publish a complete file atomically. Refreshes do not rewrite saved forecasts.

Forecasts only qualify while **both** the schedule and matched public event are still pregame, their kickoff times agree within 15 minutes, and the quote is no more than two hours old. Historical reconstructions cannot be backfilled as pregame records. Capture is bounded to upcoming games within seven days. If Blob is unavailable the board remains usable, but reports that the prediction was not saved.

The secured `/api/cron/predictions` route runs daily around **10:00 UTC** (03:00 Arizona), automatically discovering upcoming NFL weeks. Vercel Hobby execution can occur during the following hour. Board visits also attempt the day's capture. These are first available daily snapshots, **not closing-line captures**. `CRON_SECRET` is checked with a constant-time comparison. Preview deployments use a separate namespace and do not receive production scheduled runs.

For each player/game/market, performance selects the latest eligible snapshot actually captured before kickoff, without consulting the outcome. If none qualified, the latest exclusion is retained. A later missing line cannot erase an earlier valid prediction. The original frozen line is graded against completed nflverse statistics; equal is a push. Pending, missing statistics and nonparticipation are never losses or assumed sportsbook voids. The daily job appends immutable settlement versions for the current and previous week; corrections append new results. The report rechecks the current official statistics, so subsequent provider corrections can change the displayed result without changing the forecast.

The performance page reports all eligible records, exclusions, pending/missing/DNP counts, pushes, lean coverage and lean results. Candidate and average probability metrics use the same settled no-push cohort. Brier/log loss and reliability bins are conditional on no push. Original/candidate/average projection MAE is shown separately by market on matched records where all point estimates exist; the original score is not reinterpreted as a probability. Over/under comparisons are statistical results, not official book settlements.

## Operations

- Configure `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET` on the linked Vercel project. Missing storage must not be reported as a durable success.
- `npm test` exercises leakage prevention, push handling, source failures, injury joins, immutable/concurrent writes, kickoff cutoffs, frozen-line grading and paired evaluation.
- `npm run check` validates server and browser JavaScript.
- `/performance` shows the live archive and separate historical evidence. JSON export includes the complete selected week's records and receipts.
- The table loads 100 records at a time and filters by market on the server. Export retrieves every page for the selected week/market; it stops if the archive or result-source version changes during export. Pages include frozen-input receipts and the current result-source receipts. Large weekly archives never require one oversized serverless response.
- The scheduled endpoint requires the configured bearer secret. The public performance endpoint is read-only. Browser credentials and private user notes are never included in snapshots.

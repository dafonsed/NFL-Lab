# Verification of the independent implementation

The previous reference-site scraper and its tests were removed. Runtime stat adapters use configured nflverse GitHub release files; posted player totals use the anonymous ScoresAndOdds public comparison feed. ESPN is used separately for cross-provider auditing and user-facing box-score links.

## Automated checks

`npm test` covers field-zone boundaries, null values, penalty/nullified-play exclusion, two-point exclusions, kneels/spikes, TD conversion rates, spread signs, historical samples, incomplete games, future rosters, byes, active status, snap-only zero appearances, missing weekly rows, missing charting, NGS coverage joins, data-source allowlisting, input validation, conditional caching and offline fallback.

`npm run audit` writes a reproducible report containing source URLs/hashes, arithmetic checks, and ESPN comparisons. The report deliberately records disagreement; it is not a blanket claim that every statistic is correct.

## Practical limits

- Scores and probabilities are this app's model, not the reference app's private model.
- Charting is limited to available FTN sample games. It is not a live current-season feed.
- No live injury feed is connected. Public player totals have publication/cache delays; Arizona-specific pricing is not independently verified.
- Source data can change after NFL stat corrections. Historical boards use the corrected records available now.
- Expected-production and probability models are not betting-calibrated.

See README.md for source links and reports/INDEPENDENT-AUDIT.md for the current data audit.

## Completed checks — September 20, 2026 (Arizona)

- 25 automated tests passed; syntax checks passed.
- 23 HTTP board selections passed: all five markets in all four data views, plus 2026 weeks 1 and 3 and 2025 week 18. Invalid requests were rejected, an unpublished future season stayed pending, and raw evidence loaded.
- 1,093 player/market profiles passed 4,744 arithmetic and sample assertions.
- 1,489 of 1,491 compared ESPN counting stats matched across 16 games. Two target-count disagreements are retained and displayed. One unmatched category entry belongs to an offensive lineman outside the supported positions. The audit intentionally exits nonzero for the source disagreements.
- Chrome: all market views rendered; per-stat definitions, raw evidence links, source-discrepancy notices, game-line movement, methodology, Viper filters and future-week selection checked.
- Mobile viewport checked at 390 pixels: one matchup column with no document overflow. Desktop viewport restored.
- Final Chrome page showed “Independent data,” 2026 Week 2, 429 player profiles and 16 matchups, with no captured browser errors.
- Old reference-site snapshots/reports were archived; runtime/scripts contain no old provider URL, page decoder or imported score field.

## Purple interface and player explanations

- Reworked the theme, navigation, filters, matchup cards, player details and mobile layout in dark purple with restrained glow effects.
- Every player now has a market-specific explanation directly below their name, built from the same recorded inputs as the model. Low scores, missing inputs and small samples are handled explicitly.
- Passing-TD cards expose red-zone attempts per game and its source formula, so the note's volume input can be checked in the detail panel.
- 32 automated tests passed, including seven explanation tests; syntax checks passed.
- Chrome verified all five market explanations, expanding player details, per-stat source definitions, search, rankings and saving. The temporary save was reverted.
- Checked 390-pixel mobile layout with no horizontal document overflow and corrected the save-button overlap on expanded cards. Restored the normal desktop viewport.
- The finished Game Vault remains open with no captured browser errors.

## Public player totals and results — September 21, 2026 (Arizona)

- 52 automated tests and syntax checks passed. New checks cover six market calculations, selected-week leakage, public event/player matching, FanDuel preference, fallback labels, full-game filtering, missing lines, hit/miss/push, original timestamps during outages, duplicate fetches, and retention of the latest pregame line.
- All eleven Week 2 market routes returned public lines without source warnings. Passing yards, passing TDs, passing attempts, completions and interceptions each had 32 FanDuel player totals. Rushing attempts had 104 totals, including 42 FanDuel; other books remained explicitly identified.
- The targeted ESPN check matched 14 of 14 player/market actuals across seven markets in DET–BUF. Player-name matching handles suffixes such as James Cook III. Jared Goff: 327 passing yards vs FanDuel 257.5 (over hit). Josh Allen: 248 vs 250.5 (over missed). James Cook: 21 carries vs 17.5 (over hit).
- Week 1 rushing attempts loaded 92 public totals. Missing lines and missing player stats stayed ungraded. All 221 Week 3 rushing profiles remained pending; an available Bijan Robinson 18.5 FanDuel line was saved before kickoff.
- Chrome verified market selection, previous/future weeks, posted totals adjacent to ratings, historical result badges, expanded source/result details, and mobile alignment at 390 pixels without horizontal overflow. The desktop viewport was restored.
- Actuals are sourced independently from nflverse. Archived public lines are visibly distinguished from lines captured before kickoff and are not claimed as closing prices or historical model predictions.
- Reproduce the targeted integration check with `npm run audit:props` while the local server is running. Detailed source URLs and comparisons are saved locally in `reports/prop-verification.json`.

## Vercel startup repair — September 21, 2026

- Production logs reported `Invalid export found in module "/var/task/server.mjs". The default export must be a function or server.`
- Added the default HTTP-server export; Vercel controls the listener and requests. Local loopback binding and host restrictions remain in local mode. Hosted data writes use the temporary directory, and background intervals only run locally.
- Explicitly included public assets and configured a 300-second function limit. Deployment uploads exclude local data, logs, research and environment files.
- 53 automated tests and syntax checks passed. The new deployment regression test imports the Vercel entrypoint without starting a listener, checks the hosted hostname, static assets, health, invalid queries, private-file rejection and unsupported methods.
- Vercel preview returned HTTP 200 for health and a fresh passing-yards board (57 profiles, 32 FanDuel lines), with a cold load of about 29 seconds. Chrome loaded the full anytime-TD board (429 profiles, 400 public totals) with no captured browser errors.

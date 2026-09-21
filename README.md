# NFL Lab — independent NFL analytics

An independent local NFL research app. It downloads public NFL datasets and calculates its own player profiles. **There are no requests to VENOM, Whop, or the reference app.** It does not reproduce anyone's private calibrated scores.

## Run

Clone [dafonsed/NFL-Lab](https://github.com/dafonsed/NFL-Lab), then install and start:

```sh
git clone https://github.com/dafonsed/NFL-Lab.git
cd NFL-Lab
npm ci
npm start
```

Downloaded datasets, local logs, and machine-specific research files are excluded from Git. The app downloads its data on first use.

Double-click **Start-App.cmd**, or run `npm start`, then open **http://127.0.0.1:3100**. The launcher runs the server in the background; `npm start` stops when its terminal closes. Restart with the launcher after restarting Windows. Node 22+ is required. On a fresh copy run `npm ci` first. No API key or subscription is needed for the connected data.

## Included

- Weekly matchup groups, independent rankings, Viper opportunity-gap filters, game-line movement, and methodology.
- Eleven prop types: anytime TD, passing yards, passing TDs, rushing yards, rushing attempts, receptions, receiving yards, passing attempts, completions, interceptions thrown, and combined rushing/receiving yards.
- Public sportsbook over/under lines beside model ratings, preferring FanDuel and explicitly naming fallback books. Prior-week cards show actual results and over hit / over missed / push badges.
- Official-style weekly counting stats; play-by-play red-zone and goal-line usage; snap shares; opponent allowances; expected TDs and debt.
- NFL Next Gen Stats rushing expectations, time to throw, and receiver separation, with missing coverage kept explicit.
- FTN box-count and coverage-shell splits for **charted sample games only**. Free participation data is released after the postseason, so current-season splits are incomplete/unavailable.
- Search, position/team filters, saved players, private notes, three-player comparison, CSV/JSON exports, desktop/mobile layouts.
- Every displayed usage stat has a clickable formula. Every player has sample game logs, box-score links, dataset links, and `/api/evidence` JSON with raw plays and model rates.

## Actual data sources

| Data | Independent feed |
| --- | --- |
| Player box-score totals | [nflverse weekly player stats](https://github.com/nflverse/nflverse-data/releases/tag/stats_player) |
| Red-zone work, depth, opportunities | [nflverse / nflfastR play-by-play](https://github.com/nflverse/nflverse-data/releases/tag/pbp) |
| Teams and player IDs | [nflverse weekly rosters](https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters) and [season rosters](https://github.com/nflverse/nflverse-data/releases/tag/rosters) |
| Opponents, dates, totals and spreads | [nflverse schedules](https://github.com/nflverse/nflverse-data/releases/tag/schedules) |
| Offensive snap percentages | [PFR snap counts via nflverse](https://github.com/nflverse/nflverse-data/releases/tag/snap_counts) |
| Tracking expectations and advanced stats | [NFL Next Gen Stats via nflverse](https://github.com/nflverse/nflverse-data/releases/tag/nextgen_stats) |
| Defenders in box, coverage | [FTN participation via nflverse](https://github.com/nflverse/nflverse-data/releases/tag/pbp_participation) |
| Independent verification | ESPN box scores, linked from sample games; ESPN is used by the audit script, not the app's production data pipeline |
| Player over/under lines | [ScoresAndOdds public Odds Compare tables](https://www.scoresandodds.com/nfl/props), including [archived weekly boards](https://www.scoresandodds.com/nfl?week=2026-reg-2); FanDuel preferred |

The dataset status dialog exposes the exact files used. Caches in `data-independent/raw` retain URLs, download/check times, ETags and SHA-256 hashes. [nflverse availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) documents publication delays and corrections. Checking every 15 minutes does not make nightly datasets live feeds.

### Public totals and result history

The server reads the same anonymous market-comparison endpoint used by ScoresAndOdds' public comparison tables. It imports sportsbook totals only; it does not use that site's premium projections or its player-result fields. No account or API key is required. Arizona is the preferred region, using books listed as available in AZ; the public US totals cannot be independently verified as Arizona-specific pricing.

Matching requires the same home/away teams, game date, full-game market, and unique normalized player name/team. FanDuel is chosen first; DraftKings, BetMGM, Caesars, Fanatics or Bet365 can provide a clearly named fallback. Missing, ambiguous or unpublished lines stay unavailable. Model projections never substitute for sportsbook totals.

While running, background sync covers all eleven current-week markets. Active totals cache for 30 minutes and completed-game archives for 24 hours, with bounded requests and a short outage backoff. `data-independent/public-props` preserves source URLs, response hashes, fetch times and the last captured pregame line. The app must be running to capture lines before kickoff. Public page/feed changes or withdrawal can interrupt coverage; saved lines remain visibly labeled.

Completed-game actuals come from nflverse weekly player statistics, with play-by-play support for unusual scorer touchdowns. Over hit means actual greater than the displayed total; over missed means below it; equality is a push. Both sides appear in details. Missing final stats and pending games are never graded as losses. A line retrieved after a game is labeled **Archived listing**, not a verified closing price. These are statistical comparisons, not official sportsbook settlements or a record of predictions made before the game. Historical model ratings remain reconstructions.

## Calculation and future weeks

The server rechecks current datasets every 15 minutes while running. Historical-season and participation files are cached for 24 hours; manual refresh rechecks all files. The browser checks every five minutes while visible. **Latest week · automatic** rolls over Tuesday at 6 a.m. Eastern, preserving Monday Night Football. Known future matchups are selectable. Unknown schedules stay pending. New seasons are discovered from the calendar and schedule, without changing hardcoded years.

Samples contain up to five completed offensive appearances strictly before the selected week. Snap-only zero-touch appearances count. Samples can cross seasons and include postseason games. A game must have an `END GAME` record. Current-week results never enter that same week's player sample. Future boards use only games completed today and update as more records arrive. Archived boards are reconstructions from revised datasets, not historical forecasts captured before kickoff; schedule lines can be closing lines.

NFL Lab's own score weights, thresholds and probability formula are in the Metrics tab, `lib/model.mjs`, and `lib/definitions.mjs`. The TD probability is an **uncalibrated Poisson estimate for rushing/receiving TDs only**. The ranking and expected-production models have not been validated for betting accuracy. Source verification does not establish predictive accuracy.

Edge tracks game totals/spreads from the first observation saved on this computer. It does not claim opening prices or arbitrage. Player cards separately display public sportsbook totals. No live injury feed is connected; active roster status does not imply a player will suit up. Small samples and missing data are shown explicitly. New-market production baselines are sample averages; model ratings are scores out of 100, not calibrated probabilities of beating the displayed line.

## Verification and known disagreements

Run `npm test` for football logic, sample cutoffs, missing-data behavior, week rollover and offline caching. Run `npm run check` for syntax. Run `npm run audit` to recompute formula checks and compare up to 16 recent games with ESPN. An audit exits nonzero if providers disagree; it retains the discrepancies instead of silently changing nflverse values.

With the app running, `npm run audit:props` checks all eleven market routes, 2026 weeks 1–3, and selected DET–BUF results against ESPN. Its fixed-date regression scope is explicit; it does not claim to audit all games or predictive accuracy. The detailed local report is `reports/prop-verification.json`.

See `reports/INDEPENDENT-AUDIT.md` and `reports/independent-audit.json`. At the initial audit, 1,489 of 1,491 compared stats matched. ESPN had one additional target for Drake London and one for Jahan Dotson in 2026 Week 1 ATL–PIT. These notices are shown on affected player profiles while the audited nflverse values remain unchanged. One unmatched entry was an offensive lineman, outside the app's player positions.

## Attribution and storage

nflverse/nflfastR datasets: CC BY 4.0 unless a dataset specifies otherwise. Snap counts originate with Pro Football Reference. NGS metrics originate with NFL Next Gen Stats. Participation data: **FTN Data via nflverse, CC BY-SA 4.0**; derived charting tables retain that license. Provider trademarks belong to their respective owners. This app is unaffiliated with those providers.

Only public data is downloaded. Notes and saved players stay in browser local storage. The server listens on `127.0.0.1` only. Logs are in `logs/server.log`. Legacy reference-site research and snapshots are archived under `.research/obsolete-reference`; the runtime does not read them.

Environment options: `PORT` (3100), `REFRESH_MINUTES` (15), `DATA_DIR` (defaults to `data-independent`), `AUTO_SYNC=0` (disables background refresh). Network failure retains cached raw datasets and marks them stale. A first-time load without internet cannot invent missing data.

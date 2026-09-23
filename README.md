# Sports Lab — independent multi-sport analytics

An independent local NFL research app. It downloads public NFL datasets and calculates its own player profiles. **There are no requests to VENOM, Whop, or the reference app.** It does not reproduce anyone's private calibrated scores.

The sport switch opens the daily [MLB section](https://nfl-lab-xi.vercel.app/mlb), backed by MLB's official Stats API. The NFL section remains available at `/nfl` and `/`.

## Live odds and player props

Every page uses the same sport switch, **Research / Live / Performance / Paper returns** navigation, and **Bet Tracker** link. Click **Live** on NFL, MLB, NBA, or WNBA to open that sport's live board. NHL, soccer, and Bet Tracker link to `/live`, a directory of the four supported live boards. Navigation renders before any data requests, with the same headings, controls, spacing, and mobile layout across the site.

Direct live routes are `/nfl/live`, `/nba/live`, `/wnba/live`, and `/mlb/live`. Each page refreshes every 15 seconds while visible and includes game selection, live scores, player statistics, transparent regulation projections, manual full-game player-line comparisons, and source receipts.

Moneyline, spread/run line, and total prices come from ESPN's explicit live quote fields. Missing or suspended prices remain unavailable; pregame and archived prices are labeled separately. MLB box scores and inning state come from the official MLB Stats API; an ESPN odds event must match both teams and start time unambiguously. Public prices may differ from the user's sportsbook. Player prop lines are manually entered and expire after a changed game snapshot or 60 seconds. Feed failures and data older than 45 seconds pause comparisons.

The new live models are experimental, separate from pregame forecasts, and expose their calculations under each player. Basketball uses league-specific regulation minutes and earlier appearances; baseball uses remaining innings, confirmed batting orders and starter pitch budgets. Neither model supplies calibrated live probabilities or projects overtime/extra innings. See [live model details](docs/multi-sport-live.md).

## WNBA section

[WNBA Lab](https://nfl-lab-xi.vercel.app/wnba) includes 15 player-prop forecasts, WNBA-specific minutes/pace, matchup and rest effects, injury and lineup handling, FanDuel-first public totals where available, saved pregame records and transparent source evidence. Its WNBA-only chronological evaluation, calculations and coverage limits are documented in [WNBA model and data](docs/wnba-model.md).

## MLB section

- Sixteen player markets: home runs, hits, total bases, RBIs, runs, hits + runs + RBIs, stolen bases, singles, doubles, batter walks, batter strikeouts, pitcher strikeouts, pitching outs, earned runs allowed, hits allowed, and walks allowed.
- Daily date navigation with automatic Eastern Time rollover, future schedules, probable pitchers, confirmed lineups, game matchups, and final statistics. Game times use the viewer's local timezone. Spring training is excluded.
- FanDuel-first public over/under totals from ScoresAndOdds. Fallback sportsbooks are explicitly named. Availability varies: the verified public feed did not publish runs, doubles, batter-walk, or batter-strikeout totals during the initial audit; those markets still show official statistics and research scores. Missing lines remain unposted.
- Purple desktop/mobile interface, data explanations under player names, over/under result alerts, player game logs, source receipts, watchlists, notes, comparison, and CSV export.

### MLB data and calculations

`https://statsapi.mlb.com/api/v1` supplies schedules, game-specific rosters/lineups, probable pitchers, game logs, and box scores. Each player's detail panel links to the original responses and official games, with response hashes and retrieval timestamps. `/api/mlb/board?date=YYYY-MM-DD&market=hr` supplies the board; `/api/mlb/evidence?date=YYYY-MM-DD&market=hr&player=GAME_ID:PLAYER_ID` exposes the full sample and selected-game box statistics.

The sample contains up to 20 completed batter appearances with a plate appearance, or 8 completed pitcher starts. Same-day and incomplete games are excluded. The search window is 100 days, extended to the prior September early in a season. Recent-form baseline = 60% sample mean + 40% mean of the most recent 5 appearances / 3 starts. A published market scale converts production to a capped 0–100 rating. **The rating is not a calibrated probability or a validated betting forecast.** Opponent, park, weather, injuries, and lineup position are not model inputs. Historical over/under rates compare the sample to the displayed line; an explicitly labeled 1+ benchmark is used for some markets without a line.

Singles subtract extra-base hits from hits. Total bases count singles once, doubles twice, triples three times, and home runs four times. H+R+RBI adds the three official counts. Pitching innings are thirds: 6.1 innings equals 19 outs. Missing statistics are not converted to zero.

Final hit/miss/push alerts require a captured pregame or public archived total. In-play lines are not used to grade pregame results. No appearance, no plate appearance, non-starts, missing data, postponed/suspended games, and missing lines are distinguished. These are statistical comparisons, not book settlement decisions. Public archives do not prove exact closing totals. Arizona-specific pricing is unverified.

The browser refreshes every 15 minutes while visible. Official data is cached for 15–60 minutes by endpoint; public lines for 30 minutes and archived comparisons for one day. Manual refresh rechecks with a one-minute minimum interval. Failed refreshes retain available data with stale markers and original timestamps. Vercel's captured line history is temporary per instance; public archives remain the fallback. A permanent shared snapshot history is not provided.

Run `npm run audit:mlb` against the running app to verify all 16 markets on the fixed regression date September 20, 2026. Pass another date with `npm run audit:mlb -- YYYY-MM-DD`, or set `MLB_AUDIT_URL` to a deployed URL. The audit checks every available final result against fresh official box scores, independently recomputes one full sample per market, and checks the hosted response-size budget. Its report is written to `reports/mlb-verification.json` (not committed). This verifies data and arithmetic, not predictive accuracy.

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

### Vercel deployment

The repository supports the existing [hosted NFL Lab](https://nfl-lab-xi.vercel.app/). `server.mjs` exports its HTTP server for Vercel; Vercel owns its listener and invocation lifetime. `vercel.json` includes the frontend assets and allows up to 300 seconds for a cold data load. The initial board may take about 30 seconds while public datasets download.

Hosted requests refresh datasets and lines according to their cache lifetimes; the browser still checks every five minutes. The local version additionally runs background sync. Vercel uses writable temporary storage for downloaded data instead of the deployment's read-only directory. This cache is instance-local and can reset after redeployment or scaling. Saved pregame history on Vercel is therefore best-effort; the public archived listing remains the fallback. Durable multi-instance line history would require shared storage. Notes and saved players still stay in each browser.

## Included

### Personal bet tracker

Open **Bet Tracker** at the top right of any board, or go to `/bets`. Enter the ticket stake and combined American or decimal odds, then add each selection separately: sport, game date, game, player/team, market, side, and the exact booked line. Singles have one leg; parlays support 2–20, including mixed sports. Connected legs show box-score progress and final hit/miss/push results. The tracker refreshes when opened, when returning to the tab, and every minute while visible; **Refresh results** checks all connected tickets. Older final results are rechecked on opening or manual refresh, rather than polled indefinitely.

MLB results come from the official MLB Stats API. NFL, WNBA, NBA, NHL and soccer use ESPN public scoreboards, game summaries and pregame rosters. Each reading includes a timestamp and direct source link. Supported full-game player props, moneylines, spreads and totals use your saved line, never a subsequently changed sportsbook total. Soccer extra-time games, DNPs, missing data and interrupted games require review. Unconnected markets and custom rules can be entered and settled manually. See [Bet tracking and settlement](docs/bet-tracking.md).

Automatic ticket settlement combines the leg results. Any miss loses the ticket; all hits win it. A push or void combined with winning legs requires the book's adjusted payout: choose **Set result from sportsbook**, set the result, and enter **Actual total return**. Cash-outs and manual ticket results are preserved during refresh. Actual return and cash-out amounts include any returned stake. Existing saved tickets and notes are preserved and can be edited to add connected legs.

The all-time summary shows settled profit/loss, ROI, win/loss record, and open stake. ROI divides net profit by stakes on wins, losses, and cash-outs; refunded and open tickets are excluded. The win rate includes only wins and losses. Search and sport/result filters apply to the ticket list and CSV export; summary totals always include all saved bets.

Bets are saved in this browser's local storage, like player notes. They persist across reloads but do not sync between devices, browsers, or site addresses. Clearing site data deletes them; export a CSV copy first. Storage failures are shown without reporting a successful save or overwriting unreadable records.

### Research features

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

## NFL candidate analysis and performance

NFL player cards now include a separate experimental workload projection, line-specific over/under estimates, historical-error range and availability/role warnings. The original model weights and default rankings are unchanged. Open `/performance` for immutable pregame records, paired results and the fixed 2024/2025 historical evaluation. See [the full method and capture policy](docs/nfl-forecast-method.md).

Run `npm run evaluate:nfl` to reproduce the fixed historical evaluation. Production uses private Vercel Blob storage and the protected daily prediction cron; local development keeps its own archive. The candidate remains experimental because historical gains are mixed and a prospective track record is still accumulating.

## NFL live player props

Open the **Live** tab at `/nfl/live` for a separate in-game workload model across eight player markets. It shows recorded stats, remaining production, projected regulation totals, and each player's exact weights. ESPN box scores refresh every 15 seconds while visible; prior workload uses completed nflverse games. Enter the current full-game sportsbook total manually to compare it with the projection. Stale inputs, unsupported game states, and expired lines are visibly withheld.

Role shifts toward observed usage (up to 70% live); efficiency retains at least 80% historical weight; pace blends 65% historical / 35% live after five minutes. Score, clock, possession and pass/run mix adjust remaining opportunities. This is experimental and has no calibrated live betting probabilities. See [inputs, equations, limitations, and refresh policy](docs/nfl-live-method.md).

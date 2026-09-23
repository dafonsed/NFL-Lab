# Game simulation: audit, implementation and validation

> Historical report: current v3 behavior and results are in [the simulation boundary audit](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/simulation-boundary-audit.md). NFL scenarios now stop at regulation; the older final-game behavior below is retained for audit history.

The **Simulation** tab is in the **Models & Data** navigation. Open `/nfl/simulation`, `/nba/simulation`, `/wnba/simulation` or `/mlb/simulation`. The `/simulation` alias defaults to NFL. NHL and soccer retain the tab but explicitly explain that no game-score model is connected. The follow-up audit isolated player-board archives and returned model settings; standard prediction formulas remain unchanged by the simulation.

## Audit of the existing prediction path

This is a multi-sport project, despite its repository name. There is no single interchangeable “weighted model”: player research ratings, player production forecasts, and live game-score predictions have different units and purposes. Adding their numbers together would not produce a valid team-score expectation.

### Player models (preserved)

| Path | Inputs, units and provenance | Combination and existing output |
| --- | --- | --- |
| `lib/providers.mjs` → `lib/source.mjs::bundle` → `lib/model.mjs::buildRates/buildPlayers` | nflverse schedules, weekly player counts, play-by-play, snap counts, rosters, NGS and FTN charting. At most five completed player appearances before the selected week; opponent allowances use five earlier games. League rates use the prior season. All individual field definitions, units, sources and denominators are in `lib/definitions.mjs`. | NFL research ratings are capped 0–100 scores. The initial TD rating used 60% role / 40% context; role weights are red-zone share .35, touches .25, goal-line carries .15, target share .15, observed TD rate .10. Context is implied team total .55 / opponent positional TD allowance .45. Other ratings use volume .50 / production .30 / opponent allowance .20. Available components are normalized; current extraction is `lib/rating.mjs`. These scores are not game win probabilities. |
| NFL production features in `lib/model.mjs` | Carries, targets, catches, attempts, completions, passing/rushing/receiving yards, passing/rushing/receiving TDs, interceptions, snap share, team workload shares; goal-line/red-zone touches; pass depth, air yards, sacks, end-zone completions, explosive/stuffed rushes; opposing position allowances; schedule total/spread. NGS rush expectation, RYOE, time to throw and separation and FTN box/shell splits have separate coverage indicators. | Zone-specific historical TD rates produce expected TD counts; `1-exp(-expected TD/game)` is an uncalibrated Poisson player scoring estimate. Depth catch/yards rates produce expected receptions/passing yards; NGS supplies rushing expectation. Debt/drought and charting are research descriptors, not independent team-strength observations. Numeric market scales and exact feature mapping remain in `buildPlayers`; no scale is reinterpreted as a probability here. |
| `lib/forecast.mjs`, `lib/nfl-workload.mjs`, `lib/nfl-opportunities.mjs`, `lib/context-model.mjs` | Three-game workload; ten-game efficiency; position/market; teammate availability and workload allocation; fitted team workload; opponent production, temperature and wind. Rates have yards/counts per attempt/carry/target units. Learned coefficients and empirical error pools live in `lib/artifacts/nfl-context.json`. | Workload × efficiency, available opportunity corrections, then enabled fitted context correction. Historical errors supply line probabilities and ranges; special-teams TDs enter the candidate player TD estimate. The artifact's training-season gate protects earlier targets. This is a separate player forecast, not a game model. |
| `lib/mlb/model.mjs`, `lib/mlb/forecast-core.mjs`, `lib/mlb/forecast.mjs` | MLB Stats API completed player logs, PA/batters faced, starts, prior-season aggregate splits where required. Form uses 20 batter / 8 pitcher appearances. Trained features: log long rate/prior, log recent/long rate, log recent workload/prior, log long workload/prior, home indicator and capped rest/7. Coefficients, centers, scales and dispersion are in `lib/artifacts/mlb-model.json`. | Form baseline = .60 sample mean + .40 recent mean. Trained model is standardized log-linear count regression, with Poisson/negative-binomial or outs-normal distributions. Later matchup/context/opportunity layers disclose handedness, head-to-head, confirmed role/workload and availability effects. See `docs/mlb-model-method.md`, `docs/multi-sport-models.md`, and `docs/opportunity-upgrades.md` for the full existing feature/weight inventory. None is summed into team runs here. |
| `lib/sports/source.mjs` → `lib/sports/model.mjs` and `lib/sports/opportunities.mjs` | ESPN prior completed box scores, per-minute production, minutes, positional-rate prior, opponent production, venue, rest, basketball possessions, NHL power-play time, soccer competition/weather, confirmed role and teammate availability. Basketball shot/usage candidates are league-gated; goalkeeper adjustments require confirmed roles. | Stabilized rate × workload × bounded context. Workload combines .60 last-five / .40 long sample, with a five-appearance prior. NBA uses 48 minutes, WNBA 40. Count distributions and player thresholds are separate from game outcomes. Formulas/caps remain in these modules; soccer/NHL player forecasts do not establish suitable full-game score/overtime models. |

The existing market loaders match game, team, player, date and line. Missing prices remain unavailable. `lib/live-game-model.mjs::compareGameMarkets` computes two-way implied probabilities, proportional vig removal, pushes and price-based expected value for live outcomes. Current pregame quote eligibility is separately guarded by `lib/pregame-quote.mjs`. The new simulation does not consume book prices as model inputs, use closing prices in historical testing, or present a “+EV” label.

### Existing game-score model reused by Simulation

`lib/live-game-model.mjs::buildGamePrior` is the compatible weighted model. Its source path is nflverse schedule scores for NFL; ESPN team schedules for NBA/WNBA; MLB official schedules for MLB. `lib/live-nfl.mjs` and `lib/live-sports.mjs` already load these inputs for live games. The new `lib/simulation-source.mjs` fetches only the schedule/score inputs needed for pregame scenarios using the existing providers and caches.

| Input / weight | Meaning and units | Availability and handling |
| --- | --- | --- |
| Game ID, date, home/away IDs, season type | Identity, strict cutoff and overtime format | Schedule published before the game. Missing season type withholds NFL/MLB; duplicate team IDs and invalid dates are rejected. |
| Completed home/away scores | Integer points or runs per game, for both offense and defense | Earlier final scores only. Target ID, entire target date, future dates, incomplete records, impossible/missing scores and conflicting duplicate IDs are excluded. Explicit `availableAt` must precede the cutoff. |
| Recency weight | `exp(-ln(2) × ageDays / halfLife)` | Same weight in scoring, allowed scoring, variance and league calculations. Results older than 450 days are excluded. |
| League scoring mean | Weighted mean of both teams' scores, points/runs per team-game | Shrunk with 40 equivalent games at the existing sport mean below. For basketball the fetched population is the two teams' schedule union, not an independent complete league sample. |
| Home advantage | Weighted home-minus-away score, shrunk with denominator `mass+80` | Capped to ±8% of the configured sport mean. Earlier team offense/defense are venue-adjusted first. Half the advantage is added/subtracted once for the target. Confirmed neutral sites receive no target advantage; unknown site status is disclosed. |
| Team offense and defense | Venue-adjusted scoring and points/runs allowed | Recency-weighted, shrunk to league mean with `shrink` equivalent games. Actual history weight = `weightMass/(weightMass+shrink)`; league gets the remainder. |
| Matchup expectation | `.5 × offense + .5 × opponentDefense ± .5 × homeAdvantage` | Clipped to .45–1.65 times league mean. Output exposes both .5 contributions, venue contribution and clipping adjustment. |
| Historical score variance | Weighted squared scoring deviations, points²/runs² | Shrunk to the configured initial SD². Used for NBA/WNBA score randomness. NFL compound events and MLB clustered runs use their existing event distributions instead; variance is not applied again. |

| Sport | Initial mean / SD | Team game limit / minimum | Half-life (days) | Shrinkage (games) |
| --- | --- | --- | --- | --- |
| NFL | 22 / 11 | 16 / 5 | 180 | 6 |
| NBA | 112 / 13 | 30 / 8 | 90 | 10 |
| WNBA | 81 / 11 | 30 / 8 | 90 | 10 |
| MLB | 4.5 / 3.2 | 40 / 10 | 60 | 15 |

These are inherited constants, not newly estimated optimal weights. Team histories also influence the league baseline; shrinkage reduces extremes but is not independent evidence. Individual player projections are deliberately not added, since points, workload, pace and injuries already influence recorded team scores. Stale sources withhold simulation; an old last appearance or a small valid sample is shown as a warning. Fetch/check timestamps and source hashes remain visible. Current availability, weather, starter/bullpen strength and pregame pace are **not connected game-model features**; no invented injury/absence values or adjustments are applied.

### Leakage and coverage findings

- NFL original ratings may consume schedule implied totals; historical schedule lines can be closing lines. The simulation and its evaluation never consume those columns.
- NFL original prior-season rates and player samples are different populations; FTN free charting is incomplete in season. NGS missingness is not evidence of zero skill. Neither source enters this simulation.
- Current roster/lineup/injury reports cannot establish historical availability. The new historical evaluation uses only earlier team results, not target-game players or postgame starting lineups.
- These are corrected downloaded datasets, not immutable snapshots of what was published before each historical game. Strict chronological filters prevent direct future-result leakage but cannot prove publication-time fidelity or remove later score corrections. Exported scenario JSON is not a timestamped prospective forecasting archive.
- Historical scores already include overtime/extra innings. Available score-only feeds cannot reliably separate regulation exposure. Applying additional periods can overstate totals; no unvalidated correction was fitted on the final test set.
- NFL/MLB scores and independent basketball draws do not model shared pace, score correlation, game scripts, possessions/drives, tactical endgames or current personnel. Baseball walk-off home-run overshoots are omitted. These limitations remain visible in the product.

## Simulation mechanics and rules

`lib/game-simulation.mjs` is a pure, independently callable engine, separate from fetching and the browser. An explicit seed reproduces draws; otherwise a random seed is generated and returned. Version, input fingerprint, cutoff, sample IDs, weights and source receipts are included. Strength stays fixed; game randomness is sampled separately, once per run.

- NFL: inherited compound-Poisson scoring events. Mean event score is 5.73: 2 points with .02 probability, 3 with .30, 6 with .04, 7 with .57, 8 with .07. Scores are nonnegative integers and cannot equal 1. The inherited terminal overtime approximation keeps an 8% conditional regular-season tie chance; otherwise a winner receives 3 or 6 points. Postseason ties are disallowed. These are disclosed assumptions, **not** a possession simulation. Current [NFL overtime rules](https://operations.nfl.com/the-rules/nfl-rulebook) provide a possession opportunity to both teams subject to the regular-season clock; this engine does not claim to reproduce that sequence.
- NBA/WNBA: nonnegative rounded normal regulation scores using the existing historical variance; tied scores continue in five-minute overtime intervals. A capped unresolved continuation throws instead of inventing a winner or publishing an illegal final tie. NBA regulation duration is 48 minutes ([official rules](https://cdn.nba.com/manage/2026/01/Official-2025-26-NBA-Playing-Rules.pdf)); the project's WNBA duration is 40 minutes.
- MLB: geometric runs per out, three outs per half-inning; ninth-inning home batting is skipped when already ahead; walk-offs stop scoring at the winning run. Extra innings continue until a winner. The existing runner-on-second scoring approximation (.48) applies only to regular-season games from 2020 onward. Postseason uses no automatic runner ([MLB rule overview](https://www.mlb.com/news/mlb-extra-innings-rules-for-playoffs-2024-automatic-runners-and-pitch-clock)). Only confirmed nine-inning schedules are supported. An unresolved cap raises an error, not a final tie.

Every result includes empirical home/away/tie probabilities summing to 1, overtime/extra-inning frequency, each team's expected/median score and 10th–90th percentiles, complete integer probability masses for scores, home margin and total, and binomial Monte Carlo intervals. These intervals measure sampling noise only, not model uncertainty or accuracy. The UI renders accessible distributions and allows JSON export.

Optional manual two-way market comparison uses exact margin/total probability mass, counts pushes, converts American odds, and removes vig proportionally from paired prices. It compares conditional model probability (excluding pushes) with conditional no-vig market probability. Quotes are unverified/manual, and the push-return assumption must match the book. No automated wager, public-line scraping, betting-return claim or new service was added.

## Run and configure

### Player props in Simulation

After a game simulation finishes, the **Player props** panel loads the selected matchup's existing player forecasts. Select a sport-specific prop market, filter by team, or search for a player. Cards show the projection (or TD occurrence probability for NFL anytime TD), posted line and named book, available over/under/push probabilities, middle-80% outcome range, sample size, availability and model notes. Reported unavailable players remain visible with estimates withheld. Missing lines are not replaced with invented research thresholds. Archived, in-play, expired/stale lines and stale input sets withhold current pregame probability comparisons.

These are the existing player models, not player outcomes sampled within the game-score runs. Counts and seeds affect only game simulation; player estimates are not constrained to the simulated team scores and do not establish same-game prop correlations. Player data loads independently so a failed prop provider does not erase the game result; **Refresh props** retries through the existing cache rules. The result JSON includes the currently loaded prop market. Market/date/game changes cancel obsolete browser requests.

`GET /api/simulation/props?sport=nfl&date=2026-09-24&game=2026_03_ATL_GB&market=rec_yds` adapts the existing NFL, MLB or basketball board for exactly that matchup. NFL resolves the date/game to season/week; MLB filters by game ID to keep doubleheaders separate; NBA/WNBA use the existing game-specific board. `lib/simulation-props.mjs` owns adaptation and quote checks; `public/simulation-props.js` owns the independently loaded panel. Focused tests in `test/simulation-props.test.mjs` cover matchup matching, missing/stale/archived quotes, unavailable players, probability validity and TD units.

1. Start the application with `npm start`; open the Models workspace and select **Simulation**.
2. Pick a date/matchup, 1,000–50,000 runs (default 10,000), and an optional seed. NFL initially selects the next published game day.
3. Run the simulation; expand input/validation/source panels or download JSON. A historical selection is explicitly a reconstruction, with selected scores excluded.

API: `GET /api/simulation/catalog?sport=nfl&date=2026-09-24`, then `GET /api/simulation/run?sport=nfl&date=2026-09-24&game=2026_03_ATL_GB&simulations=10000&seed=example`. Matchup IDs must belong to the selected date. For an optional comparison, add `market=spread&line=-3.5&firstOdds=-110&secondOdds=-110` (moneyline and total are also supported). Invalid inputs return 400, unknown matchups 404, and unavailable history produces a machine-readable withheld result.

Programmatic use: import `simulateGame` from `lib/game-simulation.mjs` with `{sport, game, history, simulations, seed}`. `game.teams` requires two distinct string IDs with `homeAway`, and NFL also requires canonical abbreviations. `game.postseason` / `game.regularSeason` and MLB `game.scheduledInnings` select supported rules. Historical rows contain `{id,date,home,away,homeScore,awayScore,complete}` and optionally `availableAt`.

## Actual validation and performance

`npm run evaluate:simulation` reads the existing local `data-independent/raw/games.csv.gz`; it adds no data source. It fails if the required baseline or evaluation history is incomplete. A 2022 home/away/tie frequency baseline uses one pseudocount per category. 2023 is a calibration diagnostic (no calibrator fitted), 2024 validation, and 2025 final evaluation. Each game updates strength using only earlier completed games. The evaluator uses 2,000 seeded runs per game and contains no fitting routine. The repository does not establish a pre-registered parameter freeze or an untouched final holdout; these are retrospective diagnostic periods. See `docs/simulation-follow-up-audit.md` for the independent follow-up findings and fixes.

| Period | Games | Home Brier | Baseline home Brier |
| --- | --- | --- | --- |
| 2023 calibration diagnostic | 285 | .2362 | .2458 |
| 2024 validation | 285 | .2328 | .2479 |
| 2025 final evaluation | 285 | .2321 | .2497 |

2025 multiclass log loss was .6810 versus .7167 for the baseline; margin MAE 10.31 points; total MAE 10.80; team-score MAE 7.64. The home-Brier difference was −.0176, with an approximate game-level 95% interval [−.0245, −.0107]. This interval does not adjust for team/week dependence. Ten-bin calibration includes counts and Wilson intervals. For example, the 60–70% home bucket predicted 62.8% but won 88.9% across 45 games: material underconfidence. Nominal middle-80% ranges covered 90.2% of totals and 87.4% of margins, indicating excessive spread. No games were withheld in these periods.

The full local `reports/simulation-evaluation.json` includes CRPS, RMSE, calibration buckets, source/code hashes, individual evaluation rows, per-game input fingerprints/seeds/counts, team/favorite/underdog and input-availability segment counts, withheld games and benchmarks. `lib/artifacts/simulation-validation.json` ships the versioned summary for the UI. Use `npm run evaluate:simulation -- --verify-artifact` to reproduce it exactly, or `--write-artifact` to deliberately replace it after reviewing a new evaluation. Segment samples are much smaller and not separate evidence of improvement. Other sports have functional checks, not a league-wide historical validation of this new engine.

At initial implementation, local NFL core benchmarks including prior construction, from three runs each, were 3.6 ms for 1,000 draws, 10.4 ms for 10,000, and 40.6 ms for 50,000. The follow-up audit added stricter history validation; its new measurements are recorded in `docs/simulation-follow-up-audit.md`. These benchmarks exclude network loading, which dominates a cold request. The default balances responsiveness and about ±1 percentage point worst-case 95% Monte Carlo error. Measurements are machine-specific, not a hosting latency guarantee.

**Predictive-use conclusion:** the NFL historical diagnostic improves on a simple baseline, but poor calibration, excessive distribution width, approximate scoring/OT, corrected historical inputs and no prospective record prevent treating it as a reliable betting model. The feature stays experimental for every sport. Unit tests establish implementation behavior, not historical accuracy.

## Files and verification

- `lib/game-simulation.mjs`: input validation, seeded scoring, complete distributions, explainable contributions and manual quote comparison.
- `lib/live-game-model.mjs`: exports the existing RNG and NFL/MLB event samplers; the live call path and formulas are unchanged by this feature.
- `lib/simulation-source.mjs`: existing provider integration, date/game matching, source receipts and withholding; compact evaluation evidence.
- `lib/simulation-evaluation.mjs`, `scripts/evaluate-simulation.mjs`, `lib/artifacts/simulation-validation.json`: chronological evaluation, baselines, probability/error/distribution metrics, uncertainty, segments and persisted summary.
- `public/simulation.html`, `public/simulation.css`, `public/simulation.js`: responsive form, results, distributions, evidence, warnings, quote comparison and JSON export.
- `lib/site-layout.mjs`, `server.mjs`: Simulation navigation, sport-preserving routes, API endpoints and static assets.
- `test/simulation.test.mjs`, `test/simulation-routes.test.mjs`: seeded reproducibility, probability totals, valid scores, equal/strong/low-scoring cases, missing/stale/invalid inputs, chronology, duplicate conflicts, market pushes/vig, adapters, evaluation arithmetic and HTTP/navigation behavior.
- `package.json`: `evaluate:simulation` and `check:simulation`; this document and the README explain use and limits.

Verification at implementation: 15 new focused tests passed; full `npm test` passed 307/307; `npm run check` and `npm run check:simulation` passed. Browser verification exercised a real NFL matchup at 10,000 seeded runs and a paired −110/−110 moneyline comparison, with no console warnings/errors. Real API calls produced available distributions for NFL, NBA, WNBA and MLB; source retrieval failures withheld output and were retried with network access. All comparisons here use the local preview; no production deployment was performed.

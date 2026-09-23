# Standard-model audit and targeted improvements

This audit preserves the existing direct models for NFL, MLB, NBA, WNBA, NHL and soccer, including the deterministic live player projections. It does not replace the models, change their supported markets, tune weights, or use the separate live game simulation. Numerical changes are limited to demonstrated calculation/input defects. All fitted JSON artifacts remain unchanged.

See the [file-by-file before/after summary](standard-model-change-summary.md) for each calculation change, named historical examples and a separately qualified comparison of saved local prediction snapshots.

See the subsequent [independent final verification](standard-model-final-verification.md) for reproduced metrics, exact play populations, missing-factor comparability limits, valid-input edge cases and updated passing test results. It supersedes broader preservation/comparability interpretations without changing model weights.

## Model inventory and data path

| Model | Data collection → calculation → output |
| --- | --- |
| NFL weighted profile | `providers.mjs` downloads nflverse CSVs → `source.mjs` joins schedule, weekly stats, rosters, PBP, snaps and NGS → `prepareData` identifies completed games → `buildRates` estimates prior-season conversion rates → `buildPlayers` computes five-appearance profiles → public props are attached separately → direct workload forecast and existing teammate adjustments are attached → ranks and prediction archive |
| NFL direct forecast | Earlier weekly appearances → `forecast.mjs` workload × efficiency → existing team-workload/teammate scenarios → frozen context correction → historical error distribution → over/under/push probabilities at a posted line; guarded experimental lean |
| MLB profile | Official schedule/roster/game-log/box-score responses through `mlb/provider.mjs` and `mlb/source.mjs` → `mlb/model.mjs` 60/40 recent-form estimate → capped research rating; public line/history comparisons stay separate |
| MLB forecast | Earlier official game logs → `mlb/forecast-core.mjs` features → frozen Poisson regression → existing context, workload and pitcher adjustments → analytic count distribution, interval and line probabilities → pregame/paper records |
| NBA/WNBA/NHL/soccer | ESPN scoreboard, team schedules, summaries, roster and injury responses → `sports/normalize.mjs` → `sports/source.mjs` prior histories → `sports/model.mjs` stabilized rate × minutes × bounded factors → count estimate, interval and probabilities; automatic betting leans remain disabled |
| Direct live player forecasts | Current scoreboard/box score + earlier team/player history → `live-nfl-model.mjs` or `live-sports-model.mjs` → recorded production + expected remaining production, with a calculation breakdown; no calibrated live probability |
| Separate game simulations | `game-simulation.mjs` / `simulation-source.mjs` provide the separately developed pregame simulation; `live-game-model.mjs` provides live game simulation. They have their own game-level outputs and evaluation. No standard calculation imports either engine. |

The server can serve both types of model. Sharing a controller or raw source does not make a standard forecast depend on a simulated result. Recursive import tests cover all seven standard calculation entry points and the simulation loader. Scheduling helpers moved to neutral `game-time.mjs` and `sports/events.mjs`; existing imports remain compatible through re-exports. The simulation controller now imports those neutral helpers directly, removing its incidental dependency on standard forecast modules. Simulation calculations, weights and outputs were not changed.

## Sources, units and timing

| Input | Meaning/units and availability | Existing refresh/failure handling |
| --- | --- | --- |
| nflverse `stats_player_week` | Official-style counting statistics, yards, attempts, targets, receptions, TDs; only completed earlier appearances | Current data normally checked every 15 minutes; historical files daily. Raw download/check times, source URL, ETag and SHA-256 retained. Failed retrieval can retain old data with stale status. |
| nflverse PBP | Play type, player IDs, yardline 0–100, air yards/yards, completion and TD indicators, EPA, deletion/spike/kneel/sack/two-point flags | Completed games only, with `END GAME` marker. Rates trained on the preceding season. Participation and statistics can arrive or be corrected after the event. |
| NFL rosters and snaps | Team, position, active status, GSIS/PFR/ESPN IDs; offensive snaps and share 0–1 | Weekly roster selection never uses a later week. Season-roster and corrected weekly files are not a point-in-time transaction archive. Snap-only appearances become verified zero counting rows only when there are no corresponding player plays. |
| NFL schedules | Opponent, season/week, date, kickoff, total points, positive points favored for the home team | Team implied points = `(total + team points favored)/2`; away sign reversed. Historical schedule prices may be closing prices. A current download cannot establish when that line was originally known. |
| NFL NGS | Published rushing yards over expected/expected yards; pass time to throw in seconds; receiver separation in yards | Join by player, season, week and REG/POST to sampled games only; week-zero aggregates excluded. Missing coverage remains explicit. |
| FTN participation | Defenders in box and coverage shell on charted plays | Diagnostic splits only. The participation product used here is available after the postseason; no current-season coverage is invented. |
| MLB Stats API | Completed MLB game logs, PA/BF/outs/counts, schedule/home state, roster, confirmed lineup, probable pitcher, hand splits and season head-to-head | Receipts have source URLs, retrieval times, hashes and stale flags. Same-day player history excluded. Historical matchup aggregates use earlier completed seasons because the aggregate APIs do not honor requested date bounds. |
| ESPN NBA/WNBA/NHL/soccer | Completed player/team box scores, minutes/ice time, schedule timestamps, starting status, team identity, injury records | Source receipts and warnings retained. Missing statistics/DNP are distinct. Current injury and lineup inputs are excluded from historical validation. History generally fetches up to 25 previous games per matchup team, within 450 days. |
| Weather | Existing Open-Meteo venue/roof forecast or historical context: temperature °F and wind mph | Indoor neutral. Unknown, malformed or stale inputs contribute no invented temperature/wind effect. Historical corrected observations are not archived forecasts. |
| Public sportsbook totals | Existing ScoresAndOdds market feed: player/team/event-matched full-game total, book and prices | FanDuel-first with named fallback. No model projection fills a missing line. Pregame checks now require finite timestamps, retrieval within two hours, both starts still in the future, and schedule/feed agreement within 15 minutes where schedule time is supplied. |
| Live feeds | Current score, clock/inning, recorded stats, live opportunities and player status | Existing stale-feed checks and manual pause remain. Live player estimates require regulation state and adequate earlier history. Missing/invalid prior rates and impossible remaining minutes now withhold estimates. |

Publication timing differs from polling frequency. nflverse documents nightly PBP/player updates and later corrections, daily roster/NGS updates, and delayed participation availability. Those delays prevent treating reconstructed past boards as frozen pregame predictions. See the [official data availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).

## NFL weighted model: unchanged weights, corrected inputs

The output `modelScore`/`compositeScore` is a **0–100 research ranking**, not a probability, expected yardage, or betting value. Components normalize as `clamp(input / scale × 100, 0, 100)`. Player samples and opponent samples use up to five completed games before the selected week **and now also before the selected game date**. Samples may cross seasons. Offensive skill positions are eligible; passing markets require QB. Byes/inactive roster entries are excluded.

TD role score weights are red-zone share 35%, touches 25%, goal-line carries 15%, target share 15%, and historical TD/touch rate 10%. Context weights are implied team total 55% and opponent position TD allowance 45%. The final TD profile is 60% role + 40% context. Other markets retain final weights 50% volume + 30% recent production + 20% opponent allowance. Missing factors are now explicitly listed and available weights renormalized; absent player inputs cannot be replaced by opponent context alone. A recorded zero still receives its actual weight. The drought bonus stays zero.

| Market | Volume/role inputs and scale | Production input and scale | Opponent/context input and scale |
| --- | --- | --- | --- |
| Anytime TD | Red-zone touches/team red-zone touches ÷ .5; carries + receptions per game ÷ 25; carries from ≤5 yards per game ÷ 2; targets/team targets ÷ .35; rush+receiving TDs/(carries+receptions) ÷ .1 | Included in role factors | Implied points ÷ 35; rush+receiving TDs allowed to position per game ÷ 1.5 |
| Passing yards | Attempts/game ÷ 40 | Passing yards/game ÷ 320 | All opponent passing yards allowed/game ÷ 300 |
| Passing TDs | Red-zone attempts/game ÷ 6 | Passing TDs/game ÷ 3 | Passing TDs allowed/game ÷ 3 |
| Rushing yards | Carries/game ÷ 25 | Rushing yards/game ÷ 120 | Opponent yards/carry ÷ 6 |
| Receptions | Targets/game ÷ 12 | Receptions/game ÷ 9 | Receptions allowed to position/game ÷ 18 |
| Rushing attempts | Player/team carries ÷ .75 | Carries/game ÷ 25 | Carries allowed/game ÷ 32 |
| Receiving yards | Targets/game ÷ 12 | Receiving yards/game ÷ 100 | Receiving yards allowed to position/game ÷ 150 |
| Passing attempts | Player/team attempts ÷ 1 | Attempts/game ÷ 40 | Attempts allowed/game ÷ 40 |
| Completions | Attempts/game ÷ 40 | Completions/game ÷ 30 | Completions allowed/game ÷ 28 |
| Interceptions thrown | Attempts/game ÷ 40 | Interceptions/game ÷ 1.5 | Opponent interceptions/game ÷ 1.5 |
| Rushing + receiving yards | Carries + receptions/game ÷ 25 | Combined yards/game ÷ 150 | Combined yards allowed to position/game ÷ 190 |

Expected production and “debt” are separate from these score weights:

- TD expectation: prior-season rushing and **target** TD rates, separately for yardlines 0–5, 6–20, 21–40 and 41–100, applied to corresponding sampled carries/targets. `tdProb = 1 − exp(−expected TDs / appearances)`, uncalibrated and excluding return TDs. Debt is expected minus actual rushing/receiving TDs.
- Passing yards: prior-season mean yards per non-spike, non-sack attempt, grouped by air depth `<0`, `0–9`, `10–19`, `20+`, or unknown. Apply to earlier non-spike attempts; subtract weekly passing yards for debt.
- **Passing TD correction:** formerly applied targeted-pass TD rates to all modeled attempts. Now uses TDs per non-spike, non-sack **attempt**, including unassigned throwaways, by starting zone. This repairs a denominator mismatch rather than changing a weight.
- **Reception correction:** formerly used completion rates from all modeled pass attempts on assigned targets. Now uses completions per **assigned target** by depth. Passing-yard rates retain their attempt denominator.
- Rushing expected yards/debt use published NGS coverage: expected yards averaged over available NGS games; debt is negative published RYOE. The separate local zone-based rushing gap remains descriptive.
- Remaining count/yardage `projected` fields use historical means. None becomes a sportsbook total. Opportunity flags use existing debt thresholds TD 1, passing yards 30, passing TD 1, rushing yards 25, receptions 2; these are descriptive filters.

Other displayed fields do not secretly enter the score: yards per attempt/carry/target, air volume/depth, sack rates, red-zone team passing rate, end-zone accuracy, explosive/stuff-avoidance rates, catch/shallow-target rates, snaps, NGS time/separation, drought and FTN splits. Exact field formulas remain in `lib/definitions.mjs`.

### NFL direct forecast and existing adjustments

`forecast.mjs` retains last-three workload and up-to-ten efficiency. Passing uses attempts; rushing uses carries; receiving uses targets; combined yards sum rush and receiving components. Counts use efficiency one. TD occurrence applies the Poisson occurrence transform to expected rushing/receiving TDs plus mean special-teams TDs. The comparison remains the last-five mean (binary frequency for TD occurrence).

The error pool uses matching forecast sizes within 40% (at least 15 yards or two counts; TD probability width .15). It requires at least 100 nearby errors and five prior appearances; empirical residuals give count/yardage probabilities and a 10th–90th percentile interval. Counts are integer/nonnegative; yards can be negative. TD outcome calibration uses add-one smoothing. No random sampling is performed. Training-season overlap blocks fitted calibration/context use.

Existing team-workload fitting selects an opponent weight from `[0, .25, .5, .75, 1]` using earlier chronological data, checks a later block (at least 64 team-games and improvement in both MAE/MSE), and caps player changes to ±20%. Role changes ≥30%, snap-share changes ≥15 points, team changes, stale sources, inadequate errors, uncertain availability and experimental adjustments suppress automatic leans.

Teammate allocation remains a scenario: verified absence evidence shrinks toward recent role share using `without games/(without games+8)`; unsupported allocation uses 50% of role share. Per-player increases are capped at 50%, four targets or eight carries, and total allocation cannot exceed vacancy. Starting-QB uncertainty suppresses allocation. The original rating and box history are preserved. This audit makes adjusted ratings use the same centralized weights/contribution calculation as the base rating.

## MLB standard models

The original profile keeps up to 20 batter appearances / eight starts, and `0.6 × sample mean + 0.4 × recent mean` (recent five batters / three starts). This deliberately weights recent games twice; it is an explicit recency weighting, not independent evidence. Scales remain HR .5, hits 1.6, K 8, bases 3, RBI 1.2, runs 1.2, H+R+RBI 3.5, SB .5, singles 1.1, doubles .5, walks .9, batter K 1.8, outs 21, ER 4, hits allowed 7, walks allowed 3. Rating = capped estimate/scale × 100.

The separate direct count regression retains all 16 markets. Its inputs are same-season appearances in the previous 100 days, capped at 60 batter appearances / 20 starts, with minimum eight/four. Exposure is PA/BF. Long and recent rates receive 40 PA / 60 BF of prior exposure. Six features are:

1. Log long rate / fitted prior rate.
2. Log recent rate / long rate.
3. Log recent workload / fitted prior workload.
4. Log long workload / fitted prior workload.
5. Home-game indicator.
6. Rest days capped 1–14, divided by seven.

Features are centered/scaled with saved training means/SDs; the intercept and six coefficients produce a log mean, exponentiated with the existing bounds. Exact coefficients, priors, centers, scales, dispersion and selection results are in `lib/artifacts/mlb-model.json`: 2022 priors, 2023 fit, 2024 regularization/dispersion selection, 2025 test. This audit does not refit them. Poisson, negative-binomial or continuity-corrected normal count distributions provide over/under/push probabilities and intervals.

Existing supporting layers remain:

| Layer | Existing calculation and constraints |
| --- | --- |
| Fitted NFL/MLB context | Opponent rate/league rate − 1; outdoor `(temperature−65)/20`; wind/10. Learned residual coefficients × max(1, base projection), enabled only by saved validation. Invalid/stale feature terms now stay neutral and produce warnings. |
| Batting order | Confirmed pregame slot, earlier own/opponent PA distributions and workload ratio, capped ±20% |
| Starter exposure/quality | Prior BF and batting slot estimate starter share; starter allowed rate shrunk by 200 BF toward staff rate; relative effect capped ±20% before exposure weighting |
| Pitch budget | Recent-three pitch count × historical BF/pitch, bounded relative to observed BF; projection adjustment capped ±20% |
| Opposing lineup | Nine uniquely confirmed batters; each needs eight games, with 100 PA prior; lineup/team rate ratio capped ±15% |
| Pitcher handedness/head-to-head | Reliability PA/(PA+120) and PA/(PA+80), starter-exposure weighted, full-game effects capped ±7.5% and ±2.5%; combined ±10% |

These are disclosed experimental scenarios, not separately calibrated causal effects. Same-day/future production and actual final lineups cannot be inserted into prior features. New validation rejects unknown participation, invalid exposure/priors, negative/fractional count statistics, extra-base hits exceeding hits, and conflicting outs/innings rather than converting them to zero. Baseball innings remain thirds: 6.1 = 19 outs.

## NBA, WNBA, NHL and soccer standard models

All existing markets in `lib/sports/config.mjs` remain: NBA 11, WNBA 15, NHL seven, soccer nine. Composite markets sum their actual fields before estimating joint count variance; component probabilities are not multiplied.

- Sample: up to 20 prior appearances, minimum five. Rate = `(production + five mean appearances of exposure × positional prior rate)/(observed minutes + prior exposure)`. The positional prior comes from fetched history, not a complete league census. WNBA uses WNBA data and gates.
- Minutes: 60% recent-five + 40% full-sample; NBA cap 44, WNBA 40, NHL skaters 32/goalies 60, soccer 90. Team markets use regulation duration. Basketball roster minutes can only scale down to observed team minutes including historical overtime.
- Opponent: prior-eight-game shrinkage; ratio capped .85–1.15 with five usable games. Basketball pace uses FGA + .44 FTA − offensive rebounds + turnovers. Pace ratio capped .92–1.08; opponent allowance is pace-adjusted to reduce duplicated pace information.
- Venue/rest: observed per-minute rates, shrunk by five appearances, quarter-strength relative effect, each capped .95–1.05. Short rest is <1.5 days except soccer <3 days.
- NHL power-play usage: recent/long PP minutes, effect coefficient .1, capped .95–1.05. Soccer extreme-weather scenario: wind ≥25 mph factor .95; temperature ≥95°F or ≤25°F factor .97. Indoor weather neutral.
- Combined supporting factor capped .7–1.3. Mean = adjusted rate × projected minutes × factor, floor .0001. Prior count variance gives NB dispersion `max(0,(variance−mean)/mean²)`, capped at two; otherwise Poisson. Thresholds are research benchmarks, not market prices.
- Confirmed role can replace minutes with earlier games in that role; the same role change does not also receive injury-minute allocation. Same-role absence allocation starts at 25% of vacancy; observed DNP history uses an eight-game shrinkage denominator, with per-player caps. Basketball production-rate absence effects need three games together/two explicit DNP games and cap ±25%.
- Attempt/conversion candidates replace the generic rate within ±25%; frozen league-specific validation gates decide whether they are active. NBA points is enabled by a convenience diagnostic; WNBA points/threes remain disabled. That NBA gate has no independent untouched holdout and was not retuned here.
- Confirmed opposing goalie affects goals only, relative to the team's goalies, with 300-shot NHL / 50-shot soccer shrinkage and .8–1.2 cap. Missing confirmation is neutral. Soccer prefers adequate same-competition history; mixed competition remains disclosed when inadequate.

Current lineup, injury, roster-minute and weather inputs are now centrally withheld during historical validation and for stale/non-pregame inputs. Statistical rates/context from earlier games remain. Timestamp comparison uses actual instants, fixing offset-format leakage. Count fields reject invalid values. Added contribution deltas sum from baseline to final mean and identify the two largest changes in the existing explanation.

## Deterministic live player models

These remain separate from both pregame forecasts and game simulations. Their existing weights are untouched:

- NFL: prior five-game role / ten-game efficiency. Live role weight ≤70% with a 20-opportunity denominator and first-15-minute ramp; efficiency weight ≤20% with 40-opportunity denominator. Live rate capped 0–2× history. Pace is 65% historical/35% bounded live pace after five minutes. Pass/run mix live weight ≤50% with 30-play denominator; deficit/21 × elapsed fraction × .12 changes pass share, capped ±.12. Possession changes remaining plays by ±1.5, tapering late.
- NBA/WNBA: prior five-game playing time, up to 15 same-team appearances for production. Live role weight ≤50%; remaining team minutes capped at five × clock. Live production weight minutes/(minutes+100), bounded live rate 0–2× history.
- MLB: up to 30 batter games / ten starts. Batter remaining PA = remaining batting outs × 1.43 / nine slots. Pitcher budget uses recent-five pitches, bounded 40–110, less pitches thrown, converted by historical pitches/BF and capped by regulation outs. Live rate weight PA/(PA+50) or BF/(BF+100), capped live rate 0–2× history.

New guards withhold impossible clocks, invalid NFL priors, invalid basketball remaining minutes and negative/fractional MLB workload. Basketball prior timestamps now compare instants. They keep recorded values and output fields. Full earlier live snapshots are not available for an accuracy comparison; synthetic regression tests verify the arithmetic/guards, not live predictive accuracy. In-game role changes, true pregame roster publication timing, overtime and late-game effects remain limitations described in the existing live model docs.

## Odds, probability and overlapping information

American prices still convert to decimal as `1 + American/100` for positive odds and `1 + 100/abs(American)` for negative odds. Paper returns use the saved price: win decimal−1, loss −1, push zero; DNP/voids excluded. Existing tests cover these formulas. Standard models do not use prices as probabilities or calculate a vig-adjusted edge. Their fixed 60% research rule is not an expected-value calculation. No pricing, payout, vig or profitability formula was changed.

Correlations remain explicit: NFL touches/targets/red-zone/goal-line usage and production overlap; MLB recent and long rates overlap; opponent rates, minutes and pace overlap; absence/role changes can be represented in recent history. Existing shrinkage, bounds, role precedence and pace normalization reduce some duplication. This audit adds no unvalidated decorrelation or new weights. Adequate archived pregame cohorts are required to test whether further changes improve predictions.

## Tests and evaluation

Run `npm test` and `npm run check`. Focused new tests cover exact unchanged weights/contributions, missing vs zero inputs, denominator populations, future-date/training cutoffs, conflicting counts, current-input leakage, invalid/stale quotes, neutral malformed context, direct live guards, paired metrics and recursive simulation separation. An older injury fixture used fractional receptions/TDs; it now uses valid integer game counts while retaining its behavioral assertions.

Final audit verification: 95/95 focused model, direct-live, simulation-boundary and reporting-adapter tests passed; `npm run check` and `git diff --check` passed. The full suite passed 319/321 tests. The two remaining failures are navigation expectations in `test/site-layout.test.mjs` (link order) and `test/trends-dashboard.test.mjs` (the old workspace-switch markup), in UI files changing separately in this shared workspace. They are not treated as a clean full-suite result. Local logs are `reports/standard-boundary-tests.log` and `reports/standard-model-tests.log`. Hash comparisons confirmed all seven pre-existing fitted/validation artifacts are unchanged, and evaluated model-file hashes still match the report.

The offline comparator writes only `reports/standard-model-audit.json`, including all market metrics, reliability bins, time periods, sample counts, paired error intervals, source receipts and before/after code hashes:

```sh
node --max-old-space-size=6144 scripts/evaluate-standard.mjs --before .research/standard-model-before
```

The local `.research/standard-model-before/lib` copy freezes the starting working tree, including pre-existing work. It is ignored by Git. Future runs need an equivalent before-change copy. This script uses existing cached files, performs no network requests, and never overwrites fitted artifacts. No final-period tuning occurs.

NFL uses 2024 rate training and a 2025 reconstruction, with current injuries/weather excluded. MLB rechecks the frozen model on 2025. WNBA rechecks the existing post-August-14 2025 period. Other sports report the last 30% of cached chronological games as a convenience diagnostic. These periods have previously been inspected; they are **regression checks, not new untouched holdouts**. Historical rosters, source corrections and outcome-conditioned participation prevent claiming a faithful pregame replay. The weighted NFL score is not scored as a probability; only its separate TD estimate receives probability metrics.

See [all measured results](standard-model-results.md) and the local machine-readable report for MAE/RMSE, Brier score, log loss and calibration. Game-level paired intervals are approximate and do not eliminate correlation from repeated players. No weight changes were made. No improved accuracy, profit or betting edge is claimed from unchanged or limited diagnostic results.

## Files and compatibility

Calculation/input changes: `lib/model.mjs`, `lib/rating.mjs`, `lib/forecast.mjs`, `lib/nfl-opportunities.mjs`, `lib/context-model.mjs`, `lib/pregame-quote.mjs`, `lib/mlb/{model,markets,forecast-core,forecast,opportunities}.mjs`, `lib/sports/{model,normalize}.mjs`, `lib/live-{nfl,sports}-model.mjs`.

Integration/explanation changes: `lib/source.mjs`, `lib/mlb/source.mjs`, `lib/predictions.mjs`, `lib/definitions.mjs`, `public/app.js`. Neutral helper extraction: `lib/game-time.mjs`, `lib/sports/events.mjs`, two import paths in `lib/simulation-source.mjs` and the scheduling-helper import in `lib/simulation-props.mjs`. The separately developed simulation page can display existing player forecasts through its reporting adapter; those forecasts do not enter the game simulation or depend on its draws, seed or results. Additive contribution/quality fields use the existing evidence panel and explanations. Supported routes, market names and output fields remain; invalid/unavailable numeric outputs now deliberately return null. Existing full-data weights and scale constants are preserved. Sources expose their stale/availability receipts.

Tests/evaluation/docs: `test/standard-model-audit.test.mjs`, updated version/count fixtures in `test/{forecast,mlb,nfl-opportunities,wnba}.test.mjs`, `scripts/{evaluate-standard,standard-metrics}.mjs`, the `evaluate:standard` package script, this audit and its results document. Existing unrelated workspace edits are not part of this audit.

Serving versions advance to `independent-v2.1`, `workload-opportunities-v4.1`, `mlb-opportunities-v2.1`, `multi-sport-opportunities-v2.1` and `wnba-opportunities-v1.1`. Forecast versions keep saved standard records distinguishable; the frozen validation artifacts retain their original version labels. No simulation code, output or result store is imported or merged into a standard model.

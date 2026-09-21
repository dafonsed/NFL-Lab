# MLB count regression v1

The board now presents estimated over/under probabilities and expected counts from a trained model. The old 0–100 form score remains a comparison statistic, never a probability. There are separate models for all 16 supported markets.

## Provenance

- Player population: MLB Stats API `/api/v1/sports/1/players?season=YYYY` for each season; no selection based on surviving to the test season.
- Completed regular-season games: `/api/v1/schedule?sportId=1&season=YYYY&gameType=R`.
- Outcomes and historical features: `/api/v1/people?personIds=...&hydrate=stats(group=[hitting,pitching],type=[gameLog],season=YYYY,gameType=R,sportId=1,limit=1000)`.
- Live schedule, probable pitchers, rosters and box scores use the existing official MLB feed. Public totals still come from ScoresAndOdds, preferring FanDuel. Neither sportsbook data nor the reference application supplies model training outcomes.
- `lib/artifacts/mlb-model.json` and `/api/mlb/model` contain every training source URL, SHA-256 checksum and retrieval timestamp, plus coefficients, standardization, selection results and complete evaluation.
- Player `/api/mlb/evidence` includes `forecastGameLog`, matching game IDs, recorded inputs and fitted contributions. The model window (up to 60 appearances / 20 starts) differs from the displayed recent-form log (20 / 8); the UI labels each explicitly.

Raw downloaded source files stay in ignored `data-independent/`. Only the fitted artifact and receipts are deployed. Checksum receipts identify the downloaded response; later MLB corrections can change a fresh response.

## Fixed development split

2022 supplies league-average per-opportunity priors and typical workload. 2023 fits coefficients. 2024 selects L2 regularization from 0.0001, 0.001, 0.01 by Poisson negative log likelihood, and selects/estimates the count distribution. 2025 is scored only after those choices are fixed. The 2025 results are retrospective reconstructions from corrected statistics downloaded today, not archived pregame predictions.

## Features and fitting

The same `forecastInputs` implementation is used in training and serving. Only completed regular-season records strictly before the target calendar date, in the same season and preceding 100 days, qualify. Same-day doubleheaders are excluded; both games of earlier doubleheaders qualify. Pitcher records must be actual starts. The model needs 8 prior batter appearances or 4 starts and retains at most 60 / 20.

For each market, rate = (observed count + league prior rate × prior exposure) / (observed exposure + prior exposure). Exposure is plate appearances for hitters and batters faced for pitchers. Prior exposure is fixed at 40 / 60. Recent rates and workload use 5 appearances / 3 starts. Six input features are:

1. Log(long rate / league rate).
2. Log(recent rate / long rate).
3. Log(recent workload / league workload).
4. Log(long workload / league workload).
5. Home indicator.
6. Days since last appearance, capped at 14, divided by 7.

Inputs are standardized using 2023 means and standard deviations (minimum 0.01). Newton/IRLS minimizes mean Poisson negative log likelihood plus L2 penalty; the intercept is unpenalized. Expected count is exp(intercept + weighted standardized inputs), with the log bounded to −9 through log(50).

Distribution candidates are Poisson and, if excess variance exists, negative binomial. Dispersion alpha = max(0, sum((actual−mean)^2−actual) / sum(mean^2)) on 2024. Pitcher outs additionally considers a discretized normal distribution with variance factor = average((actual−mean)^2 / max(0.05,mean)), measured on 2024. Distribution choice minimizes 2024 outcome log loss. Normal mass below zero is allocated to zero. Count support is 0–200 and normalized. Probabilities separately sum outcomes above, below and exactly equal to the actual posted total. Central 80% intervals use the 10th and 90th percentiles, whose observed 2025 coverage is reported.

## What validation means

Point comparisons report MAE and RMSE against the old 60% sample / 40% recent mean, on the identical eligible cohort. Probability comparisons use predeclared half-unit thresholds (`BENCHMARKS` in the core). Brier scores compare the model with (a) a Poisson distribution centered on the old form mean and (b) the fixed 2023 league over frequency. Calibration bins show average forecast versus observed over frequency. Threshold pairs can reuse a player-game; they are not independent games or sportsbook bets. All markets, including worse results, are shown. No profitability, odds advantage or live betting hit rate is established.

The v1 model omits opposing-pitcher quality, opposing lineup, handedness, ballpark, Statcast, weather, injuries and lineup-slot adjustments. Forecasts are conditional on a comparable appearance/start. Bench/unconfirmed status, limited samples, recent workload decline, stale input, postseason, live/reconstructed games and absent/in-play lines suppress research leans. A 60% threshold is an explicit fixed UI research rule, not a learned profitable cutoff. Coefficients stay frozen; new eligible game logs update the features every board refresh. Retraining is an explicit evaluation step.

## Reproduce

`npm run train:mlb` downloads/caches all four official seasons and fits/evaluates the artifact. This can take a few minutes and requires internet access. `npm test` exercises leakage exclusions, distribution mass and pushes, model fitting, input provenance, missing data and serving behavior. `npm run check` checks the server and UI scripts. Historical models are unavailable on dates through 2024-12-31 to avoid presenting development-period predictions as out-of-sample.

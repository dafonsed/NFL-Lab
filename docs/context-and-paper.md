# Opponent, weather, availability and paper returns

This extension preserves the original NFL rating weights and the trained MLB base model. It adds learned context corrections, explicit availability handling, and prospective records at captured sportsbook prices.

## Reproduce the models

Run `npm run train:context` after the existing MLB historical download. The script writes `lib/artifacts/mlb-context.json` and `lib/artifacts/nfl-context.json`. `--mlb-only` or `--nfl-only` can scope a run.

The split is 2022 league priors, 2023 correction fitting, 2024 penalty selection and distribution calibration, and a 2025 comparison. Because 2025 was already examined for the base models, this is a reused test set, not a new untouched holdout. A promotion gate was added after initial diagnostics: the context correction is enabled only if both its MAE and MSE beat the base on 2024. The gate does not select on 2025. Other models retain their base point and distribution while displaying and saving the candidate correction for inspection.

The three features are stabilized opponent production divided by the 2022 league rate minus one; outdoor Fahrenheit temperature minus 65, divided by 20; and outdoor wind in mph divided by 10. Missing values and indoor weather contribute zero. Ridge regression, with penalties chosen from 0.001, 0.01, 0.1 and 1, fits `(actual - base) / max(1, base)`. The correction adds `max(1, base) * sum(feature * coefficient)` to the base. Bounds are positive counts, at most 50 for MLB, and at most 1 for NFL TD occurrence. Coefficients and the exact contributions appear in player evidence.

MLB uses the opponent's previous 20 regular-season games strictly before the selected calendar date, in the current season, with a minimum of five. Pitcher props use opponent batting production per PA. Batter props use production allowed by the opponent's entire pitching staff, reconstructed from opposing teams' batting logs. Rates are stabilized with 200 PA at the 2022 league rate. For pitching outs the input is opponent batting strikeout rate; the relationship to outs is learned. This does not separately model a probable starter, handedness, park, batting order, or individual defender absences.

NFL uses position-specific production allowed by the opponent over its previous five completed games, excluding the selected week/date, stabilized with three league-average games. At least four prior opponent games are needed. Enabled corrections receive 2024 residual calibration; inactive corrections keep the base residual pools. Report all market/position outcomes, including deterioration. Some sparse market/position combinations have no fitted correction.

MLB calibration chooses Poisson, negative binomial, or (outs only) discretized normal on 2024. The report compares both point MAE and fixed-threshold Brier scores against the trained base model. NFL context reports compare point errors; their prospective probability calibration is recorded separately from historical MAE. Neither comparison establishes betting profitability.

## Sources and time boundaries

- MLB official Stats API: season player game logs already used by the base model; `/teams/{id}/stats?stats=gameLog&group=hitting&season=YYYY&gameType=R` supplies live opponent histories. The app fetches the 30 MLB teams and reconstructs allowed production from the opposing offense, so RBIs and combined hitting props retain their exact definitions. Completed-game membership comes from the official schedule. Source receipts retain URLs, times and SHA-256 hashes.
- MLB official schedule hydrated with `weather,venue(location,fieldInfo)` supplies historical observations, roof type and ballpark coordinates.
- nflverse weekly statistics and schedules supply NFL historical position production, roof, temperature and wind. Schedules: <https://github.com/nflverse/nflverse-data/releases/tag/schedules>. Weekly stats: <https://github.com/nflverse/nflverse-data/releases/tag/stats_player>.
- Open-Meteo supplies the live hourly forecast nearest scheduled start, in Fahrenheit and mph, at MLB park coordinates or the verified NFL stadium city. NFL city/state is taken from ESPN event venue data and matched exactly to the geocoder; ambiguous/unsupported locations are unavailable. Source and valid-hour links appear in details. <https://open-meteo.com/en/docs>.
- Historical weather is an observation, not a forecast archived before the game. Retrospective weather-conditioned improvements are not evidence that live forecast weather will improve bets. Future records save the actual pregame values.
- Closed/domed roofs have zero outdoor effects. Retractable roofs without confirmed state, unknown roofs, missing hours, failed requests and unresolved venues get no weather correction and no research lean. No current weather is applied to old games.
- ESPN NFL and MLB injury endpoints supply public current availability. NFL joins ESPN athlete IDs from nflverse rosters. MLB requires an exact normalized full name and team match, rejects ambiguity and handles Arizona's MLB/ESPN abbreviations. Neither sport treats an absent injury listing as confirmed health. Current reports are never applied retroactively.

Injuries are an availability adjustment: a reported out/IL/IR/inactive player receives no forecast; uncertain statuses keep a participation-conditional forecast and suppress the lean. We do not invent medical performance multipliers or redistribute injured teammates' volume without validation.

## Prospective paper returns

`/paper?sport=mlb` and `/paper?sport=nfl` show newly captured qualifying research leans. `/api/paper` provides the records and source evidence. This is a hypothetical ledger, not placed bets or a sportsbook account statement.

The public ScoresAndOdds comparison supplies each bookmaker's same-line `over` and `under` American prices. FanDuel remains preferred, and a fallback is explicitly named. Arizona-specific pricing is not independently verified. A missing or invalid price cannot be filled from implied probability, an opposite side, another bookmaker, or a postgame quote.

Capture requires a model lean that passed its data/availability checks, a non-stale pregame quote fetched within two hours, matching scheduled start within 15 minutes, and a game in the next seven days. Snapshots are immutable, once per market and UTC hour when the board is visited or a scheduled job runs. Results select the first qualifying captured selection per player/game/market across snapshots. Prices, chosen side, model/artifact, point, probabilities, weather/opponent inputs and injury status are frozen. New versions cannot rewrite old records.

Each selection risks 1 unit. At American +A a win earns A/100; at -A a win earns 100/A; a loss is -1, and a push is 0. ROI is net profit divided by settled stake (including pushes). DNPs are void and excluded from stake; unfinished, suspended and missing-stat games are not losses. Official book participation, pitcher-start, delay and void rules can differ, so these are clearly labeled paper results. Correlated props count separately. Reports group returns by saved model version.

Storage reuses the private Vercel Blob integration, with separate production/preview prefixes. Locally it uses ignored files. NFL scheduled capture runs at 10:00 UTC; MLB at 20:00 UTC. Board visits also trigger capture. Lineup/price availability limits coverage; no closing-line claim is made. Every record includes its captured time, exact price and source. No historical profitability is fabricated from older line-only records.

## Checks

`npm run check` and `npm test` cover strict time cutoffs, correct opponent sides/positions, roof and missing-data handling, forecast-hour matching, injury joins/unavailability, immutable capture across instances, odds arithmetic, push/void/missing results, and existing player/source behavior. Live UI/API checks verify source-to-player evidence and both paper report routes before deployment.

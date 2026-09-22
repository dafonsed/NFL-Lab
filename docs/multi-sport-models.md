> Current opportunity/availability extensions and their separate validation: [Opportunity upgrades](opportunity-upgrades.md). The original model methodology below remains the baseline reference.

# MLB matchup extension and NBA / NHL / soccer

The new pages are `/nba`, `/nhl`, and `/soccer`. They share date and matchup controls, but use separate sport market definitions and sport-specific context. Soccer covers Premier League, La Liga, Bundesliga, Serie A, Ligue 1, MLS and Champions League. Schedules refresh automatically on visits; no season-specific fixture list is hardcoded. Forecasts do not imply a demonstrated betting edge.

## MLB individual pitcher inputs

`lib/mlb/matchup.mjs` reads MLB Stats API `statSplits` (`vl`, `vr`) and season-level `vsPlayer` records through batched `/people` hydration. Pitching hand and batting side come from MLB person records; the opposing pitcher is the scheduled probable pitcher. Changes in the probable pitcher rebuild the matchup on refresh.

The APIs ignore date bounds on these aggregate types. For historical games, only completed seasons before the selected year enter the estimate. Upcoming games may use statistics available now, including the current season. Career-total rows are never used. Handedness uses up to three seasons; head-to-head uses up to five. Both are regular-season statistics. The evidence panel discloses the period, PA, H/AB, HR, strikeouts, source URLs, and before/after projection.

Each market uses its own production per PA. Missing fields are not zero. The split is compared with the batter's overall rate from the same handedness dataset. Sample reliability is PA/(PA+120) for handedness and PA/(PA+80) for head-to-head. The effect is limited to half of a game's expected PA to allow for the bullpen. Full-game caps are ±7.5% for handedness and ±2.5% for head-to-head, at most ±10% combined. These are explicit conservative rules, not fitted optimal coefficients. They adjust the trained MLB projection and recompute its distribution; new leans are withheld while the new layer lacks separate probability calibration. Published 2025 tests still describe the base model, not this extension.

## New sport model

Version: `multi-sport-rate-v1`. The model estimates count rates from actual prior box scores with a five-appearance positional-rate prior. Expected minutes combine 60% of the last five appearances with 40% of the full sample (up to 20). The rate prior is calculated from the disclosed fetched history, not described as a complete league population. Mean = stabilized rate × expected minutes × bounded context factors. Prior count variance estimates negative-binomial dispersion when variance exceeds the mean; otherwise the distribution is Poisson.

- NBA: points, rebounds, assists, threes, PRA, PR, PA, RA, steals, blocks and turnovers. Opponent production, estimated possessions, home/away, short rest and teammate absences support the projection. Possessions use FGA + 0.44 FTA − offensive rebounds + total turnovers. Pace is adjusted for game duration, and opponent production is adjusted to avoid counting the same pace effect twice.
- NHL: shots on goal, goals, assists, points, blocks, hits and goalie saves. Uses recorded ice time, power-play time for attacking markets, opponent production, rest, venue and teammate availability. Goalie save context uses opponent shots. A starting goalie is not assumed from roster order.
- Soccer: shots, shots on target, goals, assists, fouls, yellow cards, goalkeeper saves, team goals and team corners. Uses recorded appearances, minutes reconstructed from substitutions, opponent production, venue, short rest, and bounded extreme-wind/temperature scenarios. Confirmed starters can use their prior starting-minute sample. Domestic and European club games supply history, so new Champions League entrants are not treated as having no prior football history. Cross-competition strength differences remain a limitation. Friendlies and extra-time matches are excluded from history. Extra-time final props are withheld pending regulation-only statistics.

NBA/NHL teammate allocation uses recently vacated same-role minutes, capped per recipient and within a shared vacancy budget. Historical confirmed DNP records support the estimate when available; missing players are not treated as confirmed DNP. Soccer and goalie replacements require starting-lineup confirmation rather than automatic vacancy allocation. All new models are experimental and withhold automatic betting leans pending prospective validation.

## Sources, missing data and verification

ESPN public scoreboard, team schedule, summary, roster and injury responses provide the new sports' source data. Every response has a URL, retrieval timestamp, SHA-256 hash and stale flag. A force refresh checks availability again. Missing statistics are unavailable; a recorded zero is zero; DNP is separate. Current injury reports are applied only to upcoming/current games, never retroactively to historical forecasts. Out players are excluded, uncertain players are labeled, and failed reports retain the last known unavailable status. Soccer injury feeds can be incomplete; match-specific lineups are a separate check.

Indoor venues explicitly have no outdoor weather effect. Outdoor venues use a verified stadium-city match from Open-Meteo geocoding and its hourly forecast near kickoff. Ambiguous cities, unknown roof state and unavailable forecast horizons produce a visible missing-input status, not invented conditions. Historical weather is not presented as an archived forecast.

Public NBA/NHL prop listings come from ScoresAndOdds. Matching requires scheduled start, home/away teams, player name, player team, full-game market and a recognized book. FanDuel is preferred. These are public US listings, not independently verified Arizona pricing. Unavailable lines stay blank. Soccer currently has no connected public sportsbook prop feed; fixed research thresholds are labeled separately and are never graded as bets.

Each matchup shows a rolling diagnostic on the last five fetched historical games with eligible players. Every test prediction uses only earlier completed games. MAE, recent-five baseline MAE, Brier score and interval coverage are displayed even when unfavorable. This limited diagnostic does not establish league-wide accuracy or profitability. Current injuries, selected-game starting status and future weather do not enter the diagnostic.

Pregame visits save immutable hourly snapshots of model inputs, source receipts and any quoted line in private Vercel Blob (local files in development). `/api/sports/performance` and the Pregame records button show the first saved forecast per player and model version and its later reported result. No historical prediction is invented. These snapshots are visit-driven, not a guarantee of complete scheduled capture or closing prices.

Not comprehensively available from these feeds: player-level xG / shot-quality tracking, confirmed hockey lines, defensive assignments, confirmed penalty takers, travel, all medical restrictions and coaching decisions. These gaps are disclosed. Adding data without reliable provenance or validation is not assumed to improve predictions.

# Live game odds and fair prices

`live-game-distribution-v1` adds a separate game forecast to `/nfl/live`, `/nba/live`, `/wnba/live`, and `/mlb/live`. Player projections retain their existing methods. The game panel shows sportsbook moneyline, spread/run line and total prices alongside estimated fair prices, probabilities, pushes, and explanations generated from the actual numeric inputs. These are estimated fair odds, not known true probabilities.

## Inputs and independence

The model never consumes sportsbook prices when generating outcomes. Prices only enter the subsequent comparison. It uses completed team scores from nflverse schedules, ESPN basketball team schedules, or MLB's official schedule. The selected game, entire selected date, future games, incomplete games, exhibitions, duplicate IDs, and results older than 450 days are excluded. All history cutoffs are enforced again in the model, even when the loader already filtered history. Current scores are retained in every simulated finish.

| Sport | Prior games/team | Minimum | Recency half-life | League shrinkage weight in equivalent games | Initial points/runs per team | Initial score SD |
|---|---:|---:|---:|---:|---:|---:|
| NFL | 16 | 5 | 180 days | 6 | 22 | 11 |
| NBA | 30 | 8 | 90 days | 10 | 112 | 13 |
| WNBA | 30 | 8 | 90 days | 10 | 81 | 11 |
| MLB | 40 | 10 | 60 days | 15 | 4.5 | 3.2 |

Each earlier result receives `2 ^ (-ageDays / halfLife)` weight. League scoring blends the available historical pool with 40 games of baseline weight. Home advantage is the weighted home-minus-away score, shrunk with 80 zero-advantage games and bounded to ±8% of initial league scoring. Basketball's historical pool comprises the selected teams' schedules, not a complete league dataset.

Team offense and defense are venue-adjusted weighted scoring/allowance, shrunk toward the league baseline. The matchup scoring expectation averages a team's offense and its opponent's allowance, then applies half the home advantage with the appropriate sign. This is a simple matchup adjustment, not an opponent-adjusted regression. Expectations are bounded to 45–165% of the league mean. The displayed history percentage is effective weighted observations divided by observations plus shrinkage weight. The constants are specified assumptions, not fitted optimal hyperparameters.

## Finishing-score distributions

There are 12,000 deterministic simulations per snapshot. A seed includes game state, prior inputs and model version; changing a sportsbook quote cannot change the independent forecast.

- **NFL:** remaining expected points scale with regulation seconds remaining. Possession shifts up to one expected point between teams, tapering inside ten minutes; halftime has no possession shift. Scoring events follow a compound Poisson process with 2/3/6/7/8 points and specified probabilities 2%/30%/4%/57%/7%. These preserve key scoring increments but do not model drives or field position. Tied regulation finishes use a simplified overtime terminal outcome: home win chance is `0.5 + expected scoring difference / 80`, bounded to 30–70%; regular-season ties persist 8% of the time; otherwise the winner adds three or six points equally. Postseason ties always resolve. These overtime weights are assumptions, not an implementation of the NFL possession rules.
- **NBA/WNBA:** remaining scoring is a rounded, nonnegative normal draw. Variance is estimated from earlier team scoring and shrunk toward the sport baseline. It scales with remaining clock, with an additional term for uncertainty in the team scoring expectation. Ties continue through simulated five-minute overtime periods (up to 12). Current shooting percentage is not extrapolated.
- **Pace:** when both teams have valid current volume and at least 15% of regulation has elapsed, 30% of the observed pace ratio is blended with the baseline, limiting the multiplier to 0.925–1.075. Baselines are 64 NFL plays, 99 NBA possessions, or 80 WNBA possessions per team. Basketball uses `FGA + .44 FTA − offensive rebounds + turnovers`. Missing pace leaves a neutral multiplier and never becomes zero pace.
- **MLB:** simulate remaining half-innings with geometric runs per out (a negative-binomial inning) based on matchup scoring / nine innings. Current runner scoring probabilities are specified at 30%/48%/70% for first/second/third, scaled by outs remaining / three. A home lead skips an unnecessary final half-inning. Walk-offs cap the home margin at one, so walk-off home-run overshoots are a known omission. Up to 20 extra innings are simulated; regular-season extras include a runner on second. These are approximations, not a batter-level transition model. Current extra innings, inning transitions, incomplete base states, or non-nine-inning games withhold estimates.

NFL/basketball estimates pause in overtime or the final two minutes. All sports pause on interrupted games, missing scores, insufficient history, or stale game/history data. Game history availability is separate from player history availability, so a missing player log does not invalidate a complete team-score history. Independent team forecasts remain available when book prices are missing.

## Prices and explanations

For every exact quoted selection, simulations count wins, losses, and pushes. Symmetric half-observation smoothing prevents a finite simulation from claiming certainty. The table's model probability excludes pushes: `P(win) / (1 − P(push))`. Fair American odds are converted from that conditional probability and capped at ±19900 for display. Team cards show unconditional win probability and tie probability separately.

The market probability normalizes the two American-price implied probabilities to sum to one. This removes the displayed overround proportionally; it does not establish the bookmaker's true probability. It is only computed for matching opposite spread thresholds or identical totals. Missing or mismatched opposite selections have no no-vig probability or difference. Difference is conditional model probability minus no-vig market probability in percentage points, not a validated betting edge.

Only fresh explicit `.live` quote nodes are compared. Pregame/archived prices are labeled and never compared with a live model. Quote retrieval time is not a verified bookmaker update time. The browser independently expires game estimates and price comparisons after 45 seconds, including upstream cache age, even with auto-refresh disabled. A failed refresh hides old fair values and explanations.

Reasons state the actual score/clock or inning/base situation, prior sample counts, weighted scoring/allowance, shrinkage weight, matchup scoring expectations, pace, possession/scoring assumptions and resulting winner/total distribution. Each market also shows the projected total or home margin alongside the exact quoted threshold. The middle 80% scenario range is not labeled a calibrated confidence interval. No stakes or guaranteed profits are recommended.

## Validation

Run `node scripts/evaluate-live-game.mjs 2025` (or `2024`) against locally available nflverse schedule/play-by-play files. This chronological retrospective diagnostic uses approximately 45, 30 and 15 minutes remaining per game; each prior only sees earlier dates. Final tied games are excluded from the binary win metric. It uses 2,000 simulations per snapshot. The comparison baseline is a specified score/clock logistic formula, not a sportsbook or a trained state-of-the-art model.

Initial local results:

| Season | Games | Snapshots | Model Brier | Score/clock Brier | Model log loss | Final total MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2024 | 246 | 738 | 0.1569 | 0.1642 | 0.4676 | 7.86 points |
| 2025 | 247 | 741 | 0.1741 | 0.1815 | 0.5221 | 7.98 points |

These cover games present in the local data with eligible checkpoints/history, not necessarily every game of the season. Checkpoints from a game are correlated. Corrected historical files do not recreate feed latency or point-in-time publication. There are no synchronized sportsbook prices, profit results, held-out live calibration fit, or NBA/WNBA/MLB outcome validations. Lower retrospective Brier scores are encouraging but do not establish a betting advantage. The UI therefore retains its experimental label.

`test/live-game.test.mjs` checks history exclusion, deterministic market independence, probability conservation, spread signs, pushes, price conversion, no-vig matching, all four sport paths, missing/stale guards, browser expiry, HTML escaping, and API integration. Existing player tests remain separate.

Reference: [nflfastR model inputs](https://nflverse.r-universe.dev/nflfastR/doc/manual.html) illustrate the richer down/distance, field-position, timeout and possession information used by established NFL win-probability models. This implementation does not claim equivalence to that model.

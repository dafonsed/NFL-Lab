# NFL live player props — live-workload-v1

The **Live** tab at `/nfl/live` is a separate, experimental model for in-progress NFL player props. It does not reuse the pregame rating as a live probability, use pregame error calibration for in-play estimates, or add records to pregame performance. The implementation is in `lib/live-nfl-model.mjs`; the public feed is in `lib/live-nfl.mjs`.

## Markets and output

Passing yards, passing attempts, completions, rushing yards, rushing attempts, receptions, receiving yards, and combined rushing/receiving yards. Each player card shows the recorded statistic, expected remaining production, projected regulation total, exact weights, and earlier-game sample dates. TD and interception props are not supported in this version.

**Projected total = recorded statistic + remaining team opportunities × player workload share × production per opportunity.** Combined yards project rushing and receiving separately, then add them. Already-recorded statistics retain full weight, including genuine zero and negative yards. Missing values remain unavailable.

## Weighting

| Component | Calculation |
| --- | --- |
| Historical player role | Player opportunities divided by team opportunities in the same last 5 completed appearances on that team. Minimum 3 appearances. Passing uses attempts, rushing uses carries, receiving uses targets. |
| Live player role | Current player opportunities / current team opportunities. Weight = `min(0.70, team opportunities / (team opportunities + 20)) × min(1, elapsed minutes / 15)`. History receives the remainder. At 15+ elapsed minutes, 20 team opportunities produce 50% history / 50% live; 40 produce 33% / 67%. |
| Historical efficiency | Total player production / total opportunities in up to 10 earlier appearances on the same team. Attempts and carries use efficiency 1. |
| Live efficiency | Weight = `min(0.20, player opportunities / (player opportunities + 40))`; history receives the remainder. Live production per opportunity is bounded to 0–2× historical efficiency. Receptions and completions are therefore driven by catch/completion rate. |
| Team pace | Last 5 completed team games provide plays/game, using attempts + carries + sacks. Before 5 minutes, use historical pace only. Thereafter use 65% history + 35% current pace, with current pace bounded to 75–125% of history. Thus the final pace multiplier is bounded to 0.9125–1.0875. |
| Pass/run mix | Historical dropbacks / plays and current dropbacks / plays, where dropbacks = attempts + sacks. Live weight = `min(0.50, current team plays / (current team plays + 30))`. History receives the remainder. |
| Score situation | Add `opponent-minus-own score / 21 × elapsed-game fraction × 0.12` to pass share, bounded to ±12 percentage points. Final pass share is bounded to 25–90%. Trailing favors passing; leading favors rushing. |
| Clock and possession | Historical plays/game × fraction of regulation remaining × pace multiplier. Add 1.5 plays for the possessing team, subtract 1.5 for its opponent, tapering inside 3 minutes; no possession adjustment at halftime. Remaining plays cannot be negative. |
| Attempts/targets | Remaining passing plays exclude sacks using historical sack rate. Target opportunities additionally use historical targets per attempt. Remaining rushes use the complement of pass share. |

These are hand-specified shrinkage assumptions, **not fitted or validated optimal weights**. Role, efficiency, pace, and pass mix are separate stages; they are not percentages of one combined score. The card exposes the effective weights and numeric equation for the chosen player and market.

## Data and latency

- ESPN public scoreboard and summary endpoints supply scores, clock, possession, timestamped plays, team volume, and player statistics. Athlete ESPN ID plus team joins to nflverse roster IDs; no fuzzy name matching.
- nflverse schedules, weekly player statistics, and rosters supply earlier-game history. Only completed schedule games dated before the selected kickoff enter the sample. The selected and later games never enter the prior. Historical availability and corrected feeds do not establish a point-in-time backtest.
- The browser requests updates every **15 seconds while visible**; concurrent upstream requests coalesce and cache for 15 seconds. Manual refresh uses that same minimum interval. History caches for 15 minutes. Public delivery can lag real action; this is not a direct sportsbook or stadium feed.
- Failed requests retain the original fetch timestamp and show stale state. New projections pause for stale/absent history, failed live requests, upstream cache age above 45 seconds, or no timestamped play within 3 minutes outside halftime. Browser line comparisons also stop when the response is over 45 seconds old, even if auto-refresh is disabled.
- A participant absent from an otherwise complete statistical category can have a zero in that category. A player absent from the entire offensive box score, or a missing/incomplete category, never becomes a fabricated zero. Such players may not appear until first recorded participation; this is a coverage limitation.
- Each response includes URLs, fetch times, and SHA-256 receipts. The public source has no guaranteed latency or availability. No paid key is required.

## Live line comparison

Enter and confirm the current **full-game** sportsbook total, including stats already accumulated. A projection-minus-line difference is shown in the statistic's units. The existing 30-minute pregame line feed is not labeled as live. Manual lines expire after 60 seconds or when score, clock, play ID, or player stats change. Lines are kept only in the current page session. No price, vig, implied probability, EV, or recommended stake is computed.

The model forecasts regulation only; possible overtime production is excluded. Projections are withheld in overtime and during the final 2 minutes of regulation, when kneels, timeouts, urgency, and possession sequencing need a more specific model. Full-game book markets may include overtime, so this limitation matters when comparing totals. Final games show actual box scores only, not simulated historical live predictions or sportsbook settlements.

## What is not modeled

No automatic in-game injury, benching, substitution, ejection, or workload-restriction detection. Use **Pause player** if their participation is uncertain; it hides future projections and disables comparison. No live route/snap data, coverage, pressure, field-position adjustment, timeouts, weather, separate opponent-strength adjustment, or explicit red-zone/TD model. Observed usage and efficiency reflect some current matchup effects without identifying their causes. Historical appearance selection misses zero-touch appearances without published weekly rows. Role estimates may lag personnel changes, and unseen participants can leave some projected team workload unallocated.

There are no calibrated live over/under probabilities or confidence intervals. This version has not been backtested against timestamped in-game snapshots and synchronized sportsbook lines. Unit and browser tests verify arithmetic, cutoffs, parsing, and UI behavior; they do not demonstrate betting accuracy.

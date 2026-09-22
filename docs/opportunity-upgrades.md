# Opportunity and role upgrades

This release separates verified inputs, experimental scenarios, and candidates that failed an error check. It does not establish betting profitability. Existing sportsbook sources and settlement rules are unchanged.

## NFL

`workload-opportunities-v4` projects team passing attempts, carries and targets from previous games, then combines those opportunities with the player's recent share. Each appearance is matched to its own team's opportunities. The opponent-volume weight is selected on an earlier chronological block, tested on a later block, and enabled only if both MAE and MSE improve with at least 64 validation team-games. With fewer observations it retains own-team volume. Player workload changes are bounded to 20%; team injury allocation remains separate. Starting-QB uncertainty suppresses the new scenario. Historical error distributions have not been recalibrated for these player-level changes, so changed forecasts receive an experimental flag and no automatic lean.

The ranking is now `independent-v2`: no score bonus for a touchdown drought. Drought and opportunity shortfall can still be inspected as descriptive statistics.

NFL Live (`live-availability-v2`) joins ESPN injury reports by athlete ID. Reported-out/inactive players and explicit ejections are paused; stale reports pause future player production. This does not detect an injury or substitution before ESPN reports it. Pregame Questionable alone does not pause someone already playing. The manual pause remains available.

## MLB

`mlb-opportunities-v2` adds:

- Confirmed batting-order slot and prior team PA distributions to estimate batting opportunities, compared with recent PA. Only fresh upcoming lineups qualify; a historical actual lineup is never presented as a pregame input.
- Recent three-start pitch budgets and historical batters faced per pitch. No undisclosed coach pitch restriction is invented.
- Variable starter/bullpen exposure from observed starter batters faced and lineup slot. Handedness/BvP full-game caps remain 7.5%/2.5%.
- Individual starter allowed hit, HR, walk and strikeout rates, stabilized by 200 BF against his own staff's baseline. Only the expected starter portion is affected, avoiding a full duplicate of the team opponent effect.
- For pitcher strikeouts/walks, all nine confirmed opposing batters' stabilized rates relative to their team baseline; incomplete lineups remain neutral.

These are bounded, explicitly experimental scenarios. Existing base-model retrospective metrics do not validate their probabilities. Original and changed forecasts and their inputs are retained. Data: official MLB Stats API game logs, game box scores, schedules and confirmed lineup positions, with exact request receipts in player evidence.

## NBA, NHL and soccer

`multi-sport-opportunities-v2` adds confirmed-role minutes, NBA same-team with/without production-per-minute effects across positions, and a shared NBA active-roster minute budget based on observed team minutes including overtime. Explicit DNPs are zero-minute records; missing box-score entries are not DNPs. Confirmed role changes and injury minute allocations are not added twice. Absence-rate effects can reduce production and shrink toward the existing baseline to avoid boosting a role already represented in recent games.

Soccer uses a separate midfielder prior and same-competition history when sufficient. A confirmed backup goalie/keeper has no starter forecast. Confirmed opposing goalkeepers can affect goals using stabilized conceded-goals per on-target shot relative to their team's goalies. This is not shot-quality-adjusted goalkeeping and remains experimental.

NBA points can use separate two-point, three-point and free-throw attempts and stabilized conversion. Equivalent candidates for threes and NHL/soccer goals were checked, but are disabled after failing the diagnostic gate. Their measured inputs remain visible as disabled; disabled does not mean missing.

## Recorded diagnostic

Run `npm run evaluate:opportunities` against downloaded ESPN box scores. Every target uses only earlier completed games. Target-game starters and current injuries are excluded. The script compares the raw attempt/conversion candidates against the same model without those rate changes; it does not automatically alter activation flags. Activation is recorded in `lib/artifacts/opportunity-validation.json`.

| Candidate | Player-games | Base MAE | Candidate MAE | Base Brier | Candidate Brier | Active |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| NBA points | 817 | 5.0030 | 4.9090 | .09625 | .09216 | Yes, experimental |
| NBA threes | 817 | .93869 | .94287 | .12498 | .12708 | No |
| NHL goals | 1,479 | .27917 | .27840 | .12927 | .12957 | No |
| Soccer goals | 4,140 | .18567 | .18566 | .08551 | .08572 | No |

This is a convenience sample of corrected cached games, not a league-wide untouched test, historical book lines, or a profit estimate. The activation gate requires 200 player-games and improvement in both absolute error and fixed-threshold Brier score. It was chosen on this diagnostic, so prospective performance is still needed. Confirmed-role, goalkeeper and injury scenarios cannot be validated from historical final starting lineups as if known beforehand.

## Remaining gaps

This release does not add Statcast contact/pitch-shape data, MLB park factors, explicit new pitch-limit announcements, NFL routes/coverage/line injuries, NHL shot-location xG or confirmed skater lines, soccer xG/set-piece designations/referee models, or comprehensive tracking-derived rebound/assist chances. Those need verified coverage and a separate evaluated model rather than a fabricated multiplier. The current connected ESPN soccer feed does not provide player xG. Refreshing data updates inputs; it does not automatically retrain the frozen regression and probability-calibration artifacts.

The player dialog now distinguishes applied, unchanged, unavailable, and validation-disabled inputs and shows the final projection separately from intermediate opponent/weather adjustments. New model-version archives preserve earlier predictions.

# WNBA model and connected data

The WNBA section is available at `/wnba`. Its model version is `wnba-opportunities-v1`. All priors, game histories and validation results come from WNBA games. NBA evaluation results and NBA playing-time limits are not used to approve WNBA adjustments.

## Markets and sources

Fifteen player markets: points, rebounds, assists, three-pointers, points + rebounds + assists, points + rebounds, points + assists, rebounds + assists, steals, blocks, steals + blocks, turnovers, field goals made, field goal attempts, and free throws made.

- Schedules, results, player/team box scores, rosters and injuries: ESPN public WNBA feeds under `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba`. The **Data sources** panel and JSON export include the exact request URL, retrieval time, stale state and SHA-256 response hash. Player detail links each sample to its source game.
- Public totals and prices: [ScoresAndOdds WNBA props](https://www.scoresandodds.com/wnba/props) and the anonymous comparison service used by that site. FanDuel is preferred, with other books explicitly named. Player, team, game, start time and full-game market must match. Public US lines are not represented as independently verified Arizona pricing. No third-party model projection is used.
- The public prop menu supplies points, rebounds, assists, threes, four combination markets, blocks and steals. Coverage still varies by matchup and book. The other five model markets remain available as statistical forecasts with no invented book total.
- WNBA [pace definitions](https://www.wnba.com/news/new-level-analysis), [official rules](https://www.wnba.com/wnba-rule-book), and [injury-report requirements](https://www.wnba.com/wnba-injury-report) provide league context. The operational injury feed is ESPN; this release does not claim to parse the league's official injury-report PDFs.

## Prediction calculation

1. Fetch up to 25 earlier completed games per matchup team, including regular season and playoffs from the current/prior season, within 450 days. Exclude preseason, the selected result and future games. Use up to 20 player appearances with verified minutes and the required stat fields. Five prior appearances are required; missing statistics never become zero.
2. Estimate production per minute from those appearances, stabilized toward the WNBA guard/forward/center group in the fetched sample with five appearances of prior exposure. Combo markets use actual per-game sums, including their observed joint variance, rather than multiplying independent component probabilities.
3. Estimate minutes with 60% recent-five and 40% long-sample playing time, capped at 40 per player. The game clock and pace are WNBA-specific. Five players imply 200 regulation team minutes; the active-roster budget uses observed team totals including prior overtime. An overallocated roster is scaled down; unused minutes are not filled by invented production. The 40-minute player cap is conservative for overtime props; there is no separate overtime simulation.
4. A fresh five-player starting lineup can replace generic minutes with earlier appearances in that starter/bench role, including explicit bench DNPs. A role change is not also given the same injury-minute increase. Reported Out/Inactive/suspension statuses withhold that player's forecast.
5. Fresh teammate absences can redistribute a bounded fraction of recent same-role minutes. Same-team with/without production-rate changes require at least three games together and two explicit DNP games; missing rows are not proof of absence. Effects can raise or lower a projection and are capped at 25%. Unreported restrictions are not invented.
6. Opponent allowance, estimated possession pace, home/away and short rest are bounded supporting effects. Possessions use FGA + 0.44 × FTA − offensive rebounds + total turnovers, normalized to 40 minutes. Pace is separated from opponent allowance to reduce duplicate effects. The comparison population is the disclosed fetched sample, not a complete tracking database.
7. Poisson or negative-binomial distributions produce the expected count, central 80% interval and over/under/push probabilities. Dispersion uses prior appearance variance. The probabilities remain experimental and generate no automatic betting lean.

For indoor venues, weather contributes zero. Where the feed lacks a roof field, the UI explicitly discloses the indoor-basketball assumption. Rest is derived from schedule timestamps. Exact travel distance, individual defensive assignments, player-tracking rebound/assist chances, unannounced coaching restrictions, and separate playoff/rotation or blowout simulations are not available inputs. Recent playoff games still enter the observed history.

The attempt/conversion candidates for points and threes were measured on WNBA data. Neither improved both development-set absolute error and Brier score, so both remain disabled. Their measured attempts and shooting percentages remain visible in player evidence. The production-rate model continues to forecast both markets.

## Historical evaluation

311 completed 2025 WNBA regular-season/playoff games were downloaded. Development dates end August 14; the separate test starts August 15. Every prediction is reconstructed from strictly earlier games using the same matchup-history selection as the live app. The candidate decision is frozen before evaluating the later test. No actual target-game lineup or present-day injury report is treated as a historical pregame input.

The test contains 100 games and 1,795 eligible player appearances per market. Average absolute error (lower is better):

| Market | Model | Recent-five baseline |
| --- | ---: | ---: |
| Points | 4.099 | 4.207 |
| Rebounds | 1.722 | 1.782 |
| Assists | 1.252 | 1.308 |
| Three-pointers | 0.738 | 0.759 |
| Points + rebounds + assists | 5.255 | 5.438 |
| Blocks | 0.485 | 0.481 |

Fourteen of fifteen markets had lower absolute error than the baseline; blocks did not. All market results, probability-error metrics, interval coverage and source receipts are committed in `lib/artifacts/wnba-validation.json` and shown in **Model & evidence**. These are corrected historical box scores and fixed research thresholds, not historical sportsbook prices or proof of profit. The season test validates the base model; real-time lineup, absence and minute-budget scenarios require prospective evaluation.

Reproduce with:

```sh
npm run download:wnba -- 2025
npm run evaluate:wnba
```

The download script caches public responses; the evaluation script rewrites the reviewed WNBA artifact and writes individual diagnostic rows to ignored `reports/wnba-evaluation.json`. Neither script runs automatically during deployment or refresh.

## Operation and grading

Dates and matchups come from published schedules and advance without code edits. New teams come from the selected game and current rosters. Early-season/rookie cases with fewer than five verified appearances remain unavailable. Players who recently changed teams may have incomplete prior-team coverage in the two-team history window; this is not represented as a complete career sample.

The visible WNBA page automatically rechecks unfinished games every minute and on returning to the tab. An open player dialog also updates, including withholding a newly reported-out player. Opening the default page or pressing Today follows the Phoenix calendar into the next date; manually chosen historical dates remain selected. Manual refresh and subsequent requests recheck live sources with short caches. Pregame forecasts, inputs, available totals and prices are saved when a board is opened, at most once per market/model/hour. Hosted durability follows the existing archive's configured Blob storage; no new external account is required. There is no unattended WNBA capture job. The UI exposes whether saving succeeded.

Final statistics settle an over, under or push only against an available total. DNP, missing statistics and unfinished games are separate states. A public line retrieved after a game is labeled retrospective, not a recorded pregame forecast. The **Pregame records** panel compares the first saved pregame forecast for each player/model version to final results; no retrospective prediction is fabricated. WNBA is also available in the personal Bet Tracker, including priced-ticket profit calculations.

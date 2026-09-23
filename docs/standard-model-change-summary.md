# Standard-model audit: exact before/after behavior

This summary compares the audit edits against `.research/standard-model-before/lib`, the saved starting working tree, not against Git HEAD. That distinction excludes unrelated work already present when the audit began. Concurrent navigation, simulation features and other UI work are not attributed to this audit. This follow-up adds documentation and read-only diagnostic scripts; it makes no further model changes.

**Subsequent independent verification:** see [final verification](standard-model-final-verification.md). Counts and metrics reproduced, but same-scale missing-factor scores are not proven equally comparable. Complete-input injury-adjusted ratings can differ in the fourth decimal because the shared formula uses unrounded context; the live negative-efficiency guard also needs further validation. Current tests pass 99/99 focused and 336/336 full; the earlier two navigation failures no longer occur. The historical run details below remain a record of that earlier verification.

**Yes, some calculated prediction values changed.** The controlled historical comparison confirms changes to NFL passing-TD and reception expected-production estimates. Other fixes can change ratings, projections, probabilities or availability when their specific missing/stale/invalid-input conditions occur. No weights, fitted coefficients, scale constants or supported markets were replaced.

## Calculation changes, file by file

### `lib/model.mjs` — original NFL weighted profile and expected production

| Fix | Exact behavior before | Exact behavior after | Output affected / evidence |
| --- | --- | --- | --- |
| Passing-TD denominator | For each field zone, TDs divided by **assigned receiver targets**. Applied that rate to all modeled non-spike pass attempts, including unassigned throwaways. | For each zone, TDs divided by **all modeled non-spike, non-sack pass attempts**, including throwaways. Apply to the same attempt population. | Changes `projected`, `debt`, `stats.passtd_debt`; can cross the unchanged opportunity-flag threshold. Confirmed changes in 665/688 paired historical estimates. Does not enter the rating-weight formula or the separate workload forecast. |
| Reception denominator | Completions per all modeled attempts, by air-depth bin, applied to assigned targets. | Completions per **assigned target**, by depth bin, applied to assigned targets. Passing-yards expectation still uses yards per attempt. | Changes `projected`, `debt`, `stats.reception_debt`; can cross the unchanged opportunity-flag threshold. Confirmed changes in 5,249/5,249 paired historical estimates. Does not change the separate receiving workload forecast. |
| Missing applicable conversion rate | Summation converted a missing rate to zero, creating partial or zero expectations; debt and TD probability could then look like valid numbers. | If any sampled applicable opportunity lacks a finite rate, its aggregate expectation is `null`; dependent projected value/debt/TD probability remains `null`. A genuinely empty opportunity set still totals zero. | Can turn an apparent number into unavailable. Tested with missing-rate fixtures; no claim that every serving occurrence was measured. The rushing zone estimate is a diagnostic `rush_baseline_gap`; published NGS rushing projection/debt remains separate. |
| Missing weekly production | Missing fields became zero in totals/logs; addition and division propagated those invented zeros into production, shares and scores. | Required sums remain `null` if a sampled field is missing/invalid. Counting fields require nonnegative integers; integer yardage may be negative. Known snap-only appearances with no corresponding player plays are explicitly marked `zeroStats` and retain genuine zero production. | Can change score, displayed averages, projected values or forecast availability. Coverage names affected fields. Synthetic missing-yardage test confirms `null` rather than zero. |
| Ratios and field zones | `null / positive` could become zero; negative or >100 yardlines could map into ordinary field zones. Scalar conversion accepted whitespace, booleans and arrays. | Ratios require finite numerator/denominator and positive denominator. `zoneFor` requires finite 0–100. Numeric parsing accepts finite numbers or nonblank numeric strings only. | Rejects invalid rate/share inputs; valid numeric inputs keep the same arithmetic. This guard covers these helpers, not a claim that every raw-data field has complete domain validation. |
| Historical cutoff | Sample qualification used season/week without additionally requiring the game's date to precede the target game. No explicit prior-season rate-training assertion. | Both season/week and game-date cutoffs must pass. A supplied training season must be an integer earlier than the selected season. | Can remove a wrongly dated appearance or reject invalid rate training. Regression tests cover both. |
| Opponent denominator | A recent opponent game without usable opposing player statistics still counted in games played, depressing allowed-per-game values. | Such games are excluded from the denominator; rows marked statistics-unavailable are excluded; missing-game count is disclosed. | Can change opponent component, rating and diagnostics when coverage is incomplete. This does not fully validate every individual opponent statistic. |

The before/after historical run found **zero original NFL rating-score changes** across the tested market cohorts. That observation is about those fixed-input cohorts; it does not mean the missing-data and opponent-coverage fixes can never change a rating.

### Remaining calculation files

| File | Exact behavior before → after | Can it change a result value? / measured evidence |
| --- | --- | --- |
| `lib/rating.mjs` (new) | Scoring was embedded in `model.mjs`, with another copy in the injury adjustment. The TD formula already renormalized available factors; the non-TD formula multiplied missing values as zero. Now one helper preserves TD role/context weights and non-TD 50% volume / 30% production / 20% opponent weights, renormalizing available factors within each group. Missing all role factors returns `null`; missing context gives role all final weight. Exact weighted contributions are returned. | **Yes, for missing inputs.** Example: only recent-production component 40, with volume/opponent missing, previously scored 15; now scores 40. With actual volume zero instead of missing, it still scores 15. All full-data tested ratings are unchanged. |
| `lib/nfl-opportunities.mjs` | Injury-adjusted components were rescored by a duplicated formula → rescored by `ratingFromComponents`, with the same missing-input policy and contribution explanation as the base rating. Rounding/missing rating deltas formerly could coerce `null` → now remain `null`. | **Yes under missing-input conditions.** Teammate allocation, component increments, TD probability adjustment, caps and weights are unchanged. No historical archive sufficient to quantify full injury-scenario effects was used. |
| `lib/forecast.mjs` | `priorSample` admitted missing dates and compared date strings → with a supplied target date, only valid earlier timestamps qualify. Missing required weekly workload/production could enter `project` as zero → serving `forecast` returns unavailable with `point/probability/lean: null` and field names. No-prior output now explicitly has null point/probability. Weak inline quote check → shared strict freshness check. Context warnings flow into reasons. | **Yes:** invalid history can change sample/availability; invalid quote can remove a lean. The unchanged `project` workload × efficiency calculation produced no changed historical values in its 11 evaluated markets. That test did not replay the complete serving context/calibration/injury path. Version v4 → v4.1. |
| `lib/pregame-quote.mjs` (new) | NFL serving checked timestamp inequalities that could all be false for `NaN`; MLB serving lacked the same freshness gate. Archive code had a separate stricter check. → A shared function requires finite current/start/fetch times and numeric line, captured-pregame basis, non-stale quote, both scheduled starts still future, <15-minute start disagreement, and fetch time from now back through two hours. | **Changes eligibility/lean, not the statistical point by itself.** Invalid timestamp fixture: an otherwise supported NFL `over` becomes `lean: null`. A failed freshness gate does not automatically erase the displayed line probability. |
| `lib/context-model.mjs` | Outdoor `temperatureF: null` became `(0−65)/20 = −3.25`; missing values could produce `NaN`, stale values still contributed, and zero league rate could divide by zero. → Affected malformed/missing/stale terms are zero, with warnings. Opponent rate must be nonnegative and league rate positive; negative wind is invalid. Valid terms retain the same normalization and coefficients. | **Yes where an enabled fitted correction encounters those inputs.** Example temperature feature changes −3.25 → 0. Shadow-only corrections change their diagnostic output, not the served point. Historical comparison excluded current weather layers; no full serving accuracy claim. |
| `lib/mlb/markets.mjs` | Any finite numeric count, including negative/fractional values, was accepted. Impossible singles were clamped to zero. Derived total bases could accept extra-base hits exceeding total hits. Explicit outs overrode disagreeing innings. → Counts must be nonnegative integers; conflicting singles/derived-TB components return `null`; disagreeing valid outs and innings return `null`; invalid supplied outs are rejected. | **Yes for invalid/conflicting records.** Hits 1/doubles 2/triples 0/HR 0: singles 0 → `null`; derived TB 3 → `null`. Outs 19 with innings `6.2`: 19 → `null`; outs 0 with `0.0` remains 0. A separately supplied valid total-bases field is not newly cross-checked against every component. |
| `lib/mlb/model.mjs` | A batter log with absent PA could pass the `NaN <= 0` exclusion; invalid/missing date and explicitly non-MLB sport were not all rejected. → Requires valid date, earlier completed permitted game, MLB sport when supplied, and known positive batter PA; pitcher-start criterion remains. | **Can change profile sample, 60/40 estimate and rating**, or remove the row. The missing-PA case is covered by a targeted test. The 16-market historical comparator evaluated the separate frozen forecast, not every MLB profile output. |
| `lib/mlb/forecast-core.mjs` | No explicit validity check for fitted prior rate/workload; positive fractional exposure could enter the features. → Prior rate/workload must be finite and >0; PA/BF exposure must be a positive integer, with valid market statistics. Bad prior returns unavailable; invalid rows are excluded. | **Can change sample/availability or downstream mean on bad data.** All 16 frozen-regression historical market comparisons were unchanged. Coefficients, feature standardization, shrinkage and distributions are unchanged. |
| `lib/mlb/forecast.mjs` | Individual pitcher matchup could apply despite stale source receipts; stale-source disabling of workload scenarios was not centrally enforced. Quote freshness did not have the shared serving gate. → Source staleness disables those experimental adjustments; bad quote adds a reason and prevents an eligible lean; context warnings are surfaced. | **Can change adjusted mean, interval and probabilities when a stale scenario is removed; can change eligible/lean independently.** Clean base-regression historical results were unchanged; unavailable historical matchup/lineup/weather layers were not evaluated. |
| `lib/sports/normalize.mjs` | Numeric conversion admitted booleans, arrays and whitespace → only finite numbers/nonblank numeric strings accepted. | **Can change normalized inputs on malformed source values.** The historical comparator reused normalized history, so it did not independently measure the complete old-vs-new raw ingestion path. |
| `lib/sports/model.mjs` | History ordering compared timestamp strings; some current role, injury, team-minute or weather inputs could still affect stale/non-pregame/historical calculations. Negative/fractional count fields and malformed workload factors were accepted. → History compares actual timestamps. Current adjustments require non-validation, fresh inputs, pregame state and non-stale availability. Validation clears current availability/starting-role flags. Injury increments must be finite/nonnegative; minute factor must be finite in (0,1], otherwise neutral. Soccer weather requires valid non-stale numeric temperature and nonnegative wind. Counts must be nonnegative integers. | **Yes when these guards trigger:** mean, intervals and probabilities can change; invalid production can leave insufficient history. Clean NBA/WNBA/NHL/soccer comparisons showed no changed values. Example soccer null temperature formerly could trigger the 0.97 cold-weather multiplier; now the invalid weather scenario is neutral. Added sequential contribution deltas only explain the existing arithmetic. Runtime versions advance; validation artifact weights/gates stay intact. |
| `lib/live-nfl-model.mjs` | Impossible >3,600-second regulation clocks and incomplete/out-of-range historical rates/shares could enter arithmetic. → Withholds projections for these cases; requires positive historical team plays, valid [0,1] rates/shares and nonnegative finite market efficiency. Scalar parsing also rejects arrays/whitespace. | **Yes:** a numerical/NaN estimate can become withheld (`projection: null`). The direct live pace, role and efficiency weights are unchanged. Only guard tests, not a chronological live accuracy evaluation, were available. |
| `lib/live-sports-model.mjs` | Basketball prior ordering used timestamp strings; impossible regulation clocks/remaining player minutes could reach arithmetic. Negative/fractional current counts or MLB PA/BF/pitch usage could be used. → Actual timestamp ordering; regulation duration bound; remaining minutes must be finite, nonnegative and no greater than clock minutes; count/workload validation withholds invalid projections. | **Yes under those conditions.** Direct live basketball/MLB weighting remains unchanged. Raw event helpers were moved/re-exported without altering their event-conversion formulas. No sufficient live-state archive was used to claim predictive improvement. |

## Integration, explanation and boundary files

| File | Audit change and result impact |
| --- | --- |
| `lib/source.mjs` | Uses rating version v2.1, exposes unavailable/stale source receipts in player coverage, and passes schedule kickoff to NFL forecast quote validation. No new scoring formula; the kickoff check can suppress a lean for mismatched start times. |
| `lib/mlb/source.mjs` | Passes the store's clock to forecast context, so freshness decisions use the same time as the rest of the request. No standalone point calculation change. |
| `lib/mlb/opportunities.mjs` | Version label v2 → v2.1 only. No opportunity formula or weight changed in this file. |
| `lib/predictions.mjs` | Re-exports shared freshness and kickoff helpers; removes duplicate implementations. Normal valid archive freshness behavior is retained. New forecast versions receive distinct capture keys; the audit did not rewrite old prediction batches. |
| `lib/game-time.mjs` (new) | Extracted the same New York kickoff-to-UTC conversion. Adds an invalid parsed-date guard: return `null` instead of reaching invalid-Date formatting and throwing. No change for valid schedules. |
| `lib/sports/events.mjs` (new) | Extracted basketball/MLB raw event adapters unchanged from the live model so independent controllers can use them. No model weighting or projection changes. |
| `lib/simulation-source.mjs` | Only the audit's two imports were redirected to neutral schedule/event helpers. Separately developed simulation features in this file are not audit edits. |
| `lib/simulation-props.mjs` | Only the audit's kickoff-helper import was redirected to `game-time.mjs`. This is a reporting adapter showing existing player forecasts; they do not enter simulation draws. |
| `lib/definitions.mjs` | Passing-TD and reception descriptions now name their correct attempt/target populations. Documentation only. |
| `public/app.js` | Corrected the passing-TD explanation; existing evidence panel now shows score contributions and missing/stale-input cautions. These audit edits display backend results; they do not recalculate them. Concurrent unrelated UI edits are excluded. |

## Supporting files

| File | Purpose; effect on served predictions |
| --- | --- |
| `test/standard-model-audit.test.mjs` | New regression tests for weights, input validity, timing, denominators, context, contributions, quote gates, direct-live guards, paired metrics and dependency separation. No serving effect. |
| `test/forecast.test.mjs` | Updated expected serving version to v4.1; no formula change. |
| `test/wnba.test.mjs` | Updated runtime version expectations to v1.1 while preserving the frozen artifact version. |
| `test/mlb.test.mjs` | Conflicting outs/innings now expects `null`; consistent recorded zero remains zero. |
| `test/nfl-opportunities.test.mjs` | Replaced impossible fractional receptions/TD fixture counts with valid integers; retained behavioral assertions. |
| `scripts/evaluate-standard.mjs` | Added offline before/after comparison across 80 model/market combinations. No model fitting, downloads or prediction captures. |
| `scripts/standard-metrics.mjs` | Paired MAE/RMSE, Brier/log loss, reliability bins and descriptive game-level intervals. No serving effect. |
| `package.json` | Added `evaluate:standard`; no runtime arithmetic change. Other concurrent package changes are excluded. |
| `docs/standard-model-audit.md`, `docs/standard-model-results.md` | Formula/source inventory, implementation record, metrics and limitations. |
| `docs/standard-model-change-summary.md` | This follow-up's file-by-file explanation and real-output evidence. |
| `.research/standard-change-examples.mjs`, `.research/compare-standard-archives.mjs` | Follow-up read-only diagnostic scripts; write only report JSON. Neither invokes prediction capture, deployment or model training. |

All seven existing artifacts were preserved: `mlb-context.json`, `mlb-model.json`, `nfl-context.json`, `nfl-evaluation.json`, `nfl-forecast.json`, `opportunity-validation.json`, `wnba-validation.json`. None received newly tuned weights.

## Confirmed numerical changes on real historical games

For the 2025 NFL period (September 4, 2025–February 8, 2026):

| Expected-production output | Paired predictions | Changed values | MAE before → after | Rating-score changes |
| --- | ---: | ---: | --- | ---: |
| Passing TDs | 688 | 665 | 0.908269 → 0.894468 | 0 |
| Receptions | 5,249 | 5,249 | 1.280141 → 1.294846 | 0 |

The passing-TD correction improved this diagnostic's error; the reception correction worsened it. Those mixed outcomes do not establish a general accuracy improvement. The other evaluated clean-data point/probability comparisons were unchanged, within the evaluator's 1e-6 change threshold. Full periods, market counts, baselines and uncertainty are in [measured results](standard-model-results.md).

The following examples were reproduced in this follow-up by separately preparing the same raw cached inputs with the old and new NFL code. They use actual player/game histories, with 2024 training rates and earlier appearances only. They are **reconstructed estimates, not proof these exact forecasts were published before those games**. `Debt` means expected minus observed production over the prior sample; it is not target-game forecast error.

| Player / September 7, 2025 game | Market | `projected` before → after | `debt` before → after | Rating before = after | Target-game actual |
| --- | --- | --- | --- | ---: | ---: |
| Kyler Murray, ARI at NO | Passing TDs | 2.169 → 2.039 | 2.847 → 2.195 | 75.333 | 2 |
| Spencer Rattler, ARI at NO | Passing TDs | 0.920 → 0.872 | 1.602 → 1.359 | 30.667 | 0 |
| Josh Allen, BAL at BUF | Passing TDs | 0.972 → 0.918 | −1.140 → −1.412 | 35.333 | 2 |
| Alvin Kamara, ARI at NO | Receptions | 3.692 → 3.870 | −3.538 → −2.652 | 41.000 | 2 |
| Brandin Cooks, ARI at NO | Receptions | 3.605 → 3.754 | 4.026 → 4.770 | 45.778 | 3 |
| Chris Olave, ARI at NO | Receptions | 3.820 → 3.976 | −0.902 → −0.118 | 51.444 | 7 |

These are the original weighted model's separate `projected` fields, not the independent workload model's `forecast.point`. The difference is material: changing an expected-production diagnostic does not automatically change the workload forecast or the weighted ranking.

## Saved local prediction snapshots

The workspace also contains actual saved **local preview** NFL batches for 2026 Week 3 under both workload versions v4 and v4.1. Comparing each new batch with the latest earlier v4 batch for the same market yielded:

| Market / UTC capture times on September 23, 2026 | Matched records | Changed `forecast.point` | Changed line probabilities | Changed original score | Changed eligibility / lean |
| --- | ---: | ---: | ---: | ---: | --- |
| Receiving yards, 01:42:48 → 02:32:09 | 364 | 8 | 15 | 0 | 7 / 0 |
| Anytime TD, 01:13:43 → 02:32:28 | 464 | 13 | 9 | 29 | 0 / 0 |

Thus **21 saved direct forecast values differ** across these batches. Examples: Garrett Wilson receiving yards 50.4916 → 50.2348; Christian McCaffrey TD occurrence estimate 0.5487 → 0.5499. Neither example gained a betting lean. Original expected-production values were unchanged in both archived market comparisons.

These archive differences are **not attributable solely to the audit**: capture times differ, 12 receiving-yard lines differ, and current context/availability/team inputs can change even when the saved prior player sample matches. All 828 paired saved player-history samples match, which still does not establish identical full model inputs. The 29 archived TD score differences are not a contradiction of zero score differences in the fixed-input historical cohort. The latter held its source inputs constant; these snapshots did not freeze all inputs.

No production deployment or production prediction database was inspected or changed for this follow-up. Existing local prediction files were read, not rewritten. Raw recorded box scores and outcomes were not edited. The evidence supports changed local/reconstructed predictions, not a claim about what a deployed user saw.

## Evidence and limits

- [Full audit](standard-model-audit.md) and [80-market results](standard-model-results.md).
- Local machine-readable evidence: `reports/standard-model-audit.json`, `reports/standard-change-examples.json`, `reports/standard-archive-comparison.json`.
- The follow-up verified that the evaluated model-file hashes still match the historical report, then reproduced the six examples above. It did not rerun the full historical evaluation or claim fresh full-suite results.
- The historical evaluation isolates model calculations on largely common prepared inputs; it is not an end-to-end replay of every old/new ingestion and serving branch. Current weather, lineup, injury and live snapshots were insufficient for a controlled retrospective serving comparison.
- Last implementation verification was 95/95 focused tests and passing syntax checks; the full suite was 319/321 with two separately changing navigation-test failures. Those counts describe that recorded run.
- Standard model calculations still have no dependency on simulation engines or their results. The shared schedule/raw-event helpers do not introduce such a dependency.

# Independent final verification of standard-model changes

The denominator corrections are mathematically consistent with their modeled populations. An independent replay reproduced the reported counts, six named examples, MAE/RMSE and descriptive intervals. The passing-TD estimates improved on this diagnostic; receptions worsened. This supports keeping the population definitions correct, not claiming general predictive improvement.

Two stronger claims do not pass: scores with different missing factors are not established as equally comparable, and not every valid-input output is numerically identical after the audit. No model weights, fitted artifacts or serving calculations were changed during this review. Uncertain behavior is left unchanged.

## 1. Checklist

PASS means the stated narrow claim was verified. FAIL means a stronger claim is contradicted by a reproducible example. NOT VERIFIED means the evidence is insufficient. A passing unit test is not a predictive-accuracy validation.

| Requested check | Status | Evidence / finding |
| --- | --- | --- |
| Passing-TD denominator and included/excluded plays | **PASS** | `lib/model.mjs:15–29`, `scripts/verify-standard-audit.mjs`, JSON `populations`/`passingBins`. Official nflfastR definition says `pass_attempt` includes sacks; this model explicitly removes sacks and spikes. See exact populations below. |
| Reception denominator and completion population | **PASS** | `lib/model.mjs:22`: increment both target count and completed flag within the same `targetPlay` branch. JSON `receivingBins` independently reproduces each numerator/denominator. |
| Missing-factor renormalization and real zero | **PASS** | `lib/rating.mjs:9–20`; `test/standard-model-verification.test.mjs` checks full-data weights, missing vs zero, and returned missing-factor list. |
| Scores remain equally comparable when different factors are missing | **FAIL** | The normalized scale is shared, but the effective formula changes. Volume 80/production 0/opponent 0 scores 40; volume 80 with the other two missing scores 80. No evaluation by missingness pattern establishes equal ranking quality. |
| Other fixes preserve every valid-input/output behavior | **NOT VERIFIED** | Tests and code review support the guards, but full serving equivalence is not established. New test reproduces valid injury-adjusted score 47.8333 → 47.8334 from removing intermediate context rounding. Live negative historical efficiency is withheld even though negative yardage can be real; synthetic before/after evidence is in `reports/final-standard-edge-cases.json`. |
| No supported weights or fitted artifacts changed | **PASS** | All seven artifacts have identical SHA-256 before/after (`final-standard-verification.json`, `artifacts`). Existing full-data weights reconcile; no coefficients or scale constants were retuned. Renormalization does change effective weights when factors are missing. |
| Reproduce passing-TD/reception counts and examples | **PASS** | Independent script reproduced 688/665 changed and 5,249/5,249 changed, plus all six saved examples. JSON `markets.*.matchesSavedMetrics` and `examples[*].matchesSaved` are true. |
| Before/after MAE, RMSE, sample sizes and dates | **PASS** | Independently calculated in JSON `markets.pass_tds` and `markets.rec`; table below. The verifier does not import the original metrics module. |
| Numerical changes in each metric | **PASS** | JSON `markets.*.delta`, calculated from unrounded errors, not by subtracting rounded displayed metrics. |
| Same games, players and prior samples on both sides | **PASS** | Pair key is game ID + player ID. Both cohorts have zero before-only/after-only candidates, zero differing samples, zero nonfinite paired estimates. Prior samples and outcome values are held fixed. |
| Same lines and known pregame information | **NOT VERIFIED** | No player-prop lines enter these two projected-statistic comparisons. Historical schedule/roster data is common to both sides, but its original publication timing cannot be reconstructed. This is not a matched live-market replay. |
| Formula effects separated from eligibility/data-quality effects | **PASS** | Old model with only the corrected rate tables gives exactly the new `projected` value on every paired row: `formulaOnlyMismatch: 0`. Independently prepared old/new input pipelines also agree on the evaluated samples. No observed missing/stale/eligibility effect on these two paired cohorts. |
| Explain all 5,249 reception changes | **PASS** | Every populated depth bin has the same completions but fewer assigned targets than attempts. All four corrected catch rates increase; all 5,249 estimates increase. No unknown-depth opportunities produced a nonfinite evaluated estimate. |
| Confirm production testing | **NOT VERIFIED** | No production data store, deployed service or production predictions were tested. Only local cached data, local preview archives and test fixtures were used. Production impact is not inferred. |
| Earlier-game/training cutoff | **PASS** | 2024 rates for 2025 forecasts; zero sampled games on/after each target date or in a disallowed season/week, checked for every paired row. |
| Every historical input was actually available at prediction time | **NOT VERIFIED** | Corrected source bytes were fetched in September 2026; no archived pregame roster/line/weather/availability timeline proves their historical availability. Samples exclude future games, which is a weaker property. |
| Identify corrected-data, roster, line-timing and period limitations | **PASS** | Detailed below; original evaluator source lines 22, 39, 49–57 and 91–103 reveal common preparation, target-outcome selection and excluded serving layers. |
| Classify evaluation correctly | **PASS** | Paired retrospective regression diagnostic on previously inspected data. Not an untouched test or a faithful prospective/pregame backtest. |
| Report uncertainty and adequate sample information | **PASS** | 285 games for each market; 79 passers / 491 receivers (market cohort IDs). Independently reproduced equal-game descriptive intervals below. Dependence and reuse prevent claiming definitive significance or general improvement. |
| No final-period weight tuning | **PASS** | Reviewed evaluation/verification scripts contain no parameter fitting or artifact writes; artifacts match the pre-audit copy. This verifies the reviewed audit, not an unobservable history of all prior model development. |
| Rerun relevant focused tests | **PASS** | 99 tests, 99 pass, 0 fail: `reports/final-standard-focused-tests.log`. Exact command below. |
| Explain/recheck two full-suite failures | **PASS** | Both now pass; current full suite is 336/336. Previous failures were navigation link order and missing `.workspace-switch` markup. See old/new logs and current tests, below. No navigation edits made in this review. |
| Separate recommendation for each calculation change | **PASS** | Recommendation table below; numerical correctness and predictive benefit are distinguished. |
| Leave uncertain calculation choices unchanged | **PASS** | No serving-model edits. Missing-pattern comparability and the live negative-efficiency policy require additional evidence. Added verification code/tests and corrected documentation only. |

## 2. What the formulas actually do

The primary definitions are the [official nflfastR play-by-play reference](https://nflfastr.com/reference/fast_scraper.html): `pass_attempt` includes sacks; `receiver_player_id` identifies the intended receiver; `complete_pass` flags a completion. This is why the model's sack exclusion is necessary and why the assigned-target denominator differs from attempts. This model uses a deliberately restricted attempt population, not every NFL official attempt.

**Passing-TD expectation** is `sum(previous-season passing TDs in zone / previous-season modeled attempts in zone, for each sampled modeled attempt) / sampled appearances`. Previously the denominator was assigned targets, even though the rate was multiplied by attempts.

An included modeled attempt needs `pass_attempt == 1`, a nonempty `passer_player_id`, no sack, no spike, no deleted play, no two-point attempt, and `play_type != 'no_play'`. Zone estimation additionally needs yardline 0–100. Completed passes, interceptions and incomplete passes count; receiverless attempts also count. Accepted statistical plays with penalties are not blanket-excluded. Ordinary rushes, scrambles and kneels do not qualify without the pass-attempt flag. Both regular season and postseason 2024 plays are used. This is the existing training-season scope, not a new season filter.

Actual cached 2024 training data:

- 49,492 rows: 47,274 regular-season and 2,218 postseason.
- 20,082 rows have `pass_attempt == 1`; 18,505 modeled attempts remain after the filters.
- Excluded flag counts: 1,392 sacks, 75 spikes, 110 two-point attempts. No flagged pass attempts in this cache additionally fail the no-play/deleted/missing-passer tests; independent synthetic tests cover those exclusions.
- 757 included attempts lack a receiver assignment; none is completed. They include the receiverless population the old target denominator omitted. **Missing receiver assignment is not itself a verified throwaway label**; the modeled data has no separate throwaway-classification input.
- 541 admitted attempt descriptions mention a penalty, 419 an interception, and 22 a lateral. No admitted attempt has missing down or invalid zone; no passing-TD flag lacks a completion in this training data.

| Zone | Modeled attempts | Assigned targets | Passing TDs | Before rate | After rate |
| --- | ---: | ---: | ---: | --- | --- |
| 0–5 | 540 | 501 | 242 | 242 / 501 | 242 / 540 |
| 6–20 | 1,980 | 1,859 | 356 | 356 / 1,859 | 356 / 1,980 |
| 21–40 | 3,597 | 3,442 | 148 | 148 / 3,442 | 148 / 3,597 |
| 41–100 | 12,388 | 11,946 | 99 | 99 / 11,946 | 99 / 12,388 |

**Reception expectation** is `sum(previous-season completions on assigned targets in depth bin / previous-season assigned targets in bin, for each sampled target) / sampled appearances`. Its filter has the same no-play/deleted/conversion/sack/spike exclusions, requires a receiver ID, and does not independently require a passer ID. The cached training data has zero assigned targets missing a passer, and all admitted completion flags are valid 0/1.

| Depth | Completions | Old attempts denominator | New target denominator | Rate before → after |
| --- | ---: | ---: | ---: | --- |
| Behind line | 2,667 | 3,375 | 3,192 | 0.790222222 → 0.835526316 |
| 0–9 yards | 6,604 | 9,169 | 8,827 | 0.720253027 → 0.748159057 |
| 10–19 yards | 2,114 | 3,829 | 3,666 | 0.552102377 → 0.576650300 |
| 20+ yards | 751 | 2,132 | 2,063 | 0.352251407 → 0.364032962 |

Every populated bin's rate increases because its numerator is unchanged and its denominator decreases. All 5,249 evaluated reception estimates increase, as expected. The correction therefore removes an accidental downward scaling; that scaling happened to reduce error in this already-inspected sample. No new scaling was fitted to recover that advantage.

Exceptional lateral/multiple-possession plays are still a limit: nflfastR explicitly cautions that tidy PBP cannot always reproduce official totals and recommends its dedicated statistics product for exact credited statistics. The model's recorded outcomes use weekly statistics; its PBP estimates are opportunity diagnostics. See [official discussion of exceptional plays](https://nflfastr.com/articles/nflfastR.html#example-9-replicating-official-stats).

**Missing versus zero:** Available-factor normalization divides the retained weighted sum by retained weight, within the role/context groups. A real zero keeps its weight; a missing value removes its weight. For non-TD production=40 with volume/context missing, score is 40; with volume=0 and context missing, score is 15. This is mathematically consistent but cannot establish comparable ranking quality across missingness patterns. The existing UI identifies missing factors; a prospective/cohort-stratified study is required before stronger claims.

## 3. Reproduced before/after results

Both markets cover **September 4, 2025 through February 8, 2026**, 285 games. Metrics use actual player-game results and the model's returned three-decimal `projected` values. The following table reports nine decimals; deltas use unrounded metrics, so last-digit subtraction of displayed figures may differ.

| Market | N / distinct players | Changed values | MAE before | MAE after | MAE delta (after−before) | RMSE before | RMSE after | RMSE delta |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Passing TDs | 688 / 79 | 665 decrease | 0.908268895 | 0.894468023 | −0.013800872 | 1.144366607 | 1.134532293 | −0.009834314 |
| Receptions | 5,249 / 491 | 5,249 increase | 1.280140789 | 1.294846256 | +0.014705468 | 1.743708219 | 1.754395509 | +0.010687290 |

These reproduce the original report's six-decimal metrics exactly. Both cohorts have zero rating changes, zero different sampled-game lists, zero before-only/after-only candidates and zero nonfinite paired estimates. 418 passing-TD candidate rows and 727 reception candidate rows lacked usable target outcomes and were excluded; that selection must not be interpreted as a deployment-wide accuracy sample. The original evaluator's `unpaired: 0` does not disclose all candidate exclusions.

The verifier runs the old calculation with **only the denominator rate tables changed**, as well as complete old/new calculation paths. Every paired corrected estimate is identical between that formula-only variant and current code (`formulaOnlyMismatch: 0` for both markets). Independently summed per-play expectations match both versions (`manualBeforeMismatch: 0`, `manualAfterMismatch: 0`). This separates the observed numerical changes from the other guards on these cohorts.

**Independently reproduced examples, all September 7, 2025:**

| Player | Market | Before → after | Actual | Original rating before = after |
| --- | --- | --- | ---: | ---: |
| Kyler Murray | Passing TDs | 2.169 → 2.039 | 2 | 75.333 |
| Spencer Rattler | Passing TDs | 0.920 → 0.872 | 0 | 30.667 |
| Josh Allen | Passing TDs | 0.972 → 0.918 | 2 | 35.333 |
| Alvin Kamara | Receptions | 3.692 → 3.870 | 2 | 41.000 |
| Brandin Cooks | Receptions | 3.605 → 3.754 | 3 | 45.778 |
| Chris Olave | Receptions | 3.820 → 3.976 | 7 | 51.444 |

Those estimates are `projected`, not the separate workload model's `forecast.point`, and are reconstructions rather than proven pregame publications.

**Uncertainty:** Independently reproduced equal-game mean changes in absolute error are −0.012290058 for passing TDs (approximate 95% interval [−0.019416758, −0.005163359]) and +0.015039801 for receptions ([+0.011616468, +0.018463135]). Each game gets equal weight, whereas the main MAE table weights player-game rows equally, so their point differences need not match. These normal intervals assume more independence than repeated players and time may justify; they are descriptive intervals, not definitive evidence of generalizable improvement/degradation. No RMSE interval was estimated.

## 4. Verification limits and tests

This is a **paired retrospective regression diagnostic**, not an untouched test. Target-game and future-game outcomes were excluded from the sampled history correctly in the two replayed cohorts, but that does not recreate what a forecaster knew at each historical instant. The official [nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) documents later corrections, confirming the need for publication-time snapshots.

- Actual SHA-256 hashes were calculated from cached raw bytes. PBP, weekly statistics, rosters and snaps match the original audit's recorded hashes. **The schedule cache hash has changed since that run.** It is identical for the two sides of this new replay; the relevant counts, examples and metrics still reproduce. Full original source-byte identity cannot be claimed.
- The data was fetched in September 2026; 2024/2025 source correction history is unavailable. Reconstructed roster/status assignments, actual target participation and available target outcomes influence who is evaluated. Historical schedule prices may reflect information collected after the intended prediction time.
- The two corrected expected-production metrics do not use player-prop lines. The full application has distinct rating, workload forecast, probability and eligibility layers; a change to one is not evidence that all changed.
- Original evaluator limitations independently inspected: NFL uses current `prepareData` for both sides and skips absent old/target rows (`scripts/evaluate-standard.mjs:39–54`); other-sport target participants come from observed target boxes, and current normalization is shared (`:83–104`); MLB uses current outcome parsing (`:62–79`). This review's two-market verifier prepares old/new NFL data separately and reports exclusions, but is not a fresh end-to-end replay of all 80 serving model/market paths.
- The full old/new context, calibration, lineup, injury, weather and quote history was not available. No controlled chronological direct-live accuracy test was possible.
- Local preview snapshots captured at different times cannot assign changes to code alone; no production service or production archive was inspected. No production-impact claim is made.
- The reviewed scripts contain no tuning or fitted-artifact writes. Identical artifact hashes support no tuning during this audit. These facts do not make previously inspected periods untouched.

**Exact verification commands and results:**

```text
node --max-old-space-size=6144 scripts/verify-standard-audit.mjs
  Both market rows match saved metrics; six examples match; no formula-only mismatches.

node --test test/standard-model-audit.test.mjs test/standard-model-verification.test.mjs test/live-nfl.test.mjs test/live-sports.test.mjs test/forecast.test.mjs test/simulation.test.mjs test/simulation-props.test.mjs
  tests 99; pass 99; fail 0; skipped 0

npm test
  tests 336; pass 336; fail 0; skipped 0

npm run check
  Exit 0

node --check scripts/verify-standard-audit.mjs
  Exit 0
```

Logs: `reports/final-standard-verification.log`, `reports/final-standard-focused-tests.log`, `reports/final-standard-full-tests.log`, `reports/final-standard-syntax.log`.

**Previous two failures:** `reports/standard-model-tests.log:352` expected the earlier navigation order; current `test/site-layout.test.mjs:21` expects the current Research/Trends/Live/Simulation order. `:379` could not find `.workspace-switch`; current rendered layout includes it and `test/trends-dashboard.test.mjs:20` passes. Both checks pass in the new full log (navigation at line 288; workspace switch at line 330). This review did not alter navigation or either test. The additional four verification tests explain 332 → 336 during this review; the earlier 321-test run was an older shared-workspace state.

## 5. Recommendation for each calculation change

| Change | Recommendation | Reason / additional evidence needed |
| --- | --- | --- |
| Passing-TD denominator | **Keep** | Numerator/denominator/application population match; isolated replay reproduces change and lower diagnostic errors. Still requires prospective validation for an accuracy claim. |
| Reception denominator | **Keep** | Correct completions-per-target definition. Explicitly retain the measured worsening in the report. A new chronological calibration/test cohort is needed to improve accuracy; do not retune or revert solely to optimize this inspected period. |
| NFL missing-rate → unavailable expectation/debt/probability | **Keep** | Missing rate is not evidence of zero production; no paired missing-rate effect contaminated these metrics. |
| NFL missing weekly fields, null-safe totals/ratios | **Keep** | Avoids fabricated zero production; valid negative integer yardage is preserved by weekly parsing. |
| Snap-only proven zero marker | **Keep** | Distinguishes observed participation without matching plays from unknown production. Better archival completeness receipts would strengthen this evidence. |
| Scalar and field-zone validation | **Keep** | Rejects malformed values/out-of-field zones while accepting valid numeric values. Does not claim every raw field is fully validated. |
| NFL event-date and training-season guards | **Keep** | Excludes future/same-target-date history and inappropriate training season; zero violations in replay. |
| Opponent denominator excludes games lacking usable stats | **Keep** | Unobserved allowed production should not lower the per-game average. Partial missing fields still require fuller source coverage validation. |
| Renormalization across different missing-factor patterns | **Needs more validation; leave unchanged** | Arithmetic is correct, cross-pattern ranking comparability is not established. Evaluate rank quality/error separately by missingness and test coverage thresholds on a new development cohort. Preserve true-zero distinction. |
| Centralized injury-adjusted rating | **Keep**, disclose rounding difference | Same weights, now uses unrounded context factors. Reproduced 47.8333 → 47.8334 on valid complete input; previous claim of exact preservation needs this qualification. |
| Null-safe injury score delta | **Keep** | Prevents a missing score from being reported as zero or a numerical delta. |
| NFL serving-history validity/availability gate | **Keep** | Missing production cannot be silently treated as valid history. Full serving coverage should be monitored prospectively. |
| Shared quote freshness gate | **Keep** | Finite timestamps, freshness and event-time matching are eligibility conditions; no invented statistical point adjustment. |
| Context missing/stale weather/opponent terms neutral | **Keep** | Corrects null-temperature coercion and invalid divisions while preserving valid feature formulas. Future validation should quantify coverage loss. |
| MLB integer counts / singles / derived TB / outs conflicts | **Keep** | Valid counting units are preserved; conflicts are unavailable rather than invented counts. |
| MLB known-participation/date/sport filters | **Keep** | Absent PA is not proof of participation; prevents contamination of the profile sample. Full profile-serving accuracy remains unmeasured. |
| MLB valid fitted priors and integer exposure | **Keep** | Ensures well-defined logarithmic features; no coefficient changes. |
| MLB stale workload/matchup suppression | **Keep** | Stale confirmed-lineup/pitcher scenarios should not alter the current forecast. Historical layer benefit remains unvalidated. |
| Multi-sport scalar/count validation | **Keep** | Supported markets are count statistics; malformed/negative/fractional values are not valid observed counts. |
| Multi-sport timestamp ordering | **Keep** | Compares instants correctly across timezone representations. |
| Historical/stale role, injury, lineup and weather withholding | **Keep** | Removes present-context leakage from reconstructed forecasts; prospective coverage effects still need monitoring. |
| Injury increment and roster-minute factor bounds | **Keep** | Respect the existing nonnegative allocation and (0,1] reduction semantics; no new weights. |
| Soccer invalid weather neutral | **Keep** | Missing temperature is not freezing weather. Both needed numeric fields are required by the existing scenario guard. |
| Exact score/point contributions | **Keep** | Explanation only; sums reconcile with the numerical result. Contribution order is an accounting decomposition, not causal attribution. |
| Live clock/current workload/count bounds | **Keep** | Impossible regulation clocks and player workload should withhold estimates. Tests verify guards; no accuracy improvement claim. |
| Live NFL nonfinite/out-of-range share/prior guards | **Keep** | Prevents invalid arithmetic. |
| Live NFL negative historical yardage efficiency guard | **Needs more validation; leave unchanged** | Negative yardage averages can be real. Synthetic valid-stat fixture changed projection −1.6507936508 → null. The old live-efficiency cap also assumes nonnegative rates, so simply removing the guard is not demonstrably correct. Need real sparse/negative-efficiency live cohorts and an explicit supported-domain rule. |
| Neutral schedule/event helper extraction | **Keep** | Valid schedule/event formulas unchanged; invalid date returns null; simulation dependency boundaries pass. |

No change is recommended for automatic reversion based solely on the already-inspected final period. No serving implementation correction was established with a sufficiently supported replacement during this review; uncertain policies remain as they were. Concrete verification corrections are the narrower comparability/preservation claims, source-hash caveat, full candidate-exclusion counts and updated test status.

Added artifacts: `scripts/verify-standard-audit.mjs`, `test/standard-model-verification.test.mjs`, this document, `.research/verify-standard-edge-cases.mjs`, and machine-readable `reports/final-standard-{verification,edge-cases}.json` plus row-level `reports/final-standard-verification-rows.jsonl`. Existing historical results were not overwritten. [Earlier file-by-file summary](standard-model-change-summary.md) is retained with a link to these qualifications.

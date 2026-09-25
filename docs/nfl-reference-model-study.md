# NFL reference model reconstruction

Studied on 2026-09-24 against the public [NFL metrics page](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/nfl?view=metrics&season=2026&week=3), [week 3 board](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/nfl?view=board&season=2026&week=3), four other market boards, weeks 1–2, and the public [player research game log](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/api/nfl-research?player=00-0033280&season=2026&week=3). The public HTML includes unrounded scores, component scores, supporting statistics, debts, and player IDs. The server's scoring source code is not exposed. Claims below distinguish published rules, numerically reconstructed rules, and estimates.

## Main finding: two different meanings of the displayed number

The anytime touchdown **Venom Score** is a weighted 0–100 profile score. A separate number on the card is the estimated probability of at least one rushing or receiving touchdown. Neither is a sportsbook price. On the other four boards, the displayed 0–100 score is an **inclusive percentile rank** of a weighted composite among that market's candidate pool. Thus a 100 on the rushing board means the top ranked profile; it does not assert a 100% chance of gaining a particular yardage.

This explains why the reference can show many scores near 100 without giving those players near certain TD chances. It also explains why one cannot derive a non-TD card score from its visible component percentages by simply adding them: the weighted composite is ranked afterward.

## Cross-check of both public Metrics pages

The two pages describe **different sports**. The [NFL Metrics Explained page](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/nfl?view=metrics) specifies the five-meaningful-game sample, the 60% baseline / 40% opportunity TD score, each group's weights, the two numeric drought bonuses, and a *separate* historically calibrated TD probability. It describes TD debt, box and coverage splits, signature packs, and reason tags as supporting reads. The NFL reason-tag names are Elite Red Zone Role, Goal Line Back, Target Monster, High Volume, Shootout Script, Soft TD Defense, and Due For TD; the page does not publish thresholds for most of those labels or say they each add score points. We therefore use the measurable inputs in the score and keep the other signals separate.

The site-wide [Metrics Explained page](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/metrics) is about **MLB home runs**. It describes a 14-day Statcast baseline (barrel rate, hard-hit rate, expected slugging, fly-ball rate, HR/fly-ball rate, contact trend), pitcher/park/wind/temperature/lineup opportunity, and DUE, OVERPERFORMING, Viper, and rank-movement flags. It supplies no additional NFL coefficients, TD conversion rates, or NFL player-selection rule. Its useful cross-sport clue is architectural: recent player skill, game opportunity, and explanatory flags are distinct pieces. The NFL page explicitly makes its +8/+5 drought bonus part of the TD score; the MLB page describes DUE as a flag without a numeric bonus. We did not transfer baseball inputs, its 14-day window, or an assumed MLB bonus into the NFL model.

## Anytime TD: numerically recovered formula

Let `clip100(x) = min(100, max(0, x))`. The public metrics tab publishes these weights, and the board values confirm the normalization bounds:

| Component | Reconstructed input-to-score rule | Weight within group |
| --- | --- | ---: |
| Red-zone role | `clip100(100 × player red-zone carries+targets / team red-zone carries+targets / 0.35)` | Baseline 35% |
| Volume | `clip100(100 × (carries + targets per game) / 22)` | Baseline 25% |
| Goal line | `clip100(100 × carries starting inside the 5 per game / 2.5)` | Baseline 15% |
| Target share | `clip100(100 × player targets / team targets / 0.30)` | Baseline 15% |
| TD rate | `clip100(100 × (rushing + receiving TDs) / (carries + targets) / 0.12)` | Baseline 10% |
| Implied total | `clip100(100 × (team implied points − 14) / 17)` | Opportunity 55% |
| Opponent | `clip100(100 × (positional TDs allowed/game − 0.20) / 1.40)` | Opportunity 45% |

The final calculation is

```text
baseline = .35*redZone + .25*volume + .15*goalLine + .15*targetShare + .10*tdRate
opportunity = .55*impliedTotal + .45*opponent
score = clip100(.60*baseline + .40*opportunity + dueBonus)
```

The public page says `+8` for an elite red-zone role after three TD-less games and `+5` for 12+ touches per game after four TD-less games. In the public rows, “elite” resolves to a red-zone component of at least 60, equivalent to roughly 21% of team red-zone work. This criterion reproduced **all 39 nonzero bonuses** across 764 TD rows in weeks 1–3. When opponent allowance is absent, the reference uses a neutral **50** component; its raw stat remains null.

The visible component values are rounded to whole numbers, while baseline and opportunity use underlying unrounded inputs. For Christian McCaffrey in week 3, the page reports baseline 87.9533, opportunity 79.04412, bonus 0 and score 84.389626: `.60 × 87.9533 + .40 × 79.04412 = 84.389628` after floating-point/serialization rounding. Normalizing his *already rounded* visible stats gives 84.4249, a 0.035-point difference. This is expected from input rounding.

The formula explains **727 of 764** published TD player scores to 0.0001 point. The other 37 are a small repeated set of running backs with one-decimal displayed scores that differ from their own published baseline/opportunity/bonus calculation. Week 3 has **13** such rows. The discrepancy is in the public output itself; no single published formula can produce both the displayed score and the displayed components on those rows. We did not hardcode their values.

## TD chance is a separate score conversion

The reference says its TD chance is calibrated on historical outcomes. The public score/probability pairs form a nearly deterministic nonlinear curve. A fifth-degree polynomial in the score's *log odds*, with `x = (score − 50)/25`, closely reconstructs it:

```text
logit(p) ≈ −0.72264219 + 1.06226213*x − 0.22782927*x²
           − 0.04522178*x³ + 0.00942711*x⁴ + 0.00467031*x⁵
p = 1 / (1 + exp(−logit(p)))
```

To check transfer across weeks, we selected the curve form and fitted it on week 1–2 public rows, then predicted week 3 without using week 3 in that fit. Across **255** rows without a manual score override, the mean absolute difference was **0.0000194 probability** (0.00194 percentage points), and the maximum was **0.000649 probability** (0.0649 percentage points). The production coefficients above were then refitted on weeks 1–3. This reconstructs the output mapping; it does **not** reveal the historical outcomes, fitting method, or proof of actual calibration. Our separate TD forecast remains a separate estimate.

As an outcome check using our revised public-data reconstruction, the reference-like curve's Brier score over **429** recorded week 1–2 player games was **0.16238**, versus **0.16243** for our independently refitted logistic curve. This tiny difference is not evidence that either is reliably superior. The check uses revised source data and is conditional on recorded participation; it is not a frozen prospective test.

## Other four markets: weights and percentile conversion

The card details disclose the weights. Unrounded `baselineScore`, `opportunityScore`, and `compositeScore` in the page data verify them:

| Market | Composite score before ranking | Baseline group | Opportunity group |
| --- | --- | --- | --- |
| Rushing yards | `.40*volume + .30*front + .15*script + .15*groundForm` | Volume and ground form, total 55% | Front and script, total 45% |
| Receptions | `.40*design + .30*hands + .20*matchup + .10*script` | Design and hands, total 70% | Matchup and script, total 30% |
| Passing yards | `.45*airBaseline + .25*matchup + .15*script + .15*environment` | Air baseline, 45% | Other three, 55% |
| Passing TDs | `.35*redZoneLean + .30*endZoneBaseline + .20*matchup + .15*environment` | First two, 65% | Last two, 35% |

The displayed `Venom Score` is approximately `100 × ascending_rank(composite) / candidate_count`, with the best composite at 100. In week 3, for example, Derrick Henry's rushing composite is about `68.75`, while his card score is `99.22481 = 100 × 128/129`. Saquon Barkley is ranked first at 100 despite a composite around 73.49. The public ranking denominators for weeks 1/2/3 are **122/122/129** for rushing, **262/268/291** for receptions, and **51/46/54** for both passing markets. Some candidate rows are excluded from the visible board after the percentile pool is formed. Most rows sit exactly on the rank grid; tied ranks and the manually altered running backs can sit between or off grid points.

The component *recipes* are less fully exposed. Cross-player fits strongly support slate min-max normalization and these subweights: rushing volume roughly 70% carry share plus 30% carries/game; reception design roughly 60% target share plus 40% team quick-target share; hands roughly 50% receptions/game, 30% targets/game and 20% catch rate; reception matchup roughly 60% opposing receptions allowed plus 40% opposing catch rate; passing-yard matchup roughly 60% passing yards allowed plus 40% inverse opposing sack rate. Game script is the normalized point spread (favored teams help rushing; underdogs help catches and passing). Passing environment is normalized implied team points. The rushing front and passing-yard baseline include hidden bounds or inputs and are **approximations** in our implementation. We keep those recipes separate from the proven market weights.

## Game inputs, inclusion and other engines

The board uses up to five “meaningful” prior regular-season games, and the public data supports dropping very low snap games. Saquon Barkley's week 3 rushing row is an exact illustration: his immediately prior week had four carries for nine yards on 16% of snaps and is absent from the five-game averages. The next five meaningful games have **97 carries and 483 rushing yards**, exactly the displayed **19.4 carries/game and 96.6 yards/game**. The precise server-side rule is unpublished, so our snap thresholds are an explicit approximation: 40% for TD/receptions, 50% for rushing/passing, with a 35% fallback for sparse rushing roles. We keep the game sample and opponent's last-eight-game window strictly before the target game, and exclude playoffs from the recent regular-season sample. The reference also has a curated starter pool: only one quarterback per team is displayed on passing boards, while the percentile pool is larger. Our passing board ranks the eligible QB pool and displays the listed game starter.

The passing TD red-zone pass rate uses the **current team's** five most recent regular-season games, including games before the quarterback joined it. This was visible in the reference for Geno Smith: his rate was about 0.27, while applying his own prior-team sample would have produced about 0.60. Correcting that input and normalizing passing TD components against the starter quarterback cohort materially narrowed our passing TD score gap.

The [metrics page](https://l3df4hpvu0mqkkkns3g8.apps.whop.com/nfl?view=metrics&season=2026&week=3) describes supporting signals that are **not the Venom Score percentage**: TD debt is zone-specific expected TDs minus actual TDs; light/neutral/stacked box splits use 6-or-fewer/7/8-or-more defenders; single-high/two-high/zero coverage splits use Cover 1/3, 2/4/6 and 0. “Light-Box Feaster” requires a 1.5 YPC light-box advantage with at least eight carries; “Single-High Slayer” requires a 2.0 yards-per-target advantage with at least eight targets. Their Viper view sorts players with fired debt/signature signals. Their Edge page says its sharp-money feed is **not connected**, so it cannot supply a mathematical edge rule to reconstruct.

## What changed in our code

`lib/reference-profile.mjs` contains the recovered TD scales, drought rule, inferred TD chance curve, other-market component recipes, and percentile ranking. `lib/rating.mjs` now uses the four published market-specific weight sets. `lib/model.mjs` counts targets as TD opportunities, selects meaningful regular-season samples, uses an eight-game regular-season opponent window, builds the published components, and displays one starting QB per team after the passing percentile pool is ranked. `lib/source.mjs` keeps the reference-like profile rating separate from the experimental teammate workload forecast. The NFL source definitions, profile-chance labels, prediction archive, and direct tests were updated to describe the new meaning. The independent TD calibration was retrained on the changed score for comparison and historical auditing; the displayed 2026+ TD chance uses the inferred reference curve.

## Same-week comparison against the public week 3 board

This checks the full local pipeline, not just the recovered formula applied to their own inputs. Player IDs align the two boards. The mean absolute difference measures score points on the 0–100 display:

| Market | Public rows | Our rows | Shared players | Mean absolute score difference |
| --- | ---: | ---: | ---: | ---: |
| Anytime TD | 268 | 312 | 268 | 3.86 |
| Rushing yards | 128 | 129 | 116 | 6.20 |
| Receptions | 262 | 303 | 262 | 5.98 |
| Passing yards | 32 | 32 | 31 | 5.60 |
| Passing TDs | 32 | 32 | 31 | 7.51 |

Different row counts reflect player inclusion rules and data availability. Their exact inclusion filter is not published, and visible boards can exclude players who remain in the percentile candidate pool. This same-week comparison uses data currently available to our pipeline and cannot establish accuracy on future games.

## What is and is not reproducible

The TD weights, score normalization, due rule, non-TD market weights, and percentile structure are strongly identified from public output. The exact server implementation of player eligibility, every composite subfeature, source cutoffs, and manual overrides is **not identifiable** from the public app. As of the study, requesting week 4 or a 2025 board returned the week 3 data, so the site does not provide a future-week check. The implementation calculates new weeks from our own data rather than storing or replaying any of their player scores. It should produce the same *kind of score* and generally similar rankings, but claiming exact future-week equality would exceed the evidence.

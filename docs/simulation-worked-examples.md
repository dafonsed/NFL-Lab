# Game simulation: verified worked examples

Generated from the frozen local source copies and actual simulation outputs. All four cases were fixed to the previously observed integration matchups before inspecting these new draws. Each uses `pregame-score-simulation-v3`, 10,000 runs, seed `final-deep-audit`, RNG namespace `pregame-score-simulation-v1`. The representative scenario is always draw number one. It was not selected for its outcome.

Run from the project root: `node scripts/explain-simulation.mjs` then `node scripts/render-simulation-explanation.mjs`. The first command makes no network calls: it verifies 43 captured files, calls the actual SimulationStore, reconstructs the priors and independently replays every draw. It asserts equality with the saved result and every score/total/margin PMF. Timings can change. Do not use `--capture` for verification: that deliberately replaces the snapshot with current local cache bytes.

These are stored-byte reconstructions, not proof of currently fresh feeds or forecasts made before the games. Source capture stores provider cache envelopes; their file hashes verify the stored envelope bytes. An upstream SHA in a receipt hashes the original response text, which the parsed JSON cache does not retain verbatim. NFL gzip hashes verify the actual compressed CSV bytes. See [source manifest](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/simulation-deep/source-manifest.json).

The per-sport JSON ledgers contain **every normalized source row**, its final and regulation scores, all excluded row indexes/IDs/reasons, every league-row age/weight/weighted contribution, each selected team-row venue/scoring/residual term, all arithmetic sums, first-game random draws, full integer PMFs, warnings and receipts. Tables below round arithmetic to nine decimals for readability; the ledgers preserve JavaScript numeric precision.

## NFL: ATL at GB

Official date **2026-09-24**, ID `2026_03_ATL_GB`; target timestamp `2026-09-24`. [Complete row/calculation/draw ledger](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/simulation-deep/nfl-example.json). API input fingerprint: `57767b13d56d75930d4e31e279522229241808b401c586943b719ec597eb6366`.

UI: open `/nfl/simulation?date=2026-09-24`, choose this matchup, 10,000 runs and seed `final-deep-audit`, then Run simulation. Live UI results match these only if the source bytes and engine still match. The offline command above is the exact replay. Scope: **regulation-only**.

| Source filtering | Rows |
| --- | --- |
| Normalized raw rows | 7548 |
| outside 450-day window | 6991 |
| incomplete | 240 |
| Unique prior-window rows | 317 |
| Verified regulation rows included in all prior terms | 317 |
| Included games with continuation scoring removed | 19 |

### League and venue arithmetic

| Term | Value |
| --- | --- |
| Weighted row mass M = Σw | 115.370455457 |
| Fixed league pseudo-score 40 × sport mean | 880 |
| Weighted average-score sum Σw(H+A)/2 | 2603.696654712 |
| League numerator | 3483.696654712 |
| League denominator 40+M | 155.370455457 |
| League L = numerator / denominator | 22.421873222 |
| Weighted home-margin sum Σw(H−A) | 157.763374331 |
| Venue denominator M+80 | 195.370455457 |
| Raw home advantage | 0.807508863 |
| Venue clamp bounds | -1.76 to 1.76 |
| Clamped home advantage H | 0.807508863 |

### Team arithmetic

| Term | Away | Home |
| --- | --- | --- |
| Sample count | 16 | 16 |
| mass | 6.227927703 | 6.346863294 |
| denominator | 12.227927703 | 12.346863294 |
| pseudoScore | 134.531239333 | 134.531239333 |
| weightedScoredSum | 110.680783279 | 136.628483408 |
| weightedAllowedSum | 154.412802917 | 149.308165332 |
| offenseNumerator | 245.212022612 | 271.159722741 |
| defenseNumerator | 288.94404225 | 283.839404665 |
| offense | 20.053440662 | 21.961830814 |
| defense | 23.629845487 | 22.988786537 |
| pseudoVariance | 726 | 726 |
| squaredResidualSum | 584.85182934 | 380.387346793 |
| varianceNumerator | 1310.85182934 | 1106.387346793 |
| variance | 107.20147037 | 89.608779207 |
| historyWeight | 0.509319964 | 0.514046616 |
| leagueWeight | 0.490680036 | 0.485953384 |
| offenseContribution | 10.026720331 | 10.980915407 |
| defenseContribution | 11.494393269 | 11.814922744 |
| venueContribution | -0.403754431 | 0.403754431 |
| rawExpected | 21.117359168 | 23.199592582 |
| expected | 21.117359168 | 23.199592582 |
| clampAdjustment | 0 | 0 |
| Expected-score lower/upper bounds | 10.08984295 / 36.996090817 | 10.08984295 / 36.996090817 |

`denominator = shrink + mass`; `pseudoScore = shrink × L`. Offense/defense numerators add the row-weighted adjusted scored/allowed sums to pseudoScore. Variance numerator adds `shrink × sd²` to the weighted squared residual sum. Offense, defense and variance divide by denominator. Expected scoring is half offense + half opponent defense + target venue, clamped to the bounds. All row operands are in `calculations.leagueRows` and `calculations.teams.<side>.sample`. Variance affects basketball draws only; NFL/MLB use their event-family variance.

### First generated game, with its actual draws

**away**: Poisson mean λ=3.685402996, stop threshold exp(−λ)=0.025087063. Uniform/product sequence: 0.89162978→0.89162978; 0.235613281→0.210079818; 0.372672224→0.078290913; 0.547083993→0.042831705; 0.916800848→0.039268144; 0.499431409→0.019611744. The stopping draw is counted before subtracting one, giving **5 scoring events**. Event uniform→points: 0.119479847→3; 0.94911659→8; 0.819476685→7; 0.092877307→3; 0.096829857→3. Sum=24.

**home**: Poisson mean λ=4.048794517, stop threshold exp(−λ)=0.01744339. Uniform/product sequence: 0.054240118→0.054240118; 0.244285003→0.013250048. The stopping draw is counted before subtracting one, giving **1 scoring events**. Event uniform→points: 0.665068441→7. Sum=7.


First score **24–7**, away–home; continuation=false. That is one scenario, not the model forecast.

| Regulation outcome | Count / 10,000 | Probability |
| --- | --- | --- |
| Home lead | 5361 | 0.5361 |
| Away lead | 4360 | 0.436 |
| Tie | 279 | 0.0279 |
| Regulation tie / OT needed (overlapping event) | 279 | 0.0279 |

| Quantity | Mean | Median | p10 | p90 |
| --- | --- | --- | --- | --- |
| away score | 21.2185 | 20 | 7 | 37 |
| home score | 23.2255 | 22 | 7 | 39 |
| Total | 44.444 | 43 | 24 | 67 |
| Home−away margin | 2.007 | 2 | -19 | 23 |

Team Wilson 95% Monte Carlo intervals: away 0.426307025–0.445742128; home 0.526313581–0.545858694.

**Market comparison withheld:** NFL scenarios end at regulation; full-game odds comparisons are withheld. Score/total/margin distributions remain in the JSON, but do not support full-game sportsbook settlement.

### Actual warnings

- Experimental probabilities. More runs reduce Monte Carlo noise; they do not establish model accuracy.
- Player availability, current lineups, weather and pregame pace are not inputs to this game-score model. Unknown inputs are not treated as confirmed absences or zero effects.
- Only verified regulation scores enter the historical prior. Inherited league mean and variance pseudo-observations have no regulation-only training provenance and remain uncalibrated.
- Team scores are independent before continuation rules; shared pace and game-script correlation are not modeled. Team histories also contribute to the league prior and are not independent evidence.
- Historical feeds can contain later corrections. Date filtering does not prove that every input was published before the original prediction time.
- NFL outputs stop at regulation. A tie means overtime would be needed, not a final NFL tie. Final win/tie probabilities, overtime scoring and full-game market comparisons are withheld; no fitted possession/clock model is available.

## NBA: Philadelphia 76ers at Washington Wizards

Official date **2026-04-01**, ID `401810960`; target timestamp `2026-04-01T23:00Z`. [Complete row/calculation/draw ledger](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/simulation-deep/nba-example.json). API input fingerprint: `36aba7cfbb6b8edd6c5c29be5e828975eeb2ccb61cc9cac639c0638972416b9d`.

UI: open `/nba/simulation?date=2026-04-01`, choose this matchup, 10,000 runs and seed `final-deep-audit`, then Run simulation. Live UI results match these only if the source bytes and engine still match. The offline command above is the exact replay. Scope: **approximate-full-game**.

| Source filtering | Rows |
| --- | --- |
| Normalized raw rows | 339 |
| target-day or future | 23 |
| outside 450-day window | 66 |
| target game | 2 |
| identical duplicate | 6 |
| Unique prior-window rows | 242 |
| Verified regulation rows included in all prior terms | 242 |
| Included games with continuation scoring removed | 12 |

### League and venue arithmetic

| Term | Value |
| --- | --- |
| Weighted row mass M = Σw | 90.276405228 |
| Fixed league pseudo-score 40 × sport mean | 4480 |
| Weighted average-score sum Σw(H+A)/2 | 10522.342957376 |
| League numerator | 15002.342957376 |
| League denominator 40+M | 130.276405228 |
| League L = numerator / denominator | 115.157790324 |
| Weighted home-margin sum Σw(H−A) | 58.699279797 |
| Venue denominator M+80 | 170.276405228 |
| Raw home advantage | 0.344729381 |
| Venue clamp bounds | -8.96 to 8.96 |
| Clamped home advantage H | 0.344729381 |

### Team arithmetic

| Term | Away | Home |
| --- | --- | --- |
| Sample count | 30 | 30 |
| mass | 23.807109428 | 24.105115773 |
| denominator | 33.807109428 | 34.105115773 |
| pseudoScore | 1151.577903241 | 1151.577903241 |
| weightedScoredSum | 2763.180736652 | 2710.663130633 |
| weightedAllowedSum | 2805.252273386 | 3021.588041444 |
| offenseNumerator | 3914.758639892 | 3862.241033873 |
| defenseNumerator | 3956.830176626 | 4173.165944684 |
| offense | 115.796905034 | 113.245211058 |
| defense | 117.041363299 | 122.361875927 |
| pseudoVariance | 1690 | 1690 |
| squaredResidualSum | 6132.914659165 | 3216.899434466 |
| varianceNumerator | 7822.914659165 | 4906.899434466 |
| variance | 231.398507342 | 143.875759494 |
| historyWeight | 0.704204229 | 0.706788856 |
| leagueWeight | 0.295795771 | 0.293211144 |
| offenseContribution | 57.898452517 | 56.622605529 |
| defenseContribution | 61.180937964 | 58.520681649 |
| venueContribution | -0.172364691 | 0.172364691 |
| rawExpected | 118.90702579 | 115.315651869 |
| expected | 118.90702579 | 115.315651869 |
| clampAdjustment | 0 | 0 |
| Expected-score lower/upper bounds | 51.821005646 / 190.010354035 | 51.821005646 / 190.010354035 |

`denominator = shrink + mass`; `pseudoScore = shrink × L`. Offense/defense numerators add the row-weighted adjusted scored/allowed sums to pseudoScore. Variance numerator adds `shrink × sd²` to the weighted squared residual sum. Offense, defense and variance divide by denominator. Expected scoring is half offense + half opponent defense + target venue, clamped to the bounds. All row operands are in `calculations.leagueRows` and `calculations.teams.<side>.sample`. Variance affects basketball draws only; NFL/MLB use their event-family variance.

### First generated game, with its actual draws


| Side / period | U1 / U2 | Normal Z | Mean / variance | Raw score | Rounded, ≥0 |
| --- | --- | --- | --- | --- | --- |
| away / regulation | 0.89162978 / 0.235613281 | 0.043236926 | 118.90702579 / 231.398507342 | 119.564736768 | 120 |
| home / regulation | 0.372672224 / 0.547083993 | -1.343994063 | 115.315651869 / 143.875759494 | 99.194682056 | 99 |

First score **120–99**, away–home; continuation=false. That is one scenario, not the model forecast.

| Approximate final outcome | Count / 10,000 | Probability |
| --- | --- | --- |
| Home win | 4283 | 0.4283 |
| Away win | 5717 | 0.5717 |
| Tie | 0 | 0 |
| Regulation tie / OT needed (overlapping event) | 201 | 0.0201 |

| Quantity | Mean | Median | p10 | p90 |
| --- | --- | --- | --- | --- |
| away score | 119.0432 | 119 | 99 | 139 |
| home score | 115.5825 | 116 | 100 | 131 |
| Total | 234.6257 | 234 | 210 | 260 |
| Home−away margin | -3.4607 | -4 | -28 | 21 |

Team Wilson 95% Monte Carlo intervals: away 0.561975574–0.581369358; home 0.418630642–0.438024426.

**Illustrative prices only:** both sides −110; raw implied probability 0.523809524 each, proportional no-vig 0.5 each, overround 0.047619048. These are not saved bookmaker quotes. Moneyline selects home/away; spread uses home −3.5; total uses over/under. The PMFs in the ledger support any valid line.

| Market / line | Push | First unconditional / no-push | Second unconditional / no-push | First difference, pp |
| --- | --- | --- | --- | --- |
| moneyline / 0 | 0 | 0.4283 / 0.4283 | 0.5717 / 0.5717 | -7.17 |
| spread / -3.5 | 0 | 0.3686 / 0.3686 | 0.6314 / 0.6314 | -13.14 |
| total / 220.5 | 0 | 0.7570 / 0.7570 | 0.2430 / 0.2430 | 25.7 |

### Actual warnings

- Experimental probabilities. More runs reduce Monte Carlo noise; they do not establish model accuracy.
- Player availability, current lineups, weather and pregame pace are not inputs to this game-score model. Unknown inputs are not treated as confirmed absences or zero effects.
- Only verified regulation scores enter the historical prior. Inherited league mean and variance pseudo-observations have no regulation-only training provenance and remain uncalibrated.
- Team scores are independent before continuation rules; shared pace and game-script correlation are not modeled. Team histories also contribute to the league prior and are not independent evidence.
- Historical feeds can contain later corrections. Date filtering does not prove that every input was published before the original prediction time.
- Rounded score distributions and five-minute overtime continuations do not simulate possessions, lineups or intentional fouls.
- Historical pregame reconstruction: selected-game scores and live statistics are excluded. This was not a forecast captured before the game.
- The league baseline is estimated from the two teams’ schedule union, not a complete league sample.

## WNBA: Connecticut Sun at Washington Mystics

Official date **2026-09-22**, ID `401857208`; target timestamp `2026-09-22T23:30Z`. [Complete row/calculation/draw ledger](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/simulation-deep/wnba-example.json). API input fingerprint: `4fbcfdbec7805a2e20316c3d2a9da99186b19053f569501b75efcabb0a2261d6`.

UI: open `/wnba/simulation?date=2026-09-22`, choose this matchup, 10,000 runs and seed `final-deep-audit`, then Run simulation. Live UI results match these only if the source bytes and engine still match. The offline command above is the exact replay. Scope: **approximate-full-game**.

| Source filtering | Rows |
| --- | --- |
| Normalized raw rows | 176 |
| outside 450-day window | 33 |
| target game | 2 |
| incomplete | 2 |
| identical duplicate | 5 |
| Unique prior-window rows | 134 |
| Verified regulation rows included in all prior terms | 134 |
| Included games with continuation scoring removed | 5 |

### League and venue arithmetic

| Term | Value |
| --- | --- |
| Weighted row mass M = Σw | 50.171339678 |
| Fixed league pseudo-score 40 × sport mean | 3240 |
| Weighted average-score sum Σw(H+A)/2 | 4166.707236234 |
| League numerator | 7406.707236234 |
| League denominator 40+M | 90.171339678 |
| League L = numerator / denominator | 82.140370351 |
| Weighted home-margin sum Σw(H−A) | 120.593038771 |
| Venue denominator M+80 | 130.171339678 |
| Raw home advantage | 0.926417743 |
| Venue clamp bounds | -6.48 to 6.48 |
| Clamped home advantage H | 0.926417743 |

### Team arithmetic

| Term | Away | Home |
| --- | --- | --- |
| Sample count | 30 | 30 |
| mass | 19.781018206 | 20.146420098 |
| denominator | 29.781018206 | 30.146420098 |
| pseudoScore | 821.40370351 | 821.40370351 |
| weightedScoredSum | 1559.681564052 | 1705.496381983 |
| weightedAllowedSum | 1765.42654451 | 1621.107115555 |
| offenseNumerator | 2381.085267562 | 2526.900085493 |
| defenseNumerator | 2586.83024802 | 2442.510819065 |
| offense | 79.95311816 | 83.8209007 |
| defense | 86.861712723 | 81.021587676 |
| pseudoVariance | 1210 | 1210 |
| squaredResidualSum | 2478.367641797 | 3550.536025367 |
| varianceNumerator | 3688.367641797 | 4760.536025367 |
| variance | 123.849615089 | 157.913809 |
| historyWeight | 0.664215645 | 0.668285655 |
| leagueWeight | 0.335784355 | 0.331714345 |
| offenseContribution | 39.97655908 | 41.91045035 |
| defenseContribution | 40.510793838 | 43.430856362 |
| venueContribution | -0.463208872 | 0.463208872 |
| rawExpected | 80.024144046 | 85.804515583 |
| expected | 80.024144046 | 85.804515583 |
| clampAdjustment | 0 | 0 |
| Expected-score lower/upper bounds | 36.963166658 / 135.531611079 | 36.963166658 / 135.531611079 |

`denominator = shrink + mass`; `pseudoScore = shrink × L`. Offense/defense numerators add the row-weighted adjusted scored/allowed sums to pseudoScore. Variance numerator adds `shrink × sd²` to the weighted squared residual sum. Offense, defense and variance divide by denominator. Expected scoring is half offense + half opponent defense + target venue, clamped to the bounds. All row operands are in `calculations.leagueRows` and `calculations.teams.<side>.sample`. Variance affects basketball draws only; NFL/MLB use their event-family variance.

### First generated game, with its actual draws


| Side / period | U1 / U2 | Normal Z | Mean / variance | Raw score | Rounded, ≥0 |
| --- | --- | --- | --- | --- | --- |
| away / regulation | 0.89162978 / 0.235613281 | 0.043236926 | 80.024144046 / 123.849615089 | 80.505318038 | 81 |
| home / regulation | 0.372672224 / 0.547083993 | -1.343994063 | 85.804515583 / 157.913809 | 68.915380678 | 69 |

First score **81–69**, away–home; continuation=false. That is one scenario, not the model forecast.

| Approximate final outcome | Count / 10,000 | Probability |
| --- | --- | --- |
| Home win | 6342 | 0.6342 |
| Away win | 3658 | 0.3658 |
| Tie | 0 | 0 |
| Regulation tie / OT needed (overlapping event) | 213 | 0.0213 |

| Quantity | Mean | Median | p10 | p90 |
| --- | --- | --- | --- | --- |
| away score | 80.1654 | 80 | 65 | 95 |
| home score | 86.0621 | 86 | 69 | 102 |
| Total | 166.2275 | 166 | 144 | 188 |
| Home−away margin | 5.8967 | 6 | -16 | 27 |

Team Wilson 95% Monte Carlo intervals: away 0.356412793–0.375290276; home 0.624709724–0.643587207.

**Illustrative prices only:** both sides −110; raw implied probability 0.523809524 each, proportional no-vig 0.5 each, overround 0.047619048. These are not saved bookmaker quotes. Moneyline selects home/away; spread uses home −3.5; total uses over/under. The PMFs in the ledger support any valid line.

| Market / line | Push | First unconditional / no-push | Second unconditional / no-push | First difference, pp |
| --- | --- | --- | --- | --- |
| moneyline / 0 | 0 | 0.6342 / 0.6342 | 0.3658 / 0.3658 | 13.42 |
| spread / -3.5 | 0 | 0.5655 / 0.5655 | 0.4345 / 0.4345 | 6.55 |
| total / 160.5 | 0 | 0.6266 / 0.6266 | 0.3734 / 0.3734 | 12.66 |

### Actual warnings

- Experimental probabilities. More runs reduce Monte Carlo noise; they do not establish model accuracy.
- Player availability, current lineups, weather and pregame pace are not inputs to this game-score model. Unknown inputs are not treated as confirmed absences or zero effects.
- Only verified regulation scores enter the historical prior. Inherited league mean and variance pseudo-observations have no regulation-only training provenance and remain uncalibrated.
- Team scores are independent before continuation rules; shared pace and game-script correlation are not modeled. Team histories also contribute to the league prior and are not independent evidence.
- Historical feeds can contain later corrections. Date filtering does not prove that every input was published before the original prediction time.
- Rounded score distributions and five-minute overtime continuations do not simulate possessions, lineups or intentional fouls.
- Historical pregame reconstruction: selected-game scores and live statistics are excluded. This was not a forecast captured before the game.
- The league baseline is estimated from the two teams’ schedule union, not a complete league sample.

## MLB: Tampa Bay Rays at New York Yankees

Official date **2026-09-22**, ID `823543`; target timestamp `2026-09-22T17:05:00Z`. [Complete row/calculation/draw ledger](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/simulation-deep/mlb-example.json). API input fingerprint: `e19ce8a04f00c372fab6a2085e956ddddb153376c1813d6162fe9c9eb70a1fde`.

UI: open `/mlb/simulation?date=2026-09-22`, choose this matchup, 10,000 runs and seed `final-deep-audit`, then Run simulation. Live UI results match these only if the source bytes and engine still match. The offline command above is the exact replay. Scope: **approximate-full-game**.

| Source filtering | Rows |
| --- | --- |
| Normalized raw rows | 2539 |
| invalid identity or score | 26 |
| target game | 1 |
| identical duplicate | 3 |
| regulation scoring not established | 1 |
| Unique prior-window rows | 2509 |
| Verified regulation rows included in all prior terms | 2508 |
| Included games with continuation scoring removed | 209 |

Regulation exclusions: 777188: regulation scoring not established.

### League and venue arithmetic

| Term | Value |
| --- | --- |
| Weighted row mass M = Σw | 312.635337812 |
| Fixed league pseudo-score 40 × sport mean | 180 |
| Weighted average-score sum Σw(H+A)/2 | 1373.120801727 |
| League numerator | 1553.120801727 |
| League denominator 40+M | 352.635337812 |
| League L = numerator / denominator | 4.404325475 |
| Weighted home-margin sum Σw(H−A) | -8.621584757 |
| Venue denominator M+80 | 392.635337812 |
| Raw home advantage | -0.02195825 |
| Venue clamp bounds | -0.36 to 0.36 |
| Clamped home advantage H | -0.02195825 |

### Team arithmetic

| Term | Away | Home |
| --- | --- | --- |
| Sample count | 40 | 40 |
| mass | 12.029598114 | 12.447893882 |
| denominator | 27.029598114 | 27.447893882 |
| pseudoScore | 66.064882126 | 66.064882126 |
| weightedScoredSum | 51.667886615 | 52.502562547 |
| weightedAllowedSum | 51.830731306 | 52.93765185 |
| offenseNumerator | 117.732768741 | 118.567444673 |
| defenseNumerator | 117.895613432 | 119.002533976 |
| offense | 4.355698085 | 4.319728325 |
| defense | 4.361722765 | 4.335579789 |
| pseudoVariance | 153.6 | 153.6 |
| squaredResidualSum | 138.923793496 | 144.57811694 |
| varianceNumerator | 292.523793496 | 298.17811694 |
| variance | 10.822350827 | 10.863424284 |
| historyWeight | 0.445052792 | 0.453509983 |
| leagueWeight | 0.554947208 | 0.546490017 |
| offenseContribution | 2.177849042 | 2.159864163 |
| defenseContribution | 2.167789895 | 2.180861383 |
| venueContribution | 0.010979125 | -0.010979125 |
| rawExpected | 4.356618062 | 4.329746421 |
| expected | 4.356618062 | 4.329746421 |
| clampAdjustment | 0 | 0 |
| Expected-score lower/upper bounds | 1.981946464 / 7.267137034 | 1.981946464 / 7.267137034 |

`denominator = shrink + mass`; `pseudoScore = shrink × L`. Offense/defense numerators add the row-weighted adjusted scored/allowed sums to pseudoScore. Variance numerator adds `shrink × sd²` to the weighted squared residual sum. Offense, defense and variance divide by denominator. Expected scoring is half offense + half opponent defense + target venue, clamped to the bounds. All row operands are in `calculations.leagueRows` and `calculations.teams.<side>.sample`. Variance affects basketball draws only; NFL/MLB use their event-family variance.

### First generated game, with its actual draws

Each played half-inning draws three geometric run counts, one per abstract out: `floor(log(max(10⁻¹²,U))/log(1−p))`, with `p=1/(1+expected/27)`. These are run clusters, not individual batting events.

| Inning/side | Three uniforms | Runs per abstract out | Runner bonus | Sampled → recorded | Away–home |
| --- | --- | --- | --- | --- | --- |
| 1/away | 0.89162978, 0.235613281, 0.372672224 | 0, 0, 0 | 0 | 0 → 0 | 0–0 |
| 1/home | 0.547083993, 0.916800848, 0.499431409 | 0, 0, 0 | 0 | 0 → 0 | 0–0 |
| 2/away | 0.119479847, 0.94911659, 0.819476685 | 1, 0, 0 | 0 | 1 → 1 | 1–0 |
| 2/home | 0.092877307, 0.096829857, 0.054240118 | 1, 1, 1 | 0 | 3 → 3 | 1–3 |
| 3/away | 0.244285003, 0.665068441, 0.756109546 | 0, 0, 0 | 0 | 0 → 0 | 1–3 |
| 3/home | 0.490777833, 0.051673534, 0.8360996 | 0, 1, 0 | 0 | 1 → 1 | 1–4 |
| 4/away | 0.824767719, 0.294164917, 0.045652932 | 0, 0, 1 | 0 | 1 → 1 | 2–4 |
| 4/home | 0.672996012, 0.540273936, 0.587654426 | 0, 0, 0 | 0 | 0 → 0 | 2–4 |
| 5/away | 0.583182998, 0.255824589, 0.995103006 | 0, 0, 0 | 0 | 0 → 0 | 2–4 |
| 5/home | 0.321268205, 0.437955281, 0.151711626 | 0, 0, 0 | 0 | 0 → 0 | 2–4 |
| 6/away | 0.123817655, 0.179419801, 0.701640443 | 1, 0, 0 | 0 | 1 → 1 | 3–4 |
| 6/home | 0.219624522, 0.974124064, 0.463295179 | 0, 0, 0 | 0 | 0 → 0 | 3–4 |
| 7/away | 0.800979069, 0.768562556, 0.435951998 | 0, 0, 0 | 0 | 0 → 0 | 3–4 |
| 7/home | 0.344302906, 0.519794648, 0.945235934 | 0, 0, 0 | 0 | 0 → 0 | 3–4 |
| 8/away | 0.675287784, 0.378612066, 0.680862178 | 0, 0, 0 | 0 | 0 → 0 | 3–4 |
| 8/home | 0.843694529, 0.057098319, 0.128888084 | 0, 1, 1 | 0 | 2 → 2 | 3–6 |
| 9/away | 0.229647838, 0.250075913, 0.674541001 | 0, 0, 0 | 0 | 0 → 0 | 3–6 |
| 9/home | unplayed bottom | — | — | — | 3–6 |

Half-inning means / geometric success parameters: away: 0.484068674 / 0.861062247; home: 0.481082936 / 0.861800783.

First score **3–6**, away–home; continuation=false. That is one scenario, not the model forecast.

| Approximate final outcome | Count / 10,000 | Probability |
| --- | --- | --- |
| Home win | 4998 | 0.4998 |
| Away win | 5002 | 0.5002 |
| Tie | 0 | 0 |
| Extra innings (overlapping event) | 1295 | 0.1295 |

| Quantity | Mean | Median | p10 | p90 |
| --- | --- | --- | --- | --- |
| away score | 4.544 | 4 | 2 | 8 |
| home score | 4.3007 | 4 | 2 | 7 |
| Total | 8.8447 | 9 | 5 | 13 |
| Home−away margin | -0.2433 | -1 | -4 | 3 |

Team Wilson 95% Monte Carlo intervals: away 0.490401806–0.509998041; home 0.490001959–0.509598194.

**Market comparison withheld:** Aggregate walk-off margins are approximate; MLB odds comparisons are withheld. Score/total/margin distributions remain in the JSON, but do not support full-game sportsbook settlement.

### Actual warnings

- Experimental probabilities. More runs reduce Monte Carlo noise; they do not establish model accuracy.
- Player availability, current lineups, weather and pregame pace are not inputs to this game-score model. Unknown inputs are not treated as confirmed absences or zero effects.
- Only verified regulation scores enter the historical prior. Inherited league mean and variance pseudo-observations have no regulation-only training provenance and remain uncalibrated.
- Team scores are independent before continuation rules; shared pace and game-script correlation are not modeled. Team histories also contribute to the league prior and are not independent evidence.
- Historical feeds can contain later corrections. Date filtering does not prove that every input was published before the original prediction time.
- Run clustering, automatic-runner scoring and walk-offs are approximate. Walk-off home-run overshoots, starting pitchers and bullpens are not modeled.
- 1 earlier games lack reliable regulation scores and were excluded from every prior calculation. Missing overtime histories can create selection bias.
- MLB totals and margins are aggregate approximations, not event-faithful final-score distributions. Full-game market comparisons are withheld because walk-off home-run margins and batting exposure are unmodeled.
- Historical pregame reconstruction: selected-game scores and live statistics are excluded. This was not a forecast captured before the game.
- Neutral-site status is unverified; the scheduled home designation is used.
- 26 historical rows were excluded because their scores, identifiers or availability times were invalid.
- TB: the latest completed game is 67 days old; current team strength may differ.

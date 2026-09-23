# Standard-model measured results

Generated 2026-09-23T02:23:50.782Z. These are offline paired regression diagnostics on corrected cached data, with frozen weights. They are not newly untouched holdouts, true point-in-time pregame replay, sportsbook performance or profit estimates. See [audit and protocol](standard-model-audit.md).

All 80 market/model comparisons include MAE, RMSE, Brier/log loss when a probability exists, reliability bins, source receipts and code hashes in the local `reports/standard-model-audit.json`. Counts overlap across markets; do not add them as independent player-games.

## NFL original weighted model: separate expected-production estimates

Period: 2025-09-04 through 2026-02-08. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| any_td | 6246 | 285 | 0 | 0.302 → 0.302 | 0.30181 | 0.47863 | 0.13755 → 0.13755 | 0.4681 |
| pass_yds | 688 | 285 | 0 | 71.86338 → 71.86338 | 71.32602 | 92.8514 | — → — | — |
| pass_tds | 688 | 285 | 665 | 0.90827 → 0.89447 | 0.91875 | 1.13453 | — → — | — |
| rush_yds | 930 | 285 | 0 | 31.42449 → 31.42449 | 26.71514 | 39.30607 | — → — | — |
| rush_attempts | 3257 | 285 | 0 | 2.24276 → 2.24276 | 2.24276 | 3.56166 | — → — | — |
| rec | 5249 | 285 | 5249 | 1.28014 → 1.29485 | 1.29991 | 1.7544 | — → — | — |
| rec_yds | 5249 | 285 | 0 | 16.94208 → 16.94208 | 16.94208 | 24.60163 | — → — | — |
| pass_attempts | 688 | 285 | 0 | 8.87706 → 8.87706 | 8.87706 | 11.99155 | — → — | — |
| pass_completions | 688 | 285 | 0 | 6.06015 → 6.06015 | 6.06015 | 8.00697 | — → — | — |
| pass_interceptions | 688 | 285 | 0 | 0.6532 → 0.6532 | 0.6532 | 0.86656 | — → — | — |
| rush_rec_yds | 5997 | 285 | 0 | 20.14584 → 20.14584 | 20.14584 | 28.76547 | — → — | — |

The 0–100 score itself is never interpreted as a probability. TD Brier/log loss use the separate rushing/receiving-TD occurrence estimate. Other rows measure the existing projected statistic; rushing-yard projections use the NGS-covered subset. All available historical rating values were also compared.

- pass_tds: 0 rating changes, maximum score difference 0; approximate equal-game paired MAE change -0.01229, 95% descriptive interval [-0.01942, -0.00516].
- rec: 0 rating changes, maximum score difference 0; approximate equal-game paired MAE change 0.01504, 95% descriptive interval [0.01162, 0.01846].

## NFL direct workload point forecast

Period: 2025-09-04 through 2026-02-08. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| any_td | 5688 | 285 | 0 | 0.26564 → 0.26564 | 0.2693 | 0.38689 | 0.14969 → 0.14969 | 0.71024 |
| pass_yds | 607 | 284 | 0 | 69.0058 → 69.0058 | 70.13311 | 88.55392 | — → — | — |
| pass_tds | 607 | 284 | 0 | 0.93727 → 0.93727 | 0.95156 | 1.16805 | — → — | — |
| rush_yds | 2986 | 285 | 0 | 13.56165 → 13.56165 | 13.40342 | 22.74281 | — → — | — |
| rush_attempts | 2986 | 285 | 0 | 2.25374 → 2.25374 | 2.21989 | 3.61232 | — → — | — |
| rec | 4931 | 285 | 0 | 1.32409 → 1.32409 | 1.3061 | 1.81758 | — → — | — |
| rec_yds | 4931 | 285 | 0 | 17.06849 → 17.06849 | 17.08047 | 24.87472 | — → — | — |
| pass_attempts | 607 | 284 | 0 | 8.46293 → 8.46293 | 8.49588 | 11.22536 | — → — | — |
| pass_completions | 607 | 284 | 0 | 5.72408 → 5.72408 | 5.81186 | 7.52042 | — → — | — |
| pass_interceptions | 607 | 284 | 0 | 0.63692 → 0.63692 | 0.66293 | 0.82183 | — → — | — |
| rush_rec_yds | 5561 | 285 | 0 | 20.45632 → 20.45632 | 20.3271 | 29.14011 | — → — | — |

## MLB frozen count regression

Period: 2025-04-02 through 2025-09-28. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| hr | 43601 | 2316 | 0 | 0.20843 → 0.20843 | 0.20524 | 0.34634 | 0.09703 → 0.09703 | 0.34052 |
| hits | 43601 | 2316 | 0 | 0.68239 → 0.68239 | 0.71314 | 0.86159 | 0.23838 → 0.23838 | 0.66964 |
| k | 3595 | 2088 | 0 | 1.82081 → 1.82081 | 1.8959 | 2.29152 | 0.19607 → 0.19607 | 0.5761 |
| tb | 43601 | 2316 | 0 | 1.31796 → 1.31796 | 1.34563 | 1.73233 | 0.23903 → 0.23903 | 0.67095 |
| rbi | 43601 | 2316 | 0 | 0.61401 → 0.61401 | 0.6091 | 0.82582 | 0.2012 → 0.2012 | 0.59129 |
| runs | 43601 | 2316 | 0 | 0.5635 → 0.5635 | 0.55773 | 0.66491 | 0.22589 → 0.22589 | 0.6437 |
| hrr | 43601 | 2316 | 0 | 1.48125 → 1.48125 | 1.51572 | 1.89926 | 0.2404 → 0.2404 | 0.67362 |
| sb | 43601 | 2316 | 0 | 0.12574 → 0.12574 | 0.12131 | 0.26915 | 0.05669 → 0.05669 | 0.21756 |
| singles | 43601 | 2316 | 0 | 0.60913 → 0.60913 | 0.60656 | 0.70988 | 0.2413 → 0.2413 | 0.6755 |
| doubles | 43601 | 2316 | 0 | 0.27859 → 0.27859 | 0.27282 | 0.39828 | 0.12687 → 0.12687 | 0.42043 |
| bb | 43601 | 2316 | 0 | 0.45118 → 0.45118 | 0.44126 | 0.55634 | 0.1926 → 0.1926 | 0.57179 |
| batter_k | 43601 | 2316 | 0 | 0.66625 → 0.66625 | 0.68827 | 0.82915 | 0.23427 → 0.23427 | 0.66099 |
| outs | 3595 | 2088 | 0 | 2.73442 → 2.73442 | 2.86007 | 3.60611 | 0.18863 → 0.18863 | 0.56321 |
| er | 3595 | 2088 | 0 | 1.60831 → 1.60831 | 1.66275 | 1.9704 | 0.23031 → 0.23031 | 0.65313 |
| hits_allowed | 3595 | 2088 | 0 | 1.72292 → 1.72292 | 1.83168 | 2.13573 | 0.18096 → 0.18096 | 0.54659 |
| walks_allowed | 3595 | 2088 | 0 | 1.00664 → 1.00664 | 1.05638 | 1.24707 | 0.14221 → 0.14221 | 0.45527 |

## WNBA standard forecast

Period: 2025-08-15 through 2025-10-11. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| points | 1795 | 100 | 0 | 4.09914 → 4.09914 | 4.20713 | 5.25611 | 0.10944 → 0.10944 | 0.34824 |
| rebounds | 1795 | 100 | 0 | 1.72185 → 1.72185 | 1.78162 | 2.2534 | 0.12176 → 0.12176 | 0.39042 |
| assists | 1795 | 100 | 0 | 1.25167 → 1.25167 | 1.30841 | 1.69181 | 0.1132 → 0.1132 | 0.35427 |
| threes | 1795 | 100 | 0 | 0.73806 → 0.73806 | 0.75911 | 1.04079 | 0.13562 → 0.13562 | 0.41221 |
| pra | 1795 | 100 | 0 | 5.25483 → 5.25483 | 5.43822 | 6.70125 | 0.09868 → 0.09868 | 0.31548 |
| pr | 1795 | 100 | 0 | 4.85695 → 4.85695 | 5.02964 | 6.19976 | 0.10765 → 0.10765 | 0.34131 |
| pa | 1795 | 100 | 0 | 4.48661 → 4.48661 | 4.61326 | 5.74449 | 0.09406 → 0.09406 | 0.2999 |
| ra | 1795 | 100 | 0 | 2.32329 → 2.32329 | 2.4068 | 3.00782 | 0.12078 → 0.12078 | 0.37953 |
| steals | 1795 | 100 | 0 | 0.73432 → 0.73432 | 0.75231 | 0.96457 | 0.21769 → 0.21769 | 0.62352 |
| blocks | 1795 | 100 | 0 | 0.48485 → 0.48485 | 0.48123 | 0.70913 | 0.17255 → 0.17255 | 0.5193 |
| stocks | 1795 | 100 | 0 | 0.9271 → 0.9271 | 0.96813 | 1.21115 | 0.18989 → 0.18989 | 0.56017 |
| turnovers | 1795 | 100 | 0 | 0.88158 → 0.88158 | 0.92423 | 1.13583 | 0.12426 → 0.12426 | 0.39056 |
| fgm | 1795 | 100 | 0 | 1.58993 → 1.58993 | 1.64368 | 2.03834 | 0.11889 → 0.11889 | 0.37938 |
| fga | 1795 | 100 | 0 | 2.56383 → 2.56383 | 2.62429 | 3.29881 | 0.09025 → 0.09025 | 0.29091 |
| ftm | 1795 | 100 | 0 | 1.27431 → 1.27431 | 1.29159 | 1.78824 | 0.13526 → 0.13526 | 0.42795 |

## NBA standard forecast

Period: 2026-03-23 through 2026-04-12. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| points | 742 | 49 | 0 | 4.64778 → 4.64778 | 4.88356 | 6.21298 | 0.10344 → 0.10344 | 0.35037 |
| rebounds | 742 | 49 | 0 | 1.88496 → 1.88496 | 1.94906 | 2.4715 | 0.14709 → 0.14709 | 0.47828 |
| assists | 742 | 49 | 0 | 1.39668 → 1.39668 | 1.46631 | 1.90679 | 0.10741 → 0.10741 | 0.34583 |
| threes | 742 | 49 | 0 | 0.90529 → 0.90529 | 0.93423 | 1.25707 | 0.12025 → 0.12025 | 0.37818 |
| pra | 742 | 49 | 0 | 6.04841 → 6.04841 | 6.21105 | 8.0109 | 0.09671 → 0.09671 | 0.34563 |
| pr | 742 | 49 | 0 | 5.52688 → 5.52688 | 5.72156 | 7.28695 | 0.1013 → 0.1013 | 0.34598 |
| pa | 742 | 49 | 0 | 5.09757 → 5.09757 | 5.33531 | 6.86571 | 0.09117 → 0.09117 | 0.31736 |
| ra | 742 | 49 | 0 | 2.63999 → 2.63999 | 2.70269 | 3.49271 | 0.12558 → 0.12558 | 0.42212 |
| steals | 742 | 49 | 0 | 0.67878 → 0.67878 | 0.6965 | 0.89027 | 0.22556 → 0.22556 | 0.64718 |
| blocks | 742 | 49 | 0 | 0.48841 → 0.48841 | 0.46765 | 0.66755 | 0.18973 → 0.18973 | 0.56669 |
| turnovers | 742 | 49 | 0 | 0.92351 → 0.92351 | 0.95607 | 1.20273 | 0.1172 → 0.1172 | 0.37784 |

## NHL standard forecast

Period: 2026-03-26 through 2026-04-17. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| shots | 1715 | 64 | 0 | 1.0346 → 1.0346 | 1.09878 | 1.34955 | 0.15107 → 0.15107 | 0.46842 |
| goals | 1715 | 64 | 0 | 0.29829 → 0.29829 | 0.30088 | 0.47256 | 0.13659 → 0.13659 | 0.43524 |
| assists | 1715 | 64 | 0 | 0.44439 → 0.44439 | 0.45434 | 0.61225 | 0.19125 → 0.19125 | 0.56907 |
| points | 1715 | 64 | 0 | 0.59074 → 0.59074 | 0.60991 | 0.78611 | 0.21903 → 0.21903 | 0.62837 |
| blocks | 1715 | 64 | 0 | 0.72871 → 0.72871 | 0.76245 | 0.95665 | 0.12534 → 0.12534 | 0.40337 |
| hits | 1715 | 64 | 0 | 0.89371 → 0.89371 | 0.88362 | 1.17213 | 0.16338 → 0.16338 | 0.49734 |
| saves | 88 | 63 | 0 | 5.77432 → 5.77432 | 6.27273 | 7.29886 | 0.24439 → 0.24439 | 0.68022 |

## Soccer standard forecast

Period: 2026-05-11 through 2026-09-20. Market-specific periods and cohorts are retained in the JSON.

| Market | Paired N | Games | Changed estimates | MAE before → after | Baseline MAE | RMSE after | Brier before → after | Log loss after |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: |
| shots | 1898 | 136 | 0 | 0.87591 → 0.87591 | 0.87376 | 1.16867 | 0.16004 → 0.16004 | 0.49672 |
| sot | 1898 | 136 | 0 | 0.4479 → 0.4479 | 0.42951 | 0.64339 | 0.16833 → 0.16833 | 0.52178 |
| goals | 1898 | 136 | 0 | 0.19366 → 0.19366 | 0.18683 | 0.36646 | 0.08751 → 0.08751 | 0.31181 |
| assists | 1898 | 136 | 0 | 0.15241 → 0.15241 | 0.15711 | 0.32725 | 0.07381 → 0.07381 | 0.28362 |
| fouls | 1898 | 136 | 0 | 0.76352 → 0.76352 | 0.80348 | 0.97937 | 0.16823 → 0.16823 | 0.51731 |
| cards | 1898 | 136 | 0 | 0.23208 → 0.23208 | 0.22972 | 0.35009 | 0.12143 → 0.12143 | 0.41691 |
| saves | 120 | 104 | 0 | 1.42158 → 1.42158 | 1.485 | 1.75456 | 0.23503 → 0.23503 | 0.66203 |
| team_goals | 180 | 136 | 0 | 0.98256 → 0.98256 | 1.10111 | 1.29082 | 0.23595 → 0.23595 | 0.66492 |
| corners | 180 | 136 | 0 | 2.3712 → 2.3712 | 2.50556 | 2.91182 | 0.25073 → 0.25073 | 0.69639 |

## Interpretation and limits

The passing-TD and reception denominator corrections are mathematical repairs. Their mixed measured effects do not support a general accuracy claim. Full-data weights were retained. Unchanged outputs on clean historical data are expected for freshness, missing-input and dependency fixes; targeted tests exercise those failure cases.

The NFL workload comparison isolates the existing workload/efficiency point calculation, without current injury/team-volume scenarios, context corrections or calibrated error pools. Its TD probability column is the raw occurrence estimate, not the calibrated line probability. MLB compares its frozen base regression/distribution without unavailable historical lineup/pitcher/weather layers. NBA/WNBA/NHL/soccer compare the same direct model with all present-day context disabled. The original validation artifact metrics are not silently reassigned to experimental scenario layers.

Baselines: NFL earlier five-game mean/TD frequency; MLB existing 60/40 form estimate and earlier empirical threshold frequency; other sports earlier five-game mean and empirical threshold frequency. Probability metrics use research thresholds (listed in JSON), not sportsbook lines. All before/after metrics use the same paired cohort. Invalid/absent outputs are reported as unpaired, not zero errors.

Game-cluster intervals average paired absolute-error differences per game, then use an approximate normal interval. They do not fully address repeated-player/time correlation. Calibration tables in JSON show predicted vs observed rate in ten fixed bins. No calibration was fitted on the evaluated periods.

No sufficient chronological live-state archive exists for measuring the deterministic live player guards. Current-data publication timing, injured/DNP roster populations, postseason roles, sparse soccer/goalie samples and novel lineup/minute scenarios require prospective validation. The simulation results are entirely separate.

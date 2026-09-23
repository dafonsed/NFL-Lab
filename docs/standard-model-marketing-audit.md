# Marketing-readiness audit: standard sports prediction features

Reviewed September 22–23, 2026, against current workspace code, the standard-model reports, cached project data and the hosted site's static UI. **The confirmed copy mismatches are fixed locally. The hosted site still serves older copy; this audit did not deploy anything.** The product can be described as experimental sports research. The evidence does not support general accuracy, production validation, profitability or guaranteed betting-success claims.

## 1. Routes and claims reviewed

The public landing page at [nfl-lab-xi.vercel.app](https://nfl-lab-xi.vercel.app/) rendered successfully at 1440, 390 and 320 pixels. Five public HTML routes and nine static assets returned HTTP 200. Public API requests were excluded to protect production archives. Public HTML/scripts still contain the drought bonuses, excluded-return TD explanation, obsolete MLB adjustment description, separate-accuracy-tracking claim and unchanged-rating claim. See [reports/marketing/public-site.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/public-site.json:1) and [reports/marketing/public-browser.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/public-browser.json:1). The public homepage also uses “Your next pick,” NFL “Your weekly advantage,” and MLB “Your daily edge.” Those labels lack evidence of a betting advantage; current local headers use independent-research wording instead. These local header changes predate this audit and are not attributed to it.

Local route coverage (real server, isolated copy of project data):

| Route family | Claims and controls reviewed |
| --- | --- |
| / | Product positioning, sport coverage, source attribution, limitations, workspace entry links |
| /nfl; ?view=board, games, metrics; Opportunity and Line movement UI source | Research scores, TD probability scope, gap indicators, weights, sources, historical samples, filters, player dialogs and market controls |
| /mlb; date=2026-09-22 | Fitted projections, form rating, probability/hit-rate distinction, lineup labels, methodology and model-evidence dialogs |
| /nba; /wnba; /nhl; /soccer | Amounts/probabilities, shared research dialogs, model evidence, missing inputs, WNBA rankings |
| All six sports with ?view=trends | Historical chart/line meaning, sample windows, sources and freshness |
| /live; /nfl/live; /mlb/live; /nba/live; /wnba/live | Supported live sports, clock scope, recorded versus projected production, manual lines, pause/freshness and adjacent simulation EV |
| /simulation and six sport /simulation routes | Supported/unsupported states, scenario/probability language, sampling uncertainty and separate companion player forecasts |
| /performance; /paper; /paper?sport=mlb; /bets | Historical versus saved records, paper profits versus real returns, personal storage and unavailable states |

There are no separate player/game URL templates: the standard boards use date/week/game/market query parameters, game views and player dialogs. No separate onboarding wizard was found; the landing workflow and shared “Reading the numbers” guide provide onboarding. No fake testimonials, user counts, pricing, guarantees or new features were added. No “AI” claim was found in the reviewed prediction copy; only MLB's fitted count regressions are described as trained.

## 2. Claim-by-claim decisions

Verdicts describe the **pre-correction claim** unless the row says it was retained. “Supported” verifies implementation or narrowly described evidence, not predictive success.

| Route / view | Claim reviewed | Source and calculation/evidence | Verdict | Correction or disposition |
| --- | --- | --- | --- | --- |
| /; all sport navigation | Six research sports; four live/simulation sports | [public/home.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/home.html:31); [lib/site-layout.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/site-layout.mjs:3); [lib/sports/config.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/config.mjs:1) | Accurate and supported | Kept. NHL/soccer simulation routes explicitly say unsupported; no connected soccer public player lines are promised. |
| /; six standard boards | Experimental estimates without a prominent production-validation qualification | [public/home.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/home.html:16); [docs/standard-model-final-verification.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-final-verification.md:26) | Accurate but missing necessary context | Added production-accuracy qualification on landing and standard board captions/notices. This does not mean no historical evidence exists. |
| /nfl?view=metrics; /nfl?view=board | 0–100 research ratings and configured weights | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:185); [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs:3); [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:142) | Accurate and supported | Kept the weights, caps and distinction from probabilities. No rating arithmetic changed. |
| /nfl?view=metrics | Final score adds drought bonus; +8/+5 rules | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:188); [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:133) | Misleading or contradicted | Removed the bonus rules. Current dueBonus is zero; drought is descriptive. Final formula now says 60% baseline + 40% opportunity, with its missing-context fallback. |
| /nfl; Opportunity view; filters | “Due only” implies future regression; Opportunity includes drought bonuses | [public/index.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/index.html:30); [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:147); [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:72) | Misleading or contradicted | Renamed to “Gap signals,” added explanatory tooltip and exact existing gap thresholds. Filter behavior is unchanged. |
| /nfl?view=metrics; comparison dialog | Missing factors omitted and weights rescaled; same calculation method across players | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:185); [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs:8); [docs/standard-model-deep-explanation.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-deep-explanation.md:288) | Accurate but missing necessary context | Clarified real zero retains weight and comparability across missingness patterns is unproven. Comparison dialog repeats this limitation. |
| /nfl?view=metrics; profile TD sort/comparison | Profile rushing/receiving TD estimate has no injury adjustment | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:187); [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:150); [lib/nfl-opportunities.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/nfl-opportunities.mjs:112) | Misleading or contradicted | Distinguished the uncalibrated rush/receive profile estimate, its optional experimental teammate adjustment, and the separate workload forecast. Labeled profile TD sort/comparison explicitly. |
| /nfl player dialog and player cards; TD market | Workload TD forecast excludes return touchdowns | [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:67); [lib/forecast.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/forecast.mjs:37); [lib/forecast.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/forecast.mjs:80) | Misleading or contradicted | Now includes rushing, receiving and special-teams TDs; passing TDs remain separate. Existing probability selection and numeric formatting are unchanged. |
| Shared NFL player chart; /nfl?view=metrics | “Return TDs” label and statement that all model TD outputs exclude returns | [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:17); [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:9); [lib/results.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/results.mjs:19) | Accurate but missing necessary context | Chart labels use the actual special_teams_tds field. Explained profile versus workload versus result settlement; settlement may additionally use scoring-player PBP TDs. |
| /nfl?view=metrics; metric tooltips | Passing TD rates per modeled attempt; receptions per assigned target | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:192); [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:19); [docs/standard-model-final-verification.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-final-verification.md:38) | Accurate and supported | Kept. Passing attempt population excludes sacks/spikes; receiverless attempts are included. These are opportunity diagnostics, not the separate workload forecast or proof of better accuracy. |
| All shared player dialogs; all Trends routes | Historical hit rates and game charts | [public/player-research.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/player-research.js:160); [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:51); [public/trends-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/trends-data.js:3) | Accurate and supported | Kept. Same comparison line is applied to sampled games; pushes remain in the sample denominator. H2H/year filters cannot recover missing history. |
| /mlb; Data & methodology | Model does not yet use opponent, weather, lineup spot or injuries | [public/mlb.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb.js:59); [lib/mlb/forecast.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/forecast.mjs:18); [lib/mlb/opportunities.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/opportunities.mjs:1); [lib/mlb/matchup.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/matchup.mjs:1) | Misleading or contradicted | Listed gated opponent/weather correction and experimental pitcher, batting-order, starter and opposing-lineup adjustments; injury gates; no ballpark coefficient. |
| /mlb on historical/future dates | Header always says today’s games | [public/mlb.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb.html:12); [public/mlb.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb.js:20) | Misleading or contradicted | Changed to “for the selected date.” Date selection logic unchanged. |
| /mlb; player/evidence dialog | Trained count model versus original form rating | [public/mlb-model.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb-model.js:11); [lib/mlb/forecast-core.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/forecast-core.mjs:1); [lib/mlb/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/model.mjs:15) | Accurate and supported | Kept. This model really has fitted coefficients. Form rating remains a separate recent-production score, not an event probability. |
| /mlb; Model & evidence | Historical 2025 error/calibration evidence presented without immediate reuse limitation | [public/mlb-model.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb-model.js:20); [docs/standard-model-deep-explanation.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-deep-explanation.md:244); [lib/mlb/forecast.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/forecast.mjs:14) | Accurate but missing necessary context | Added limitation at the dialog introduction and main board caption: 2025 has been inspected and does not validate today’s full serving stack or production accuracy. |
| /mlb; Model & evidence | Fixed test thresholds were declared before testing | [public/mlb-model.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb-model.js:20); [lib/mlb/forecast-core.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/forecast-core.mjs:1); [docs/standard-model-deep-explanation.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-deep-explanation.md:244) | Unsupported or unverifiable | Removed the historical predeclaration claim. Code/artifact thresholds are inspectable; a prior registration or immutable pre-test declaration was not established. |
| NFL/MLB player input explanations | Added scenarios’ accuracy is tracked separately from original model | [public/context-ui.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/context-ui.js:8); [lib/predictions.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/predictions.mjs:54); [lib/paper.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/paper.mjs:18); [docs/standard-model-deep-explanation.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-deep-explanation.md:244) | Unsupported or unverifiable | Replaced with: base-model historical results do not validate added adjustments; production accuracy unverified. Saving scenarios or versioned records is not independent validation. |
| /nba; /wnba; /nhl; /soccer | Board describes all displayed estimates as “ratings” | [public/sports.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports.js:32); [lib/sports/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/model.mjs:1); [public/sports-view.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports-view.js:1) | Accurate but missing necessary context | Now distinguishes projected amounts and probabilities. WNBA ranking caption explains different player lines and that ranking is not betting value. |
| /wnba; Model & evidence | WNBA-specific model, 40-minute regulation and historical evidence | [public/sports.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports.js:65); [lib/sports/config.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/config.mjs:1); [lib/sports/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/model.mjs:8) | Accurate and supported | Kept base-model/scenario limitations. Historical diagnostic and season evidence are not prospective validation of injury/lineup scenarios. |
| /nfl?view=metrics | Every dataset rechecked every 15 minutes whenever server runs | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:194); [lib/providers.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/providers.mjs:36); [server.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/server.mjs:89) | Misleading or contradicted | Clarified local optional auto-sync, hosted on-request refresh, current-input 15-minute window and 24-hour older/participation cache. No freshness policy changed. |
| /nba; /wnba; /nhl; /soccer; all Trends | “Sources checked”/“Schedule verified” can overstate successful/fresh retrieval | [public/sports.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports.js:23); [public/trends.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/trends.js:94); [lib/sports/source.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/source.mjs:1) | Accurate but missing necessary context | Changed neutral success labels to “Board loaded · check source timestamps” and “Schedule loaded · no listed games.” Existing warnings and retrieval gates remain. |
| NFL/MLB and shared sports source dialogs | Named public sources, source receipts, posted/archived lines and incomplete coverage | [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:203); [lib/providers.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/providers.mjs:11); [lib/mlb/provider.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/mlb/provider.mjs:1); [lib/props.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/props.mjs:1); [lib/sports/props.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/sports/props.mjs:1) | Accurate and supported | Kept. FanDuel-first is a preference, not complete coverage or verified state-specific price. Fetch time is not proof of publication before a historical game. |
| /nfl/live; player Inputs & exact weights | No automatic in-game injury verification | [public/live.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live.js:85); [lib/live-nfl-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-nfl-model.mjs:28); [lib/live-nfl-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-nfl-model.mjs:78) | Misleading or contradicted | Now states reported-out/ejected players and stale injury feeds pause projections, while unreported injuries/substitutions may be missed. Manual pause remains. |
| /nfl/live; /mlb/live; /nba/live; /wnba/live | Player totals beside game probabilities/EV | [public/live.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live.html:14); [lib/live-nfl-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-nfl-model.mjs:71); [lib/live-sports-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-sports-model.mjs:107); [lib/live-game-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-game-model.mjs:18) | Accurate but missing necessary context | Prominent disclosure separates player projections from game simulation and says production validation is absent. No direct live player probability/EV is implied. |
| Live game comparison panel | Estimated EV, fair odds and market probability | [public/live-game.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live-game.js:39); [lib/live-game-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-game-model.mjs:18); [lib/live-game-model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/live-game-model.mjs:24) | Accurate and supported | Retained actual EV formula: win probability × net payout minus loss probability; pushes return stake. It is model-dependent, not demonstrated profitability. Renamed explanation heading to “Simulation assumptions & inputs.” |
| /simulation; supported sport simulation routes | “Model confidence & limitations” labels a warning list | [public/simulation.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/simulation.js:52); [public/simulation.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/simulation.js:52); [lib/game-simulation.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/game-simulation.mjs:1) | Accurate but missing necessary context | Renamed to assumptions/limitations. Existing simulation-noise and uncalibrated-probability warnings retained. Simulation calculations untouched. |
| Simulation companion player props | Existing player forecasts are separate from game draws | [public/simulation-props.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/simulation-props.js:11); [lib/simulation-props.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/simulation-props.mjs:106) | Accurate and supported | Kept. Standard model results are displayed alongside simulation, not produced by it. Count/seed do not change player estimates; same-game prop correlations are not modeled. |
| /performance | Original NFL rating and weights unchanged | [public/performance.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/performance.html:4); [docs/standard-model-change-summary.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-change-summary.md:9); [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs:3) | Misleading or contradicted | Now distinguishes unchanged configured weights from calculation/missing-input fixes that can change scores. This page evaluates the separate workload/context forecast. |
| /performance; /paper; /paper?sport=mlb | Saved pregame forecasts and hypothetical paper returns | [public/paper.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/paper.js:9); [lib/predictions.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/predictions.mjs:54); [lib/paper.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/paper.mjs:9) | Accurate and supported | Kept distinction from retrospective tests, actual placed bets and sportsbook-specific settlement. No profitable strategy or overall accuracy claim added. |
| /paper empty state | “Confirmed availability checks” can imply confirmed participation | [public/paper.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/paper.js:9); [lib/availability.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/availability.mjs:1); [lib/paper.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/paper.mjs:25) | Accurate but missing necessary context | Changed to availability checks with explicit “not proof of participation.” |
| /bets; saved players; notes; Appearance | Personal records/settings stored in this browser | [public/home.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/home.html:34); [public/bets.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/bets.js:1); [public/player-research.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/player-research.js:140); [public/workspace-ui.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/workspace-ui.js:51) | Accurate and supported | Kept browser-storage/no-sync qualification. Save and note interactions verified in disposable browser context. No user tickets changed. |

### TD scope, explicitly

* **Profile TD estimate:** rushing and receiving opportunity conversion, with optional experimental teammate adjustment; excludes special-teams TDs. It is not a calibrated probability. Source: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs:150) and [lib/nfl-opportunities.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/nfl-opportunities.mjs:112).
* **Workload TD point:** 1 − exp(−lambda), where lambda includes carries × rushing-TD rate, targets × receiving-TD rate, and mean historical special_teams_tds. The displayed player summary uses the existing calibrated over probability when supplied, otherwise the point. Source: [lib/forecast.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/forecast.mjs:37) and [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:64).
* **Research chart:** sums rushing_tds + receiving_tds + special_teams_tds. **Result settlement:** may additionally count scoring-player PBP TDs through its existing result rule. Neither scope includes TD passes thrown by a passer as that passer's anytime TD. Source: [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:9) and [lib/results.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/results.mjs:1).

These copy corrections do not change any of those numbers. “Special-teams TDs” names the actual supplied field; the UI does not claim to reconstruct every bookmaker's touchdown-settlement rules.

### Historical evidence is not a marketing accuracy claim

[docs/standard-model-final-verification.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-final-verification.md:76) reports a paired retrospective diagnostic for September 4, 2025–February 8, 2026: passing-TD MAE 0.908268895 → 0.894468023 (688 rows), reception MAE 1.280140789 → 1.294846256 (5,249 rows). Passing TDs improved there; receptions worsened. These are profile projected statistics, not the separately served workload forecast. Revised source data, repeated players/games and previously inspected periods prevent using this as an untouched production accuracy test. No evaluation was rerun or tuned for this copy audit. See [reports/final-standard-verification.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/final-standard-verification.json:1) and [docs/standard-model-deep-explanation.md](C:/Users/eturn/Desktop/nfl-anayltics-app/docs/standard-model-deep-explanation.md:244) for the original diagnostic details and limitations.

## 3. Browser evidence and journey results

34 local route/query cases rendered at **1440, 390 and 320 pixels**: 102 page/layout observations, all settled, no document-level horizontal overflow. 15/15 targeted interactions passed, each also captured at desktop and mobile widths; no JavaScript page exceptions occurred in these flows. This is representative route/flow coverage, not proof that every market/book/date combination or every external source works.

[reports/marketing/routes.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/routes.json:1) contains HTTP results, controls, status text and screenshot names. [reports/marketing/flows.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/flows.json:1) contains each action, assertion and outcome. Adjacent plain-text files contain rendered body text, including copy below the initial viewport.

| Targeted interaction | Result |
| --- | --- |
| nfl-player-controls | PASS |
| mlb-methodology | PASS |
| mlb-model-evidence | PASS |
| mlb-player | PASS |
| nba-player | PASS |
| wnba-player | PASS |
| nhl-player | PASS |
| soccer-player | PASS |
| wnba-ranking-controls | PASS |
| mobile-navigation | PASS |
| mlb-unavailable-retry | PASS |
| live-paused | PASS |
| nfl-simulation-controls | PASS |
| landing-to-player | PASS |
| nfl-drought-methodology | PASS |

Screenshots:

* Corrected TD explanation: [desktop](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/landing-to-player-1440.png:1) / [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/landing-to-player-390.png:1).
* No drought bonus and historical gap explanation: [desktop](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/nfl-drought-methodology-1440.png:1) / [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/nfl-drought-methodology-390.png:1).
* Corrected MLB adjustments: [desktop](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/mlb-methodology-1440.png:1) / [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/mlb-methodology-390.png:1).
* Current local landing: [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/home-390.png:1); deployed older landing: [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/public-home-390.png:1).
* Unavailable-state retry: [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/mlb-unavailable-retry-390.png:1); live paused state: [mobile](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/live-paused-390.png:1).

**Observed failures and limits:** four local API calls returned 500: today's MLB board and today's MLB/NBA/WNBA simulation catalogs. Their upstream MLB/ESPN retrievals failed in the restricted environment; the UI showed explicit unavailable/retry states. Cached MLB September 22, NBA April 10, NHL April 9 and soccer September 19 boards and player dialogs loaded. Some external images failed with ERR_NETWORK_ACCESS_DENIED. These are not hidden or counted as working live feeds. NBA/soccer default dates correctly showed no listed games. All four live routes displayed paused/stale states; a healthy in-progress public feed was not verified.

The initial simulation browser assertion expected the loading placeholder's wording, which the real response replaces with an equivalent stronger disclosure. The audit harness was corrected to assert the actual “not draws from the game-score simulation” wording; it then passed. [reports/marketing/flows-initial.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/flows-initial.json:1) preserves that initial result. No application/model fix was made for this assertion.

## 4. Exact checks and changes

Local server command (PowerShell):

~~~powershell
$env:DATA_DIR = 'C:\Users\eturn\Desktop\nfl-anayltics-app\.research\marketing-data'
$env:PORT = '3201'
$env:AUTO_SYNC = '0'
node server.mjs
~~~

The directory was copied from project caches before starting; normal page-capture side effects were confined to this isolated copy. The server was stopped and the temporary copy removed after verification; the command log includes the copy command needed to reproduce it. Production APIs were not called. No production predictions or saved production archives were tested or modified.

~~~text
node --test test/player-research.test.mjs test/explanations.test.mjs test/site-layout.test.mjs test/trends-dashboard.test.mjs test/wnba-rankings.test.mjs test/live-game.test.mjs test/simulation-props.test.mjs
57 tests; 57 pass; 0 fail; 0 skipped

npm run check
exit 0

node --check public/simulation.js
node --check scripts/audit-marketing-browser.mjs
node --check scripts/audit-marketing-flows.mjs
all exit 0

node scripts/audit-marketing-flows.mjs
node scripts/audit-marketing-flows.mjs nfl-simulation-controls
node scripts/audit-marketing-flows.mjs landing-to-player nfl-drought-methodology
final 15/15 PASS
~~~

Route-audit commands are recorded in [reports/marketing/commands.txt](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/commands.txt:1). Test outputs: [reports/marketing/focused-tests.log](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/focused-tests.log:1) and [reports/marketing/syntax-check.log](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/syntax-check.log:1). The first focused run was 56/57: an existing UI test expected “Why the model believes this.” Only that expected heading was updated to “Simulation assumptions & inputs”; model assertions remained intact. [reports/marketing/focused-tests-initial.log](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/focused-tests-initial.log:1) retains the initial failure. No bundle/build script exists; the project syntax command was used. A full model suite and retraining were unnecessary for these copy-only edits and were not run.

**Attributable changes:** 18 presentation files, one existing heading assertion, two browser-audit scripts and this new report. [reports/marketing/copy.patch](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/copy.patch:1) isolates the exact before/after copy edits against the starting workspace snapshot, rather than Git HEAD. [reports/marketing/edited-files.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/edited-files.json:1) lists them and concurrent UI edits that are not attributed to this audit. Existing standard-model reports were not rewritten.

* [public/app.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/app.js:1).
* [public/context-ui.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/context-ui.js:1).
* [public/home.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/home.html:1).
* [public/index.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/index.html:1).
* [public/live-game.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live-game.js:1).
* [public/live-sports.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live-sports.html:1).
* [public/live.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live.html:1).
* [public/live.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/live.js:1).
* [public/mlb-model.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb-model.js:1).
* [public/mlb.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb.html:1).
* [public/mlb.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/mlb.js:1).
* [public/paper.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/paper.js:1).
* [public/performance.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/performance.html:1).
* [public/research-data.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/research-data.js:1).
* [public/simulation.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/simulation.js:1).
* [public/sports.html](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports.html:1).
* [public/sports.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/sports.js:1).
* [public/trends.js](C:/Users/eturn/Desktop/nfl-anayltics-app/public/trends.js:1).

## 5. What remains unverified

| Claim / condition | Status | What is needed |
| --- | --- | --- |
| Fixes are live on the public deployment | NOT VERIFIED / not deployed by this audit | Deploy the reviewed copy through the normal release process, then repeat public browser checks. The fetched public scripts still contain the old claims. |
| Production standard-model accuracy, probability calibration or profitability | NOT VERIFIED | Timestamped production forecasts, known publication/line timing, settled outcomes and suitable prospective analysis; historical/local evidence is insufficient. |
| Public deployed data-backed player/game flows | NOT VERIFIED | A read-only production test strategy or authorized staging environment with production-equivalent inputs. This audit deliberately did not call production APIs that can save forecasts. |
| Healthy live feeds and complete sportsbook coverage | NOT VERIFIED | Fresh in-progress games, reachable sources, feed-age checks and market-specific coverage. Paused/failed retrieval behavior was tested locally. |
| Equal ranking meaning across missing-factor patterns | NOT VERIFIED | Prospective or stratified ranking evaluation; the new copy makes no equivalence claim. |
| Historical input was published before original kickoff | NOT VERIFIED | Point-in-time input archives/publication receipts. Earlier event dates alone do not establish this. |
| Every supported control at every market/date/book | NOT VERIFIED | Broader combinations and external integrations; this audit verifies the listed representative flows only. |

## 6. Scope confirmation and release recommendation

**No serving calculation, configured weight, fitted artifact, eligibility rule, prediction number, simulation algorithm or original saved prediction archive was changed by this audit.** All 113 protected files (current lib tree, including model artifacts, plus original prediction archive files) match their starting SHA-256 hashes: [reports/marketing/protected-files.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/marketing/protected-files.json:1). Public presentation changes preserve formulas and numerical expressions. The browser used a disposable copy of local data and a disposable personal-storage context.

Keep the copy corrections. Describe the product as experimental research with inspectable data and model-specific historical evidence. Do not advertise a proven betting edge, overall accuracy improvement, calibrated live player probabilities, production validation or profitability. **Do not call the public release fully verified yet:** the hosted copy is older, and production data-backed/healthy-live flows remain unverified.

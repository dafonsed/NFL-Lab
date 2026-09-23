# Sportslab UI completion checklist

Scope: existing frontend, all six research/Trends routes, four live routes, simulation, performance, paper returns, picks and details. Preserve model logic, data contracts and records. Baseline and browser evidence: `.research/product-polish/`.

| Area | Observed issue / correction | Implemented | Verified |
| --- | --- | --- | --- |
| Shared system / shell | Competing override layers, gradient actions, small metadata; charcoal tokens, solid actions, restrained selection, compact mobile controls | Done | All routes; persisted density, reduced motion, Dev mode, mobile navigation and filter presets |
| MLB matchups | Tall cards, favorable-looking scores; compact aligned scorecards, neutral scores, real team codes, usable matchup search | Done | Search/clear, doubleheaders, pitchers, sources, long names and five viewport sizes |
| Player research | Repeated availability warning/prose, tall cards; precise historical context and aligned metrics, separate final outcomes | Done | All six sports; save, reload, notes, details, market/window/line controls |
| NFL movement | Ambiguous numeric labels; verified positive home advantage, neutral signed changes and actual observation times | Done | Week change/reload, custom-week dialog, observation expansion, horizontal table access |
| Live | Large lead-in, ambiguous baseball count/withheld reason; compact scoreboard, adjacent reasons and stable refresh | Done | Four real live routes; final/unavailable states; explicit browser fixtures for active estimates, extra innings, transitional counts and stale refresh |
| Bet editor | Entire dialog scrolls, footer competes with fields; independent body, fixed header/footer, errors and unsaved confirmation | Done | Quick Search, Pick a game, manual, single/parlay, create/edit/delete, focus/Escape, persistence, duplicate submit and storage failure |
| Trends / player details | Tiny supporting labels and overflowing Save action; aligned controls and corrected unavailable-status explanation | Done | Six sports; L5/L10, custom line, venue, sorting, matchup/availability/insight tabs and full details |
| Simulation / evidence / paper | Small labels and repeated context; readable charts and optional value tables, explicit unsupported sports, clearer saved-record terminology | Done | Four real simulation runs, distributions/exports/input invalidation; performance filters/export; paper records/error/retry |
| Responsive / accessibility | Five viewports, keyboard, accessible names, contrast and reduced motion | Done | 1440×900, 1280×800, 768×1024, 390×844, 360×800; also a 390×460 reduced dialog viewport |
| Final checks | Syntax, tests, complete route sweep and workflow regression | Done | 356 tests; syntax checks; 36 route/view cases plus bet dialog; no page overflow or uncaught browser errors |

Current uncommitted work was copied before editing. No backend model changes are part of this task.

## Route inventory

- `/`: existing workspace chooser and sport navigation.
- `/nfl`, `/mlb`, `/nba`, `/wnba`, `/nhl`, `/soccer`: Research and each sport’s `?view=trends`.
- NFL: matchups, player rankings (`board`), opportunity (`viper`), movement (`edge`), methodology (`metrics`). MLB: daily board, matchups (`games`), watchlist (`saved`). WNBA: players and `rankings`, including rank direction and individual/all-game selection.
- `/live`, `/nfl/live`, `/mlb/live`, `/nba/live`, `/wnba/live`.
- `/simulation` and all six sport-prefixed simulation paths. NFL/NBA/WNBA/MLB run real simulations; NHL/Soccer have explicit unavailable states and links to their supported research.
- `/performance`, `/paper` for NFL and MLB, `/bets`.
- Player research dialogs, model/source evidence, pregame records, appearance/workspace/filter sheets, bet create/edit/delete/discard dialogs.

## Verification evidence

Local preview: `http://127.0.0.1:3127`. Evidence lives in `.research/product-polish/`.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Existing syntax commands | `npm run check`, `npm run check:simulation` passed | `check.log`, `check-simulation.log` |
| Tests | `npm test`: 356 passed, 0 failed, 0 skipped | `tests.log` |
| Added presentation tests | Historical availability cannot imply participation; count ordering/singular outs; withheld reason; missing versus zero movement | `test/presentation.test.mjs` |
| Route screenshots / responsive sweep | 36 route/view cases plus bet dialog; five sizes; no page-wide overflow, uncaught JS errors or console errors | `final/results.json` and screenshots |
| New workflow regressions | 11 groups passed; includes a scheduled auto-refresh cycle | `workflows/results.json`; `scripts/ui-completion-verify.mjs` |
| Detail / live / empty-state checks | 13 groups passed | `deep/results.json` |
| Saved players / notes / parlay persistence | 7 groups passed in isolated browser storage | `deep/persistence.json` |
| Week, rankings and simulation checks | 8 groups passed, including all four supported sports’ real runs | `navigation-simulation.json` and `deep/*-simulation-*.png` |
| Existing frontend interaction suite | 8 groups passed: navigation, exports, performance, real simulation, retry and race guards | `reports/frontend/interactions-1790141602338.json` |
| Appearance / filters / cross-sport Trends | Passed: density, reduced motion, Dev mode, presets, cancel/apply/clear, saved state, mobile menus | `.research/product-polish/verify-interactions.mjs` console output |
| Failure responses | 15 deliberately failed API states displayed an error and released loading/refresh controls | `deep/errors.json` |
| Text contrast | No remaining failures in the measured solid-surface text across nine representative routes/dialogs; gradients, SVG text and opacity effects excluded from this automated measurement | `contrast.json` |
| Preservation | All baseline `lib/` module hashes unchanged; existing unrelated working-tree changes retained | `baseline/backend-hashes.json`, `baseline/working-tree.patch` |

The project has no separate build, TypeScript, or lint command. Syntax checks, the existing Node test suite, and real Chromium workflows were used. The only server edit for this audit is serving the new presentation-helper module.

## Visual evidence

Open `.research/product-polish/visual-review.html` for nine matched before/after pairs: desktop/mobile research, MLB matchups, desktop/mobile Live, movement, desktop/mobile bet entry, and the bottom of the bet form. Original PNGs are in `before/` and `final/` at matching sizes. Final populated simulation screenshots and readable value tables are in `deep/`.

These are actual application screenshots. Explicitly named workflow fixtures are separate and are not used as the representative before/after product images.

## Limits and remaining checks

- No unresolved frontend blocker was found in the exercised flows. This is a bounded verification record, not a claim that every possible data combination is defect-free.
- Physical iOS/Android keyboards, Safari/Firefox, and a full assistive-technology audit were not available. The dialog was verified in Chromium at five widths and a reduced keyboard-sized viewport; keyboard focus, Escape and focus return were exercised.
- The selected real games were final. Active editable live estimates and extra-inning/transitional counts were exercised with browser-only response fixtures. Final feeds, timestamps, manual refresh and unavailable outputs used real responses. This does not certify continuous live-provider availability.
- No provider integration, model audit, calibration change or fabricated application data was added. Bet records used for testing were disposable and isolated from the user’s browser storage.
- Changes remain local alongside the pre-existing model/simulation work. Production was not deployed as part of this UI audit.

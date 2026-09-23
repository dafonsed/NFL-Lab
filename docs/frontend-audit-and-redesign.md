# Frontend audit and redesign

Date: September 22, 2026. Implemented in the existing plain HTML/CSS/JavaScript app. No framework or runtime dependency was added. This report covers the consolidated frontend work, including independent browser QA shared by the concurrent frontend task.

## Routes and states reviewed

| Area | Routes / states | Main files |
| --- | --- | --- |
| Public entry | `/` | `public/home.html` |
| NFL research | `/nfl`, `/?view=games`, `?view=board`, `?view=viper`, `?view=edge`, `?view=metrics`; all 11 market selectors | `public/index.html`, `public/app.js` |
| MLB research | `/mlb`; daily board, matchups, watchlist, 16 market selectors, side comparison | `public/mlb.html`, `public/mlb.js`, `public/mlb-model.js` |
| Other research | `/nba`, `/wnba`, `/nhl`, `/soccer`; WNBA rankings and sport-specific date/game/league controls | `public/sports.html`, `public/sports.js` |
| Trends | `/{nfl,mlb,nba,wnba,nhl,soccer}?view=trends` | `public/trends.html`, `public/trends.js` |
| Player analysis | Six-sport player dialogs; game windows, venue, manual line, over/under, logs, sources, availability, notes, saved players | `public/player-research.js`, `public/research-data.js` |
| Live | `/live`, `/{nfl,mlb,nba,wnba}/live`; date/game/market, pause, manual player lines, source and model details | `public/live*.html`, `public/live*.js` |
| Simulation | `/simulation`, `/{nfl,mlb,nba,wnba}/simulation`; explicit unsupported states for NHL and soccer | `public/simulation.html`, `public/simulation.js`, `public/simulation-props.js` |
| Evidence | `/performance`, `/paper`, `/paper?sport=mlb`; historical split, market filters, pagination, downloads | `public/performance.*`, `public/paper.*` |
| Personal records | `/bets`; empty and populated ledger, single/parlay editor, result filters, export, edit and delete | `public/bets.*`, `public/bet-editor.js` |
| Shared settings/navigation | Appearance, density, reduced motion, Dev mode, filter presets, desktop rail and mobile More menu | `lib/site-layout.mjs`, `public/workspace-ui.js`, `public/site-preferences.js` |

There are no implemented accounts, authentication, pricing, subscriptions or upgrade flows to redesign. None were invented.

## Important findings and fixes

1. **The entry screen did not explain real product coverage.** `public/home.html` was mainly a choice between two tools, without source context, model limits, or coverage distinctions. It now explains the research workflow, links directly to all six sports, and distinguishes six-sport research from four-sport Live/Simulation and the narrower performance/paper archives.
2. **Visual styling was layered and inconsistent below the main screens.** `public/app-design.css` had repeated chrome overrides, decorative textures, legacy grayscale MLB charts, and incomplete treatment of `.live-card`, `.mlb-game`, evidence sections, tracker controls and simulation results. The active system now uses a darker navy base, consistent surfaces/borders, restrained blue/violet/cyan accents, pill actions, readable metadata and tabular numbers. Deeper views and dialogs use the same system.
3. **Metric context and freshness were hard to discover.** Every tool now includes a visible, route-specific caveat with an expandable metric guide. It distinguishes historical statistics, ratings, model probabilities, implied probabilities, manual inputs, prediction ranges and Monte Carlo uncertainty. Trends freshness moved from the footer to the top of the workspace, and stale/partial data notes open automatically. The shared archive link explicitly says “NFL performance.”
4. **Missing values looked like data in a few secondary views.** MLB's empty spark chart drew a flat bar; it now says history is unavailable. Its populated chart has a full accessible description and labeled date/value tooltips. Empty report tables now explain the absence of records instead of showing only headers. Performance errors no longer leave the historical section saying “Loading.”
5. **Evidence dialogs lacked accessible names and a reachable close control.** Shared dialogs now derive their names from visible headings and have a sticky header band. The band prevents the close button from covering fields while scrolling. Existing native dialog focus behavior and Escape handling remain intact.
6. **Some asynchronous transitions could retain outdated state.** Trends now checks request identity before assigning a returned catalog; sports research clears old board context on a new selection and ignores obsolete errors. Paper requests abort older loads, check catalog identity, expose busy/error/retry states, and keep export disabled until a valid report loads.
7. **Simulation controls could show results for edited inputs.** Changed seed/run count clears previous results, date/game transitions invalidate pending results, stale schedules cannot re-enable Run via another input, schedule failures have a retry action, and unavailable distributions have an explicit empty state. These are frontend guards; simulation math was not changed by this redesign.
8. **Phone controls could fit the page but still be unreadable.** Rendered inspection caught simulation date/run/seed controls compressed into one row. They now form a usable grid with full-width date/game fields and a clear Run action. Dialogs, charts, comparison cards, forms and tables were checked at narrow widths. Tables and market strips retain deliberate internal scrolling.
9. **The ticket editor lost keyboard focus on ordinary field commits.** `public/bet-editor.js` redrew the whole editor on label/line blur, replacing the next focused input. Rendering is now limited to structural controls (selects and date); typed values continue updating state without replacing the form. Numeric validation and settlement arithmetic are unchanged.

## Design and accessibility

- System fonts; shared foreground, muted, accent, warning, control, surface and border tokens. Normal body text remains readable; dense numeric columns use tabular figures.
- Blue model values, teal historical success accents and text outcome labels. A rating's color does not imply a calibrated probability.
- Visible focus outlines, hover/active/disabled states, labeled inputs, native disclosure controls, accessible dialog names and chart descriptions.
- Compact spacing is an actual saved preference. Reduced motion respects both operating-system and app settings.
- Shared navigation and metric context render from the server. Compatible period/market/game selections survive switching between Research and Trends.
- Existing model inputs, technical details, warnings, source links, manual comparisons, exports and local storage are retained.

## Verification

The app was started locally on port 3199. The concurrent frontend task also supplied browser checks against its network-enabled local server on port 3109; both use the same workspace assets. All browser test records and tickets use isolated browser contexts.

- Route sweeps cover home, all six research and Trends routes, NFL secondary views, MLB matchup/watchlist, WNBA rankings, four live routes and the live directory, simulation and unsupported states, performance, both paper sports, and the tracker.
- Layout checks use **1440, 768, 390 and 320 CSS pixels**. Screenshots were inspected, including deeper content and dialogs. No page or dialog horizontal overflow was observed in the final checked states. Internal table/market scrolling is intentional.
- Functional checks cover navigation and selection persistence, searching, sort/filter apply/cancel/reset, escaped and persisted filter presets, six-sport player tabs/history windows/venue/custom lines/logs, saved-player and note persistence, appearance and Dev mode, keyboard/closed-dialog focus, live pause/search/markets, evidence dialogs, archive filters/split/pagination, and CSV/JSON downloads.
- A real NFL historical simulation ran successfully; its two distributions, result export, narrow layouts and clearing on edited input were verified. Synthetic responses were used only in isolated failure tests, never as product analytics.
- The independent deep suite passed 13 checks with no JavaScript errors. Fifteen injected API-503 states checked readable failures, busy reset, enabled retries and narrow layouts. Main and secondary browser sweeps likewise found no uncaught JavaScript errors.
- `node scripts/frontend-interactions.mjs`: eight interaction groups passed, covering real data, simulation, export, state transitions and failure recovery. Runtime/browser locations can be overridden with `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`; app URL uses `FRONTEND_URL`.
- `node scripts/frontend-browser.mjs`: route screenshots and structured results under `reports/frontend/`. Specific routes may be passed as arguments.

Final configured checks: `npm run check` passed; `npm run check:simulation` passed; `npm test` passed **351/351 tests**, with zero failures or skips. The extra five tests added during verification belong to the concurrent simulation audit. This project has no separate frontend build script; syntax checks and the Node test suite are the configured checks.

The connected-plus-manual parlay regression also passed after the editor fix: consecutive label/line entry, Tab to the next control, save, reload, edit and delete. See [the independent completion QA record](interface-completion-qa.md).

## Limits and scope

Public feed access differed between the local server processes. Cached/stale, unavailable, no-game, historical/final and populated states were tested; feed freshness or continuous behavior during a future live game cannot be certified by this session. No predictive-accuracy claim is made by these UI checks. A complete assistive-technology audit across screen-reader/browser combinations was not performed.

The repository already contained uncommitted model, simulation and other task work. This redesign did not alter backend model formulas, weights, model results, API contracts, or stored user data. Any backend differences visible in the overall working tree belong to that separate work; they were preserved.

[Outlier](https://www.outlier.bet/) was reviewed only for high-level hierarchy, readability and product presentation. Sports Lab retains its own brand, implementation, copy, icons/assets, capabilities and evidence. No Outlier assets, proprietary layouts, testimonials, pricing or performance claims were copied.

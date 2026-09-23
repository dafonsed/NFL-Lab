# Research design correction

The previous table-first presentation did not match the supplied research reference. This correction changes the default composition, not only its colors.

## Implemented

- Shared player-first research workspace on the homepage and all six sport research pages. A compact gradient player header, market strip, white selected history tabs, prominent emerald/red results chart, matchup panel and line observations establish the hierarchy.
- Existing comparison boards remain under Board. The player chooser supports search and URL restoration. Filters, saved views, notes, comparison, model details and source disclosures remain accessible.
- Trends uses the same chart-first composition and a player chooser on desktop and mobile.
- Shared near-black surfaces, typography, controls and semantic colors apply to Live, Simulation, Performance, Paper returns, My picks and the bet editor.
- Mobile selection focuses and scrolls to the chosen player. Long charts have deliberate horizontal scrolling; axis dates shorten without changing their underlying values. Full labels remain in chart titles and game logs.

The change preserves existing models, source values, calculations and storage contracts. Historical data, archived quotes, missing values and withheld estimates remain labeled. The screenshots use actual application data.

## Rendered evidence

- [Reference, implemented panel, desktop before/after and mobile gallery](../.research/reference-rebuild/comparison.html)
- [Desktop research](../.research/reference-rebuild/after/selected-player-1440.png)
- [Mobile research](../.research/reference-rebuild/after/selected-player-mobile-focus.png)
- [Live page](../.research/product-polish/reference-final/mlb-live-1440.png)
- [Bet dialog](../.research/product-polish/reference-final/bet-dialog-1440.png)
- [Mobile bet dialog footer](../.research/product-polish/reference-final/bet-dialog-bottom-390.png)

## Verification

Final checks are recorded in `.research/reference-rebuild`:

| Check | Result |
| --- | --- |
| `npm run check` and `npm run check:simulation` | Passed |
| `npm test` | 359 passed, 0 failed |
| Research and Trends browser workflows | 8 passed |
| Bet editor and Live regression workflows | 11 passed |
| Route/dialog screenshot matrix | 38 states at five viewport sizes; no detected page overflow, page errors or console errors |
| Mobile player selection | Research receives focus and scrolls into view; reduced motion respected |

The eight research workflows cover every supported sport, player selection and reload, market/window/venue changes, custom comparison lines, notes, saving, board/detail access, and Trends selection/refresh. The eleven editor/Live workflows cover isolated create/edit/delete records, validation, draft retention, duplicate prevention, focus, footer access, storage failure, live refresh failures and model-unavailable states. Failure and transition paths use labeled test fixtures; ordinary route screenshots use existing application responses.

Viewport sizes: 1440 × 900, 1280 × 800, 768 × 1024, 390 × 844 and 360 × 800. Browser verification uses Chromium. Reduced dialog height approximates keyboard constraints; a physical mobile keyboard, Safari and screen readers were not tested. No authenticated Outlier session was accessed. Changes are local and have not been deployed in this run.

# Interactive homepage demo

September 23, 2026. Replaces the two static “Inside Sportslab” screenshots with native HTML controls and SVG charts.

## Implemented

- Research: six sports, twelve fictional players, three statistics per sport, L5/L10/L20/H2H, home/away filters, Over/Under and numerical line entry.
- The comparison line supports mouse and touch dragging, arrow keys, Home/End and Escape cancellation. Hit rates, counts, ties, bar colors and line values update together.
- Selectable chart bars, individual game details, supporting averages and an expandable game log.
- Matchup position filters and explanatory disclosure; selectable sample line observations; editable player notes.
- Trends: search, sport filtering, sorting, game samples, bookmarks, saved-only filtering and opening any player in Research.
- Clear empty states and recovery actions. Reset restores the initial demo and clears its saves and notes.

## Data boundary

The persistent demo label identifies fictional players and sample games. Values are deterministic fixtures from `public/demo-data.js`; no live odds, provider requests or production models are involved. Hit rates and descriptive statistics are calculated from the selected sample. Matchup numbers and line observations are explicitly illustrative. This is not a forecast or an actual betting record.

State lives only in memory. Saves and notes are separate from the application’s records, do not write to browser storage, and reset on reload. The “Open real research” link leaves the demo for the selected sport’s actual workspace. The retired screenshot files and serving entries are removed.

## Browser checks

All thirteen interaction groups passed in `.research/homepage-demo/interaction-results.json`: sample/location filtering and empty recovery; line entry and ties; mouse drag; Escape cancellation; bar details and game log; line history and matchup controls; notes and saves; Trends search/filter/sort/drill-in; custom-line and sample consistency between views; all 36 player/stat combinations; keyboard tabs; reset and unchanged existing storage; touch dragging and mobile reset.

Research and Trends were rendered at 1440, 1280, 768, 390 and 360 px widths with no page-wide horizontal overflow. Narrow charts and tables have their own horizontal scrolling. The mobile player header was corrected after screenshot review. Captures are in `.research/homepage-demo/`; `mobile-final.png` shows the corrected layout. No homepage API requests or console/JavaScript errors occurred.

The release is validated separately from concurrent workspace-navigation edits. Those unrelated changes are preserved outside the demo commit.

- `npm run check`: passed in the isolated release.
- `npm test`: 377 passed, zero failures or skips in the isolated release.
- Both browser scripts passed against that release on port 3145, including mouse/touch interactions and all five viewport widths.

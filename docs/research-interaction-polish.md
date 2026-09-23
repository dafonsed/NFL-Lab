# Research text and draggable comparison lines

Implemented and browser-verified September 23, 2026 on http://127.0.0.1:3131.

| Area | Correction | Verification |
| --- | --- | --- |
| Injury receipt | Clear status and excluded-player count; source timing in a disclosure; report action; missing timestamps remain unavailable; failed checks retain their reason | Real current board, isolated stale-response fixture, desktop and narrow mobile |
| Matchup details | Aligned opponent/league values, units and sample count; complete calculation explanation in a disclosure | Research and Trends across six sports; no values recalculated |
| Shared explanatory text | Consistent sans-serif copy, readable spacing, calmer disclosures in existing black/blue/cyan system | Research plus home, four live pages, simulation, performance, paper returns, My picks and bet dialog |
| Comparison chart | Drag pill or dashed stroke, mouse/touch, half-point steps, keyboard arrows, Shift for five points, Home/End and Escape cancellation | All six sports in Research and Trends; player dialog; mobile touch and chart scrolling |
| Comparison integrity | Hit rates, bar colors, splits and visible game logs update together; custom comparison identified; original book line retained; original quote odds/probability not reapplied to custom lines | Browser assertions and unit coverage |
| Trends controls | Over/Under next to the chart; open game log retained while adjusting; focus restored | Under, ties, bounds, keyboard and pointer checks |

Verification completed:

- `npm run check` and `npm run check:simulation`: passed. New modules included in the syntax check and static-asset deployment test.
- `npm test`: 372 passed, zero failures or skips.
- 14 draggable-line browser groups passed in `.research/drag-line/results.json`.
- 4 additional groups passed in `.research/drag-line/extra-results.json`: before/after captures, stale injury response, Under/pushes/game log, and touch dragging plus horizontal scrolling.
- 8 existing research-workflow groups passed: six sports, home selection/empty recovery, and Trends selection/detail/refresh.
- 10 representative route/dialog states checked at 1440, 1280, 768, 390 and 360 pixels: no page overflow, JavaScript errors or console errors. Results are in `.research/product-polish/readable-details-final/results.json`.
- `git diff --check` for the edited tracked files passed.

Visual evidence: `.research/drag-line/comparison.html`, with matched before/after research screenshots; additional route screenshots in `.research/product-polish/readable-details-final`.

Browser verification used Chromium, including emulated touch. Physical-device Safari/VoiceOver was not tested. No production deployment was performed. Existing model calculations, provider contracts and stored user records were preserved. Unrelated preexisting working-tree changes were left intact.

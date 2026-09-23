# Compact public homepage

The public homepage was reviewed against the rendered desktop version of https://www.outlier.bet/ on September 23, 2026. Sportslab now uses a centered headline, black canvas, blue/cyan headline and action accents, outlined navigation action, and a product-led feature section. Sportslab's identity, copy and native demo remain its own.

## Implementation and review

| Area | Change | Verification |
| --- | --- | --- |
| Homepage | Centered hero, compact sports row, interactive example board, tool links and FAQ disclosures | Desktop, laptop, tablet and mobile screenshots reviewed |
| Research demo | Combined identity and selectors; smaller vector chart; advanced filters, stats and game log in a disclosure | Default desktop height reduced from 1,297 to 693 px at 1440 px width, with no fixed-height crop or nested vertical scrolling |
| Trends demo | Four rows per page with Previous/Next controls; filters reset the page; removals clamp the page | All 12 players reachable, first/last boundaries and keyboard focus checked |
| Mobile | Matchup/history/notes disclosure, retained horizontal chart/table access | Notes survive closing/reopening; filter changes retain expanded controls; reset closes them |
| Feature section | Three sample-player rows open their corresponding demo chart; board link opens Trends | Names, sport and baseline comparison line agree with the chosen example |
| Data boundary | Explicitly fictional fixtures, no provider/model changes, no browser-storage writes | Zero API calls; preexisting browser records unchanged |

## Browser checks

Sixteen interaction groups passed: game-window and location filters; empty recovery; numerical thresholds and ties; Over/Under; keyboard, mouse and touch line controls; Escape cancellation; bar/game log details; line observations and position filters; notes; saves and saved-only recovery; search and sorting; pagination; all 36 player/stat combinations; workspace tabs; feature links; reset and unchanged storage. A mobile disclosure race found during verification was fixed by synchronizing its open state before a filter rerenders the controls.

Widths checked: 1440, 1280, 768, 390 and 360 px. No page-wide overflow or JavaScript errors. The default research demo is 693 px tall on desktop, 740 px at tablet width, and 816 px on phones. Trends is 728 px tall on desktop and 830 px on phones. Expanded details intentionally grow with their content.

Before/after screenshots and browser scripts are retained in the ignored `.research/landing-refresh/` directory. `before-desktop.png` and `after-desktop.png` share a 1440 × 900 browser viewport; `before-mobile.png` and `after-mobile.png` share a 390 × 844 viewport. Cropped demo, Trends, hero and narrow-screen captures are also included there.

Changes are isolated to public landing-page assets and the matching homepage heading expectation. Concurrent workspace navigation edits remain outside this release.

- Isolated release: `npm run check` passed; `npm test` passed all 377 tests with no failures or skips.
- Both full interaction and five-width screenshot checks passed against that isolated release on port 3147.
- Additional keyboard checks passed for the advanced-controls disclosure and FAQ. Mobile table paging, horizontal access to the save column, and reset also passed.

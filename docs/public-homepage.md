# Sportslab public homepage

Implemented September 23, 2026.

The main domain previously rendered `home.html`, immediately fetched a research board, and rewrote `/` with a selected player. The root now serves a separate public homepage. The existing research overview lives at `/research`.

| Area | Implementation | Verification |
| --- | --- | --- |
| Public entry | Black, blue and cyan shared identity; simple public navigation; workspace previews; six sport entry points; real research tool links | Rendered at 1440 × 900, 1280 × 800, 768 × 1024, 390 × 844 and 360 × 800; no horizontal page overflow |
| Product previews | Screenshots of actual NFL research and WNBA trends, explicitly labelled static and dated; links to the real tools | Images loaded, click and keyboard tab switching checked |
| Workspace separation | `/research` retains the existing player workspace, filters and sources; app overview links point there; the brand returns to `/` | Homepage → research → homepage verified; all six sport links opened with the correct selected sport |
| Existing bookmarks | Root research queries redirect to `/research`; legacy NFL view/week queries redirect to `/nfl`; original query values are retained | Server regression tests and browser checks for player and season/week URLs |
| Fast public page | No sports API requests, workspace initialization or data-dependent loading state on `/` | Zero API calls and zero console/JavaScript errors on the homepage; 16 unique internal links returned 200 |

## Verification

- `npm run check`: passed.
- `npm test`: 374 passed, zero failures or skips.
- `git diff --check`: passed.
- At the checked date, NFL, MLB, WNBA and NHL research populated; NBA and Soccer returned the existing successful no-games state. No schedules or data were fabricated.
- A saved link to a non-default MLB player retained that player after redirect and manual refresh.
- Responsive preview tabs support click, arrow keys, Home and End. All navigation and primary entry links use ordinary anchors.

Local visual evidence is in `.research/homepage/`: `production-before.png` and `desktop-after.png` use the same 1440 × 1200 viewport; `mobile-after.png`, `narrow-after.png` and `tablet-after.png` capture the final responsive presentation. Full-page captures and browser assertions are also retained there. The two shipped preview assets are original captures of this application, not invented product data.

This change affects presentation and routing. It does not change data providers, model calculations or browser-stored research records.

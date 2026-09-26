# Reference reproduction verification — September 24, 2026

Latest instruction: reproduce the supplied dark Outlier designs directly. This supersedes the earlier request for a purple accent. Keep the application's real data and supported actions.

## Visible source mapping

- Desktop shell, toolbar, table density, neutral controls: dark Props screenshot `codex-clipboard-087db619-cf42-46ab-bd2a-f493b4917d9a.png` and folder references 043–045.
- Player identity, window strip, chart, supporting stats, line movement and right context column: dark desktop research screenshot `codex-clipboard-84ed070f-9450-44f7-b7c7-7ae0625d39a9.png`; folder references 031 and 053.
- Filters and team selectors: folder references 045–052, 079–088.
- Mobile board and research: supplied dark mobile Props and player screenshots.
- Homepage composition: public outlier.bet homepage inspected in the browser. Sportslab keeps its own branding and copy.
- Simulation and personal picks use the same supplied game/statistics/table vocabulary. Their calculations and saved records remain the application's own.

## Implementation

`public/reference-design.css` is loaded last on the homepage and every app page. It provides the shared black/charcoal surfaces, teal actions, white selected controls, muted warm/teal mastheads, compact typography, table rows, and two-column research composition. Shared player and Trends renderers were reorganized to match those compositions. Custom probability meter/range graphics were removed. Small sportsbook symbols remain beside real prices. Performance views are gated by Dev mode.

## Verification

- `npm run check`: passed.
- `npm test`: 411 passed, zero failures.
- 28 routes checked at desktop and mobile sizes: no page-level overflow or uncaught browser exceptions.
- Browser flows checked dropdown search and keyboard selection, calendar navigation, filter categories, history windows, comparison-line keyboard adjustment, insight tabs, simulation distributions and player props, live quote alignment and stale-data withholding, and Dev mode gates.
- Final screenshots in `.research/site-structure/reference-controls` and `.research/site-structure/reference-flows`; route screenshots in `.research/site-structure/reference-audit`.
- Existing user preview was refreshed. Tests ran in isolated browser storage, including synthetic simulation fixtures; fixture data was not written into the user's preview.

Screenshot sources do not expose the original CSS, exact breakpoints, or every interaction state. This is a visual reconstruction with the app's own data, not a verified pixel-identical copy of the full Outlier product.

## Measured alignment pass

Compared the supplied 1024 × 494 Props reference and 1200 × 880 research reference with browser captures at those same viewport sizes. Final desktop measurements:

| Element | Rendered measurement |
| --- | --- |
| Navigation rail | 224px |
| Masthead | y=6, height=110px |
| Toolbar | y=116, height=54px |
| Props table | y=170, rows=48px |
| Player research canvas | 1080px, main/right split 69% / 31% |
| Player header / markets | 140px / 44px |
| Results panel | y=262, height=482.8px |
| Supporting stats | y=752.8 |
| Right context tabs | y=237 |

The venue, side and comparison-line settings now share the compact chart filter control in both research views. Market tabs use the reference's short stat labels with full accessible names. Mobile opponent labels stack dates, logos and codes. The expanded matchup header spans the canvas; its secondary tabs remain reachable. Desktop supporting stats are no longer covered by a sticky navigation bar.

The final interaction pass caught and fixed a filter closing during a synchronous re-render, market changes losing the selected player, toolbar dropdowns being clipped, and an internal scrollbar on the Over/Under control. Market popovers were checked at 1024px and 390px in MLB and NFL model/Trends pages; all remained inside the viewport and unobstructed. Simulation selection colors and underline were checked after transitions settled.

The full 411-test suite and 28-route desktop/mobile audit passed during this pass. After the final control fixes, `npm run check` and 34 focused tests passed. Browser flows cover 360, 390, 660, 768, 960, 1024, 1200 and 1440px widths as appropriate to each surface. Final captures are in `.research/site-structure/pixel-final`, `.research/site-structure/pixel-interactions` and `.research/site-structure/reference-flows`; route checks are in `.research/site-structure/pixel-route-audit`. The local server is running on port 3217, and a fresh Trends preview is open.

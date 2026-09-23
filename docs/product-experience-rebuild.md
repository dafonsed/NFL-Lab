# Sportslab product rebuild — verified 23 September 2026

Implemented a structural rebuild of the research experience. The homepage now opens into real games and props; one shared player-row system replaces tall cards across all six sports. Existing calculations, models, persistence and source contracts remain intact. Changes are local in the repository; this report does not claim a production deployment.

## Route-by-route result

| Routes / views | Finished changes and browser verification |
|---|---|
| `/` | Product-first sport/date/market/search controls, actual game strip, 30-player preview with full-board count, saved players, details and direct tool links. All six sports checked; selected matchup transfers into full research and survives reload. |
| `/nfl` | Shared research, opportunity and grouped matchup rows; clear projection/line/model-over/result columns; preserved ratings, notes, comparison and model evidence. Week controls, filters, movement, methodology, save and details exercised. |
| `/mlb` | Comparable prop rows, actual recent-history bars, compact save/compare actions, readable matchup cards, pitcher/lineup/doubleheader context and explicit final/postponed states. Mobile compare and game filter reload checked. |
| `/nba`, `/wnba`, `/nhl`, `/soccer` | Same research hierarchy, readable values, distinct final outcomes and precise historical/source context. Dated no-games recovery uses existing catalog dates. WNBA rankings, sorting and keyboard controls checked. |
| All six `?view=trends` views | Filters integrated with the player list, chart first on mobile with an explicit player chooser, single actionable empty state, preserved player/custom line on refresh. Search, windows, venue, custom line, watchlist and full breakdown checked. |
| Player details | Shared dark research chart, market/window/side controls, matchup/source panels, accessible notes and Dev mode. Real histories, custom lines, saving, notes and image fallbacks checked across sports. |
| `/live`, four sport Live routes | Compact directory and toolbar; Game odds / Player projections tabs bring each task directly into view. Actual feeds, search, markets and details checked. Controlled refresh, stale failure and extra-inning model-withholding fixtures passed. |
| `/simulation`, six sport Simulation routes | Selected-matchup initial state and consistent result/chart surfaces. Actual 1,000-run NFL, MLB, NBA and WNBA runs completed. NHL/Soccer correctly remain unavailable with working research links. |
| `/performance` | Readable NFL archive/evidence tables, compact summary band, bounded loading and retry. Loaded and failed-request states checked. |
| `/paper`, `/paper?sport=mlb` | Clear hypothetical results, compact summaries, tables, honest empty records and retry. Both sports checked. |
| `/bets`, bet editor | Consistent ledger and form controls; independently scrolling body with visible title/footer. Isolated single/parlay creation, connected player and manual legs, editing, reload, delete, filters/export, validation, storage failure, draft cancel, Escape, focus return and footer visibility checked. |
| Shared shell / preferences | Unified section and sport navigation, restrained selection, dark surfaces, readable type, practical targets, image fallbacks. Appearance, compact spacing, reduced motion, Dev mode and mobile More menu checked. |

## Evidence

- [Side-by-side visual review gallery](../.research/product-rebuild/review.html): before/after homepage, research, Live, Trends, bet dialog and the public Outlier reference beside Sportslab.
- [Complete final screenshot matrix](../.research/product-polish/rebuild-final/results.json): 37 route/view combinations plus the bet dialog, desktop and mobile screenshots; layout checks at five widths.
- [Compact observed-gap checklist](../.research/product-rebuild/checklist.md).
- [Product workflow results](../.research/product-rebuild/product-workflows.json), [final correction checks](../.research/product-rebuild/final-corrections.json), [bet/live regression workflows](../.research/product-polish/workflows/results.json).

Captures use real application data unless explicitly marked as a loading/error/transition QA fixture. Before and after screenshots use matching 1440×900 or 390×844 viewports at normal zoom; dates and markets are retained for route comparisons. Live values and feed timestamps may differ between captures. The former homepage had no data board to match.

The comparison passes corrected the mobile Trends toolbar and duplicated empty state, preserved comparison-line drafts on refresh, fixed zero/negative history and quote qualifiers, added stable image fallbacks, replaced the remaining NFL grouped card template and tightened MLB row actions. The final side-by-side review also exposed ambiguous provider play text on a finished game; it is now explicitly labeled “Last recorded play,” separate from current game status. All four Live pages and both analysis panels were rechecked after that correction.

## Actual verification results

- `npm run check` — passed.
- `npm run check:simulation` — passed.
- `npm test` — **359 passed, 0 failed, 0 skipped**.
- Final browser capture — **38 route/dialog states**, each checked at **1440×900, 1280×800, 768×1024, 390×844 and 360×800**. Zero detected page overflow, uncaught page exceptions or console errors in this sweep.
- Product workflows — **11/11 passed**: six-sport overview, mobile Trends refresh, dated empty recovery, loading/error/retry, Live tab persistence and missing-image fallback.
- Bet/live regression workflows — **11/11 passed**, including bottom-of-form errors, draft retention, single/parlay CRUD, duplicate-save prevention, connected NBA selection, refresh stability and withheld MLB output.
- Deep checks — **13 groups passed**; persistence checks — **7/7 passed**; navigation/simulation checks — **8/8 passed**. Additional interaction checks covered all six Trends views, shell preferences, filter drafts, picks filters/export and mobile focus.
- Failed-request sweep — **17 route states** recovered to an honest error with refresh available, without a permanent busy state, page overflow or uncaught page error. These were controlled HTTP-failure fixtures, not observed provider outages.
- Model preservation — comparison against the turn-start hashes found **only `lib/site-layout.mjs` changed under `lib`**. Statistical, provider and simulation implementations were unchanged by this rebuild; existing numerical/regression tests passed. Unrelated changes already in the working tree were preserved.

This repository has no separate build or lint script. Its existing syntax checks and test suite were run; no nonexistent build is reported as passed.

## Limits and real data gaps

- Outlier's **public marketing product previews** were inspected. Its app redirected to sign-in; no authenticated app access or feature parity is claimed. Reference artwork appears only in the local comparison evidence, never in Sportslab's runtime assets.
- Browser verification used Chromium with desktop/tablet/mobile viewports. Reduced-height form checks approximate keyboard space; physical iOS/Android keyboards, Safari and VoiceOver were not tested.
- The existing app does not provide NHL/Soccer live models or simulations. Missing historical injury/lineup status, absent quotes, empty observation histories and withheld estimates remain identified rather than filled with invented values.
- Live availability remains dependent on existing feeds and game schedules. Controlled fixtures verify transitions/errors that were not continuously available in a real live game during review.
- This was a frontend/product pass, not a new validation study of model accuracy or data providers. No new provider integration, betting execution or fabricated recommendation was added.

# Odds, DFS, Smart Money and product overview mobile audit

Audited 2026-09-28. This supplements the repository-wide mobile audit. It covers real source and rendered client tools, with an isolated authenticated test database on `http://127.0.0.1:3201`. No production account, subscription, sportsbook order or wallet was changed.

## Inventory and scope

| Route | Source and rendering | Data / update mechanism |
| --- | --- | --- |
| `/ev?sport=nba#odds` | `public/odds-screen.js`, `public/odds-screen.css`, shared `public/ev-bet-card.js` / `ev-bet-cards.css`; mounted by `public/ev.js` | Existing demo/entered quotes, exact-line grouping, lazy book comparisons. Local interval refresh, optional general feed controller. No real upstream odds feed exercised. |
| `/ev?sport=nba#fantasy` | `public/dfs-workspace.js`, `public/dfs-workspace.css`, shared wager-card styles; mounted by `public/ev.js` | Demo/entered DFS props, entered probabilities and payout rules. Independent-pick payout calculation. Exact-selection sportsbook lookup is distinct from fair odds. |
| `/ev?sport=all#sharp` | `renderSharp()` in `public/ev.js`, `public/smart-money.css`, shared wager cards | Saved/demo exchange liquidity and opposing sportsbook quotes. It does not verify sharp betting activity or identify real wallets. |
| `/ev/dashboard` | `lib/product-dashboards.mjs`, `public/product-dashboards.css` | Navigation hub, no quote fetching of its own. |
| `/trends`, `/models` | `lib/product-dashboards.mjs`, `public/product-dashboards.css`, `public/product-dashboards.js` | League/market navigation and account-scoped saved-player count. Detailed research screens belong to the main audit. |

These are vanilla JavaScript template renderers, shared CSS tokens (`--panel`, `--text`, `--muted`, `--accent`) and native browser controls enhanced by the existing workspace dropdown layer. Odds/DFS comparison grids use HTML, not a chart library. Smart Money depth is CSS bars with a text alternative. A concurrent user-authorized design task was already converting these surfaces to shared wager cards; those changes were preserved.

No customer route specifically named Insiders or Lineup Dropper was found. `#prediction` is the existing prediction trader/position tool, covered by the general EV audit. The admin catalog does contain **Insiders & wallets** (`wallets`) and **Lineup Dropper** (`lineups`) synthetic/local operations sections; those must be assessed as admin previews, not customer live signal integrations.

## Baseline and defects

The first actual-server baseline on port 3199 could not initialize Odds, DFS or Smart Money because the shared wager-card module was not served. Screenshots show the uninitialized generic EV shell. After serving was repaired, active account integration temporarily returned an access-unavailable page. Neither state is presented as a working-tool baseline. The final screenshots use the real server with proper fixture authentication, not intercepted HTML or fake session responses. A short browser-only fixture attempt exists under `fixture-after`; it is excluded from final findings.

| Severity | Route / reproduction | Finding | Implemented resolution and source |
| --- | --- | --- | --- |
| P1 | Open Odds/DFS/Smart Money on original server | Import chain blocked by missing `ev-bet-card.js` asset; real tool never mounted | Shared import/static serving repaired by the main EV/account work. Baseline retained. |
| P1 | Odds: record identical market/line for full game and first half | Different periods could be combined into one comparison | Period included in grouping and shown in market context, `odds-screen.js`; regression test. |
| P1 | Odds: replace a book quote with suspended/closed entry, including one without odds | A unavailable offer could remain best or leave its older price active | Explicit suspension replaces prior quote, excluded from averages/best/references, visible unavailable cell with no action, `odds-screen.js`; regression test. |
| P2 | Odds: compare many books at 320px and scroll right | Small price tap targets, logo-only books, 116px sticky outcome + unnecessary vertically constrained scrollbox | 44px price controls; visible names; 90px sticky outcome; single horizontal axis, visible scroll instruction; `odds-screen.css`. |
| P2 | Odds: choose books/order/format, leave and recreate the view | Display and book choices reset; no user-controlled book order | Account-backed preference object stores format, filters, hidden books and explicit order; accessible up/down controls, `odds-screen.js`. Account classification/glue added by account/EV owners. |
| P2 | Odds: leave unchanged board idle | Interval replaced the whole rendered board even when only observation age changed | Quote display signature skips unchanged rerender; age values update in place. Price, suspension and freshness changes still update; horizontal comparison positions retained. |
| P2 | Odds settings at phone width/landscape | Small checkboxes and nested book-list scroller; settings could be awkward to close | 44px rows/order controls, close action, bounded panel and one vertical scroll area. |
| P2 | DFS: add/remove a pick then review a slip on mobile | Selected slip moved ahead of list; browsing position easily lost; slip action unavailable while browsing | Compact safe-area dock exposes pick count, estimated EV and save/review; full slip follows list; Back to props restores captured position. `dfs-workspace.js/.css`. |
| P2 | DFS: compare 13 platforms at 320px | Controls consumed much of first screen; platform logos required recognition | Collapsible platform selector, horizontal chip row, book names and sticky selection labels with scroll hint. |
| P2 | DFS: edit entry to invalid/nonfinite amount | Infinite value could enter calculation | Finite positive validation, inline status, cent input step; regression test. |
| P2 | Smart Money: choose another opportunity at phone width | Detail panel changed below all opportunities without clear navigation | Mobile focus/scroll and Back to opportunities supplied by EV owner; larger buttons, wrapped book labels, phone numeric inputs, and detail scroll margin in `smart-money.css`. |
| P3 | Product overviews at all tested widths | No new page overflow or broken layout found in focused visual audit | Existing visual design retained. Shared shell fixes applied separately. |

## Screenshot evidence

All final screenshots are at `artifacts/mobile-audit/after-auth/chromium/` and `artifacts/mobile-audit/after-auth/webkit/`. Each of the six routes has 320×740, 360×800, 375×812, 390×844, 430×932, 768×1024, 667×375 landscape, and 1440×1000 captures.

| Page | Original actual-server baseline, 390px | Final authenticated Chromium, 390px |
| --- | --- | --- |
| Odds | [Before: uninitialized shell](../artifacts/mobile-audit/before/chromium/odds-390x844.png) | [After](../artifacts/mobile-audit/after-auth/chromium/odds-390x844.png) |
| DFS | [Before: uninitialized shell](../artifacts/mobile-audit/before/chromium/dfs-390x844.png) | [After](../artifacts/mobile-audit/after-auth/chromium/dfs-390x844.png) |
| Smart Money | [Before: uninitialized shell](../artifacts/mobile-audit/before/chromium/smart-money-390x844.png) | [After](../artifacts/mobile-audit/after-auth/chromium/smart-money-390x844.png) |
| EV overview | [Before](../artifacts/mobile-audit/before/chromium/ev-overview-390x844.png) | [After](../artifacts/mobile-audit/after-auth/chromium/ev-overview-390x844.png) |
| Trends overview | No valid baseline: initial script used unsupported `/trends/dashboard`; excluded | [After](../artifacts/mobile-audit/after-auth/chromium/trends-overview-390x844.png) |
| Models overview | No valid baseline: initial script used unsupported `/models/dashboard`; excluded | [After](../artifacts/mobile-audit/after-auth/chromium/models-overview-390x844.png) |

Additional final states: [Odds settings](../artifacts/mobile-audit/after-auth/chromium/odds-settings-390.png), [Odds scrolled 500px with sticky outcome](../artifacts/mobile-audit/after-auth/chromium/odds-scrolled-390.png), [DFS comparison](../artifacts/mobile-audit/after-auth/chromium/dfs-comparison-390.png), [DFS slip review](../artifacts/mobile-audit/after-auth/chromium/dfs-slip-390.png). WebKit contains matching states.

## Verification and measurements

Chromium headless and Playwright WebKit ran with mobile/touch emulation, device scale 1, reduced motion, and a real authenticated Pro fixture session. These are **engine/emulation tests**, not physical Android Chrome or iOS Safari tests. Browser request/session state stayed in the operating-system temporary directory. No token was added to project artifacts.

All 96 route/viewport combinations had document width equal to viewport width and no JavaScript page errors. Actual showcase density was 1,008 sample quotes and 468 fantasy props globally; the NBA odds view reported 15 events / 360 exact markets. Initial DFS filtering showed six matching NBA props for its current platform, not 468 simultaneously rendered player cards. This was not a real live game or sportsbook feed test.

Verified flows:

- Odds: expand a comparison, open/close settings, search a nonexistent team, show honest empty result, clear filters, horizontally scroll 500px. Sticky outcome remains 1px inside its region in both engines.
- DFS: expand comparison, remove a selected leg, see updated 2/3 dock count, review slip, return to the same browsing position, search no results, clear filters. Chrome removal scroll delta was 0; WebKit adjusted 16px during checkbox interaction, and review/back returned to the actual post-interaction browsing position. No jump to page top.
- Unit coverage verifies saved odds order/format/hidden books across view recreation, separate periods, suspended prices, unchanged-update behavior, exact DFS offers, payout math, and finite entry amounts.
- Six product pages checked at desktop and all requested narrow widths; overview route-link tests verify league/market destinations.

The following are single local lab loads from the final per-route `initial` snapshot, before viewport resizing/interactions. They are not field metrics or a statistically stable before/after speed comparison. Concurrent local development/verification was running. Original tools failed to initialize, so comparing their baseline LCP against functional final tools would be misleading.

| Route | LCP ms Chromium / WebKit | CLS Chromium | Resource requests Chromium | Encoded resource body bytes Chromium | Initial DOM nodes Chromium |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/ev?sport=nba#odds` | 620 / 518 | 0 | 90 | 1,891,399 | 3149 |
| `/ev?sport=nba#fantasy` | 816 / 413 | 0 | 95 | 2,168,536 | 1544 |
| `/ev?sport=all#sharp` | 296 / 342 | 0 | 91 | 1,892,083 | 2317 |
| `/ev/dashboard` | 116 / 125 | 0 | 56 | 1,401,925 | 526 |
| `/trends` | 72 / 141 | 0 | 47 | 1,384,333 | 429 |
| `/models` | 152 / 114 | 0 | 47 | 1,384,333 | 437 |

Browser-driver action timings (include automation/actionability overhead; **not INP**): Odds no-result search 113ms Chromium / 121ms WebKit; DFS remove-pick 349ms / 189ms. No field INP, real receiving-to-display feed latency, physical keyboard, installed PWA, poor-connection reconnect or long-session heap measurement was collected by this focused audit. The main audit supplies broader performance and account evidence. Encoded-body totals include all page assets, not just JavaScript bundle size.

Raw reports: [Chromium JSON](../artifacts/mobile-audit/after-auth/chromium/odds-dfs-measurements.json), [WebKit JSON](../artifacts/mobile-audit/after-auth/webkit/odds-dfs-measurements.json). Reproduce with `node scripts/mobile-odds-dfs-audit.mjs after-auth [webkit]` after starting the isolated fixture server and generating its temporary session state.

Validation: `node --check public/odds-screen.js`, `node --check public/dfs-workspace.js`; `node --test test/odds-screen.test.mjs test/dfs-workspace.test.mjs test/product-dashboards.test.mjs` — **26 tests passed**.

## Files changed by this focused work

- `public/odds-screen.js`: period/suspension correctness, retained display/book preferences and ordering, broader search, visible comparison instructions/book names, observed ages/known limits, unchanged-snapshot optimization, focus preservation.
- `public/odds-screen.css`: focused horizontal comparison, book identities, touch targets, phone settings panel, wrapping event context and fullscreen spacing.
- `public/dfs-workspace.js`: compact slip dock/review/return, stable focus/scroll, platform chooser disclosure, clear offer label, decimal/finite stake input, comparison instruction.
- `public/dfs-workspace.css`: dock with safe-area spacing, mobile controls/comparison typography, platform overflow and disclosure. Concurrent wager-card conversion was preserved.
- `public/smart-money.css`: phone controls, wrapping identities, focus/scroll target, readable comparison widths.
- `test/odds-screen.test.mjs`, `test/dfs-workspace.test.mjs`: regression coverage described above; preexisting/concurrent tests preserved.
- `scripts/mobile-odds-dfs-audit.mjs`: repeatable authenticated screenshots, dimensions, lab metrics and core journeys.
- This report. Product dashboard files were audited but did not require a focused edit.

Shared changes outside this ownership (auth asset serving, account preference classification, mobile wager-book labels, Smart Money navigation and shared filter controls) are described in the main audit and implemented by their file owners.

## Remaining limitations, ranked

1. **High:** The tested odds, probabilities, liquidity and payouts are sample/entered data. Real sportsbook execution, genuine wallet fills/follows, lineup-derived fair prices, exchange limits and high-volume live stream behavior remain unverified because those integrations were not supplied here.
2. **Medium:** No physical iOS/Android keyboard, installed PWA or authenticated return from an external sportsbook was available. Browser engines and native input/focus behavior were emulated only.
3. **Medium:** Before screenshots expose a broken initial import chain; functional pre-change comparisons do not exist for those tools. There is no defensible percentage performance improvement from this focused run.
4. **Medium:** DFS selections remain view-local until saved. The dock preserves in-page browsing; a full reload of an unsaved real slip is not claimed to restore it. Demo defaults may reseed picks.
5. **Low:** WebKit makes a 16px checkbox interaction scroll adjustment. Review/back restores browsing context; physical Safari confirmation remains useful.
6. **Low:** Broad source changes from concurrently active user-authorized work mean visual baselines belong to this run, not a clean immutable release. Rerun the retained scripts on the eventual merged revision.

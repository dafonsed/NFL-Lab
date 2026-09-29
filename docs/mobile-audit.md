# SportsLab mobile audit and implementation

Audit: September 27–28, 2026. Active project: the Node application in this repository, not the old `sites-*` exports. Changes were implemented and exercised in the rendered application. The graphite, cyan and lavender design remains in use.

The audit fixed mobile workflows across market tools, research, live projections, tracker, account and admin. It is **not a production-readiness or complete WCAG certification**: the EV workspace uses permanent demo data, several public sports providers were unreachable, external account/payment services are unconfigured, and physical phones were unavailable. Measured cold-load performance still has material limitations below.

## Read the evidence

- [Before/after screenshot gallery](../reports/mobile/index.html)
- [EV, arbitrage, middles, builders, alerts and history](mobile-ev-audit.md)
- [Odds Screen, DFS and Smart Money](mobile-odds-dfs-audit.md)
- [Account, all admin sections, tracker and performance](mobile-account-admin-tracker-audit.md)
- [Live stale/suspended/offline/reconnect verification](mobile-live-audit.md)
- [Independent review: dialogs, focus, touch, contrast and compression](mobile-shared-review.md)
- [Route/viewport coverage and HTTP failures](../reports/mobile/coverage-summary.json)
- [Source hashes at report generation](../reports/mobile/source-snapshot.json)

The detailed reports form one audit. Each includes its source map, severity, reproduction, screenshots, checks and limitations. Raw screenshots/JSON remain under `reports/mobile*` and `artifacts/mobile-audit`.

## Conditions and baseline integrity

Chromium headless and Playwright WebKit ran on Windows with touch/mobile emulation and reduced motion. Widths were 320, 360, 375, 390, 430 and 768 CSS pixels, 667 × 375 small landscape, and 1440 × 1000 desktop. The initial root sweep also used 844 × 390 landscape; an erroneous intermediate 667 × 844 capture was superseded by the explicit `after-landscape` runs. These are **engine emulations**, not physical Android Chrome or iOS Safari results.

The initial rendered app could not initialize several tools because `account-sync.js`, `account-client.js` and the new shared wager-card assets were not served. Original broken-state screenshots were retained. To inspect the existing UI before account integration was available, some clearly marked working baselines used a null-session/static-module fixture. The EV comparison also contains a reconstructed baseline with the mobile installer disabled. These are not silently presented as working production baselines.

The user authorized coordination with the other active chats. Account, real admin, sportsbook support and the card design were being implemented concurrently in this same dirty checkout. Their contributions were preserved. Late EV card/history changes required another integration pass; earlier card screenshots and timings are intermediate observations. Source hashes identify the files present when this report was generated, rather than implying a clean immutable release.

Final functional checks used real local authentication and disposable in-memory account databases. The Pro customer fixture's browser session lived in the OS temporary directory, outside project artifacts. Dense tracker checks used 120 synthetic tickets, including long selections, +12500 odds, large stakes and multiple sports/books/tags. Market tools exposed 1,008 demo quote records, 468 DFS props and 36 prediction contracts. The Odds NBA fixture exposed 15 events and 360 exact markets. No real bet, charge, production account action or production email was submitted by this audit.

## Architecture and shared failure points

| Area | Actual implementation |
|---|---|
| Routing and HTML | `server.mjs`, `lib/site-layout.mjs`, static `public/*.html`, `lib/product-dashboards.mjs` and `lib/admin-page.mjs` |
| UI rendering | Vanilla JavaScript modules, template strings and DOM updates. No React hydration or bundled application build. |
| Design | CSS custom properties including `--text`, `--muted`, `--panel`, `--border-strong`, cyan accents and lavender focus. Layered route CSS plus shared palette/navigation overrides; this layering caused several specificity and positioning defects. |
| Research | `app.js`, `mlb.js`, `sports.js`, `player-research.js`, trends modules; shared controls and calendar/dropdown modules |
| Markets | `ev.js` dispatches actual hash routes; shared wager/reference/comparison cards; dedicated Odds and DFS renderers |
| Tables/lists | HTML tables inside explicit comparison regions; cards, native disclosure controls and explicit pagination. No new virtualization or external grid library. |
| Charts | Locally generated SVG/HTML in research, bet history and tracker modules. Touch readouts and native dialog expansion were added; there is no chart-library migration. |
| Fetching | Existing bounded `requestData` helper, server research caches, account initialization/sync, EV feed controller. Export now uses the bounded helper. |
| Updates | 15-second live checks; EV local demo-clock ticks and optional feed cadence/backoff; tracker result refresh. Hidden/offline/editing guards are preserved or added. |
| Account | Concurrent Better Auth/account implementation, server-side account storage and real authorization; browser preferences use its account adapter where applicable. |

The biggest shared issues were deferred shell construction, late mobile styles, overridden viewport variables, copied desktop table dimensions, broad list replacement on timer ticks, and URL updates erasing modal history state. Fixing these shared paths improved multiple tools without replacing the product design.

## Route-by-route results

P1 = blocked workflow, false/actionable stale information, hidden decision data or severe performance defect. P2 = material mobile usability/accessibility issue. P3 = polish. “Rendered” means the available state was checked; it does not imply unavailable upstream results were exercised.

| Route | Source | Finding/severity and outcome |
|---|---|---|
| `/` | landing renderer and `landing-*.js/css` | P3: rendered at all root widths and desktop; navigation/pricing belongs to concurrently changing account work. No new whole-page overflow found. |
| `/research` | `home.html/js`, shared layout | P2: shared navigation/control fixes. Default MLB request failed upstream; error/empty state inspected, not a successful MLB slate. |
| `/models` | product dashboards | P3: navigation hub verified; no independent mobile defect required a hub rewrite. |
| `/trends` | product dashboards | P3: same; destinations covered by overview tests. |
| `/ev/dashboard` | product dashboards | P3: market hub and tool access verified. |
| `/nfl` | `index.html`, `app.js`, player research | P2: navigation, pagination, touch targets and chart/detail improvements. Cached player board and actual recorded game detail exercised. |
| `/mlb` | `mlb.html/js` | P2 shared reflow fixes; P1 environmental limit: StatsAPI board returned500. Error state rendered with no page overflow. |
| `/nba` | `sports.html/js` | P2 shared controls; available empty/unavailable slate rendered. No active NBA source game claimed. |
| `/wnba` | `sports.html/js` | P2 shared controls; cached player board and trends rendered. |
| `/nhl` | `sports.html/js` | P2 shared controls; available no-data state checked. |
| `/soccer` | `sports.html/js` | P2 shared controls; available no-data state checked. |
| `/nfl?view=trends` | trends modules | P2: narrow controls, detail/chart touch and controlled pagination. Actual cached rows rendered. |
| `/mlb?view=trends` | trends/MLB modules | P2 reflow; upstream failure prevents a populated final MLB trend claim. |
| `/nba?view=trends` | trends/sports modules | P2 controls/reflow; current available empty state. |
| `/wnba?view=trends` | trends/sports modules | P2 controls/reflow; cached populated state. |
| `/nhl?view=trends` | trends/sports modules | P2 controls/reflow; available empty state. |
| `/soccer?view=trends` | trends/sports modules | P2 controls/reflow; available empty state. |
| `/live` | live directory | P3: cards/navigation checked; current directory is not a high-volume game fixture. |
| `/nfl/live` | `live.js`, NFL model | P1: unchanged updates replaced content; reading order/history could move; interrupted games still projected. Fixed and verified with controlled live inputs, stale/outage/offline/reconnect and line reconfirmation. |
| `/nba/live` | `live-sports.js` | P1 shared stability/history issues fixed; same controlled browser scenarios verified using basketball model inputs. |
| `/mlb/live` | `live-sports.js`, MLB live model | P2 layout/error state checked; shared controller/model tests, not a direct synthetic MLB browser replay. |
| `/wnba/live` | `live-sports.js`, WNBA live model | P2 same distinction; direct synthetic replay used NBA. |
| `/simulation` | simulation modules | P2 shared controls; alias/default NFL setup rendered. A fresh full simulation journey was not completed. |
| `/nfl/simulation` | simulation modules | P2 configuration rendered; existing simulation tests passed. |
| `/mlb/simulation` | simulation modules | Upstream catalog500; failure state rendered. |
| `/nba/simulation` | simulation modules | Upstream catalog500; failure state rendered. |
| `/wnba/simulation` | simulation modules | Upstream catalog500; failure state rendered. |
| `/nhl/simulation` | simulation modules | Available configuration/no-data state rendered. |
| `/soccer/simulation` | simulation modules | Available configuration/no-data state rendered. |
| `/performance` | `performance.html/js`, forecast CSS | P2: controlled table overflow, clear context and bounded export request. Actual53 snapshots/12 tables, Dev-mode gate, both engines/all widths,503/retry verified. This is model evidence, not personal profit. |
| `/paper`, `/paper?sport=mlb` | paper modules | P2 shared layout; Dev-mode gate and available state checked. No filled-account profitability claim. |
| `/docs` | docs modules | P3 shared layout. Initial429 from parallel account probes was superseded by a clean landscape run; content is maintained by the docs chat. |
| `/betting-calculators` | betting pages/calculator assets | P3 rendered widths and desktop; no new arithmetic change. |
| `/betting-tools` | betting pages | P3 rendered/navigation checked. |
| `/betting-education` | education/longform assets | P3 rendered dense content at widths/desktop; no new whole-page overflow. |
| `/online-sports-betting` | guide assets | P3 rendered/navigation checked. |
| `/online-sportsbooks` | guide directory | P3 rendered/navigation checked; external sportsbook sessions were not exercised. |
| `/odds-api` | odds API guide assets | P3 rendered/navigation checked; no production API connection claimed. |

The remaining route tables are included in the linked focused reports rather than abbreviated into one row:

- **Market tools:** `/ev#ev-pre`, `#ev-live`, `#arb-pre`, `#arb-live`, `#middles`, `#holds`, `#promo`, `#parlay`, `#optimizer`, `#slip`, `#fantasy-alerts`, `#prediction`, `#trends`, `#line-alerts`; plus `#odds`, `#fantasy`, `#sharp` in the Odds/DFS report.
- **Customer/account:** `/bets` and `/ev/tracker`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor`, `/account`.
- **Admin:** all21 `/admin-sandbox` sections have individual rows in the account/admin report. Real `/admin`/`/admin/accounts`, `/admin/operations` and `/support` are distinct authenticated surfaces and have a separate connected-admin addendum.

## Implemented defects and reproduction

| Severity / steps | Resolution | Evidence |
|---|---|---|
| P1: open tools before asset integration; module404 prevents initialization | Coordinated static assets/account foundation with their owners; retained original screenshots instead of labeling them valid data views | `reports/mobile/original`, focused before screenshots |
| P1: inspect phone tracker; booked odds were display:none | Booked price now visible with selection/book; natural-height cards,120-ticket search and40-item pages | Account/tracker report, `after-tracker-*-390.png` |
| P1: run a fresh suspended NFL fixture and confirm a line | Future projection withheld, recorded stats remain; confirm disabled until valid recovery | Live report and38 model/utility tests |
| P1: compare game and first-half prices at the same nominal line, or suspend the winning quote | Period is part of market identity; suspended/missing-price update removes the prior actionable quote | Odds regression tests and report |
| P1: wait15 seconds while reading/editing live cards or while drawer is open | Same-content snapshot retains nodes/draft/focus/scroll; changed snapshots retain established order and require reconfirmation; URL updates preserve history.state | Live synthetic JSON, shared review |
| P1: cold-load EV on4× CPU/1.6Mbps | Public compression, initial reserved loading state and initial mobile stylesheet. Loading has delayed/error retry feedback; inactive controls no longer jump around before account initialization | Dedicated performance runs and shift-source JSON |
| P2: open narrow EV filters, select sport then close/Back | Native sheet keeps edits/scroll, searchable books, correct result count and controls; removed option click no longer dismisses the sheet | EV journeys |
| P2: build DFS/parlay then review/remove a leg | Compact summary/review/return, retained browsing context, explicit unsupported combinations and bounded initial parlay list | EV and DFS journeys |
| P2: scroll a many-book grid | One horizontal region with sticky selection context, visible hint, book names and44px cells; saved book order/format | Odds screenshot scrolled500px |
| P2: open drawer in WebKit and press Back | Explicit launcher focus return; inert background and history cleanup | Shared review |
| P2: set visualViewport height400px on844px layout viewport | Removed shadowing body variable; dialog max height becomes376px. This approximates keyboard space only | Shared review |
| P2: open expanded research chart and try comparison slider | Dead slider removed from interaction; explicit read-only reference, bar details, focus/parent restoration; inline adjustment works after close | Shared review landscape screenshot |
| P2: admin record grids extend beyond390px | Contained, labeled, focusable scroll regions and sticky identity/status; focused inspector and confirmation remain | All21 sandbox sections plus connected-admin addendum |
| P2: tracker sports navigation overlays Add bet | Separate masthead grid row; pointer journeys pass both engines | Tracker final journey |

## Source changes

These are the changes owned by this audit. The workspace also contains other authorized work; a whole `git diff` is not an attribution list.

| Files | Change |
|---|---|
| `lib/site-layout.mjs`, `public/ev.html` | Final mobile styles/script, viewport-fit cover, initial EV loading state; static EV mobile stylesheet before first paint |
| `public/mobile-workspace.css/js` | Safe areas, visual viewport, narrow navigation/tables/controls, readable inputs, reduced motion, accessible chart readouts/expansion, dialog Back and loading feedback |
| `public/dashboard-navigation.js` | Drawer browser history, robust close/navigation handling, explicit focus restoration |
| `public/workspace-ui.js` | Initialize visual shell without blocking on account preference hydration; apply saved preferences when ready |
| `public/product-ui.js` | Preserve modal/drawer history during live-panel URL changes |
| `public/live.js`, `live-sports.js`, `live-utils.js` | Stable reading order, display revision, unchanged node retention, persistent refresh choice, offline/background guards, visible stale status and safe URL updates |
| `lib/live-nfl-model.mjs` | Withhold interrupted-game projections while retaining recorded stats |
| `lib/http-compression.mjs`, small `server.mjs` edits | Async gzip for public JS/CSS and allowlisted public research JSON; excludes account/admin/private responses; preserve headers/opt-out/HEAD. Register added mobile assets |
| `public/ev-mobile.js/css`, `ev.js`, `ev-feed.js`, `arb-calculator.css` | Filter sheet, compact exact-value cards, live ordering/revision checks, saved cadence, parlay paging/context, precise arb cents and readable calculator |
| `public/bet-history.js`, `bet-comparison.js/css`, `bet-reference-history.js` | Phone chart sizing, touch detail, fullscreen/history controls and gap handling integrated with the concurrent card design; exact final scope in EV report |
| `public/odds-screen.js/css` | Exact-period identity, suspension correctness, saved book order/settings, comparison context, phone targets and unchanged rendering |
| `public/dfs-workspace.js/css`, `smart-money.css` | Compact slip dock/review/return, platform chooser, finite stake input, readable opportunity details |
| `public/bets.js`, `bet-dashboard-v3.js`, `bet-tracker-reference.css` | Visible prices,40-item pages, full-ledger filtering/export, live node/order/anchor preservation, batched filter work, chart space/axis/resize fixes |
| `public/performance.html/js`, `performance-mobile.css` | Named controlled table regions, phone controls and bounded export fetching |
| `public/account-mobile.css`, `admin.js/css` | Form-first layout,16px inputs,44px controls, safe dialogs, drawer inert/focus, readable contained admin tables |
| `public/admin-accounts.js`, `admin-operations.js` | Narrow connected-admin accessibility/focus fixes, described in the connected-admin addendum |
| `test/*mobile*.test.mjs`, HTTP compression tests and existing affected tests | Behavioral regression checks for live state, exact price identity, suspension, preferences, finite calculations and header negotiation |
| `scripts/mobile-*.mjs`, `docs/mobile-*.md` | Reproducible local fixtures, captures, actual journeys, perf profiling and evidence index |

## Performance evidence

All measurements are **single-run local lab observations**. There is no RUM or field INP dataset. Browser-driver action time includes automation overhead; Event Timing maxima are lab samples, not an INP percentile. No physical CPU, thermal, battery or multi-hour memory claim is made.

Controlled root conditions: Chromium390 ×844, touch, reduced motion, cache disabled; normal connection and4× CPU/150ms latency/200,000 bytes/sec download (about1.6Mbps). Time to useful data is separately marked when a real result card/price grid enters the DOM. CLS is computed as the maximum standard session window from captured shifts. Navigation HTML bytes are separate from resource transfer totals.

The original intermediate compression run showed EV transfer1.84MB→0.512MB and throttled useful-results10.75s→4.09s; Odds11.25s→4.25s. That comparison preceded a concurrent card redesign and **must not be presented as the final card performance**. Normal EV was slower in one cold run (0.177s→1.064s), and normal NFL lacked useful data in its after sample. Those samples remain in `before-compression.json`/`after-compression.json` rather than being cherry-picked away.

The final current-template identity-versus-gzip measurements and interpretation are recorded below. Gzip is the principal transport change; the visible template and DOM count match, but small concurrent stylesheet/module edits added about5KB decoded text during the pair. This is a useful development lab comparison, not a byte-identical A/B experiment. A separate real HTTP check independently verified50,896 CSS bytes→9,836 gzip bytes with byte-identical decoding, explicit opt-out, cache policy and HEAD correctness.

Tracker final independent lab:40 of120 tickets,3,103 DOM elements (previously7,058, about56% fewer),848,838 encoded resource bytes/79requests (previously about2.03MB). Normal initial LCP932ms/CLS0.02035. Under4× CPU/150ms/1.6Mbps: load8,074ms, LCP7,740ms, CLS0.37395, filter apply36.4ms. The prior constrained sample had LCP about7.1s: **tracker LCP did not improve in that single comparison**. Normal filter-open/expand were8.3/44ms. Final interaction Event Timing maxima were72ms Chromium/400ms WebKit; these are not field INP.

Parlay's initial rendered collection changed from468 cards/14,141 nodes to40 cards/about2,000 nodes, with full-source search and Show more. The initial61-second demo-live observations retained card identity, scroll and node count; exposed Chromium heap was coarse. Controlled live receipt-to-display timings include fixture delivery, DOM update and browser-driver overhead, not production ingestion latency. Real changed EV snapshots still require broader reconciliation; no claim of a one-cell production-stream update architecture is made.

## Verified journeys, accessibility and links

- Shared navigation → player research → tap result → expanded chart → rotate → browser Back → same research dialog/scroll/focus;320px and increased root font-size reflow. The font-size probe is not a substitute for actual200% browser zoom.
- Market filter → select sport/books → no-result search → clear → close/Back → retained feed place; arb calculator and parlay add/review/remove; DFS compare/remove/review/return; Odds settings and horizontal comparison.
- Live line entry/confirmation → unchanged tick → changed snapshot → reconfirmation → stale/suspended/paused/error/offline → manual recovery. Same tests include drawer-open polling,44px targets, visible stale status and contrast samples.
- Tracker full-ledger search, pagination, add/edit/tag, discard/cancel, calendar, settled/open states and controlled live progression with fixed booked odds.120-ticket writes were disposable fixture data.
- Logged-out account form/recovery screens and authenticated Pro account sections, reauthentication cancel and deletion guards. Customer access to staff APIs denied. The separate account implementation's real local browser suite covers registration/verification/reset/MFA/logout/free-versus-paid authorization; its report explicitly distinguishes local email/Stripe adapters from external delivery/payment.
- Sandbox admin search/inspect/edit/cancel/persona restrictions, all21 sections. Connected real staff/account/support verification is separately documented; no sandbox persona is treated as authenticated staff evidence.

Selected live text contrast samples ranged from5.19:1 to15.75:1. Native inputs are16px and key targets44px; status changes use compact announcements rather than rereading the entire feed. Native dialog names, focus and reduced motion were checked. No exhaustive screen-reader, every-color/state, or WCAG2.2 AA certification is asserted. Browser zoom was not disabled.

External sportsbook links and quote origins remain dependent on demo/manual data and the concurrently maintained platform catalog. No authenticated sportsbook session, real placed wager, provider-specific final parlay betslip or installed-app return path was available to test. A manifest exists; no complete installable offline service-worker flow was established. Physical keyboard/password-manager overlays, safe-area hardware, PWA installation and real phone rotation/return are outstanding acceptance checks.

## Remaining issues and unavailable capabilities, ranked

1. **High — production data/execution:** EV permanent-demo mode cannot establish real opportunities, liquidity, max stakes, live market delivery or executable deep links. Public provider failures prevent populated MLB and some simulation journeys. Customer Insiders/wallet-follow/fills and Lineup Dropper are not implemented customer tools; admin sample sections do not substitute for them.
2. **High — constrained cold load:** tracker LCP7.74s/CLS0.374 remains poor. The layered styles, eager module graph and new comparison-card DOM merit route-level CSS/JS pruning and measured lazy detail work. Compression alone is not a complete loading solution. Final EV values below determine its remaining cost.
3. **High — external account operations:** production database, verified email delivery, payment provider and production staff authorization require deployment configuration and end-to-end service validation. Local fixtures test the implementation, not those external systems. See [account operations](account-operations.md) and [account-system report](account-system-report.md).
4. **Medium — device acceptance:** physical Safari/Chrome, native keyboard/autofill, password managers, assistive technology, installed PWA and authenticated external-book return remain unverified.
5. **Medium — unsupported product features:** weighted sharp-book presets/devig configuration, genuine wallet activity, delivered customer odds alerts and provider-specific parlay submission were not invented. Generic browser rules/history and entered prediction positions are the actual available surfaces. Unsaved DFS picks are view-local until saved; full reload restoration is not claimed.
6. **Medium — long sessions/change volume:**61-second local/demo observations and controlled15-second ticks are not hours of production load. Changed live responses still rebuild affected content; unchanged snapshots are cheap and stable. No real receiving-to-display feed latency exists without a connected feed.
7. **Lower — chart tradeoff:** game-chart comparison-line adjustment requires closing expanded view; the fullscreen version explicitly shows a read-only reference. Bar values remain accessible. Native pinch zoom and every long-axis variation were not physically tested.
8. **Release coordination:** the user’s other active chats continue to edit this workspace. Re-run affected tests if those files change after the recorded source snapshot. Earlier failed module/rate-limit runs are diagnostic evidence, not counted as successful populated journeys.

## Verification and reproduction

Run from the repository. The app is plain Node/JavaScript and has no separate build command. `npm run check` is the configured syntax check; targeted `node --check` runs also cover newly added modules.

```powershell
npm test
npm run check
node scripts/mobile-audit-server.mjs
# In a separate terminal, use the disposable server created above:
$env:AUDIT_URL='http://127.0.0.1:3201'
$env:AUDIT_AUTH='fixture'
$env:AUDIT_PHASE='after'
node scripts/mobile-audit.mjs
$env:AUDIT_ENGINE='webkit'
node scripts/mobile-audit.mjs
```

Run the focused journey scripts named in each report for stateful checks. Run serially or with distinct disposable server instances: simultaneous browser sweeps of the same fixture triggered legitimate auth429 limits. Never disable authorization to make final checks pass. Session files remain temporary. Provider failures should be reported separately from client page errors.

No deployment or Git commit was performed by this audit.

## Final current-template measurements

See [raw identity run](../reports/mobile/performance/final-identity.json), [raw gzip run](../reports/mobile/performance/final-gzip.json), and [calculated summary](../reports/mobile/performance/summary.json). Identity requests explicitly sent `Accept-Encoding: identity`; gzip used normal browser negotiation. Both runs used the same disposable account server, its saved filter state and actual current cards. No request or page errors were recorded. The EV initial DOM was 4,309 elements and Odds 2,702 in both runs. The separate explicit all-sports EV sweep had 7,291 nodes and is a different filter/data-density state; do not treat the performance sample as a worst-case all-sports benchmark.

| Route / condition | LCP identity → gzip | First useful results identity → gzip | Resource transfer identity → gzip | Requests identity → gzip | CLS identity → gzip |
|---|---:|---:|---:|---:|---:|
| EV, normal | 204→200ms | 163→154ms | 1,957,437→619,080B | 94→94 | 0→0 |
| Odds, normal | 272→272ms | 205→209ms | 1,957,437→619,080B | 94→94 | 0→0 |
| EV, constrained | 10,652→4,544ms | 10,435→4,264ms | 1,879,038→538,271B | 93→93 | 0→0 |
| Odds, constrained | 11,488→5,444ms | 11,131→5,055ms | 1,879,038→619,080B | 93→94 | 0→0 |

EV constrained transfer is about71% smaller and useful results about59% sooner. The larger final Odds resource total includes an extra completed request; inspect raw resources rather than attributing every byte to compression. All final JavaScript transfer totals were191,090B (about567KB decoded) and CSS206,733B (about1.15MB decoded). The sizeable decoded CSS and roughly94 requests remain a clear optimization opportunity. Both constrained LCP results remain slow; zero CLS in this short load observation is not a field guarantee.

The loading-state fix separately removed the observed EV initialization shift: [before source trace](../reports/mobile/performance/shift-sources-static-css.json) measured0.66546 from the shell/bookbar/heading moving; [after trace](../reports/mobile/performance/shift-sources-loading-state.json) contained no shifts. This fixes incomplete controls appearing then moving. It does not substitute a loading-heading time for first useful results, which are separately reported above.

Final EV filter open/apply wall times were108/150ms normal and331/433ms constrained. Navigation was81ms normal and251ms constrained; Odds navigation94/414ms. These did not uniformly improve with gzip: JavaScript/layout interaction work remains after transfer. Maximum Event Timing samples were56/48ms normal EV/Odds and304/312ms constrained; **field INP is unavailable**. Single-snapshot heap was about9.65MB EV and34.16MB Odds normal,12.14MB/34.18MB constrained; this is not a retained-memory leak test.

### Final validation result

- `npm test`: **1,922 passed,0 failed,0 skipped**,18.2 seconds in the final integration run. [Full test output](../reports/mobile-full-tests.txt). An earlier final attempt exposed a missing `closest()` method in a new chart unit-test DOM fixture; the fixture was corrected and the whole suite rerun successfully.
- `npm run check`: passed. [Configured syntax-check output](../reports/mobile-syntax-check.txt). New shared/mobile/chart/compression modules also passed targeted syntax checks.
- Root screenshot sweep:39 routes ×8 sizes in Chromium;18 selected research/live/hub routes ×8 sizes in the final WebKit repeat; all39 routes additionally checked at667 ×375 in both engines. No document overflow or uncaught page errors in those final sweeps. Upstream data failures are separately listed and are not passed populated journeys.
- Market audit:14 EV hash tools ×8 sizes ×2 engines, plus Odds/DFS/Smart Money and their overviews in the separate96-case run. EV routes were recaptured after the late card integration. Tracker, all21 sandbox admin sections and the real connected account/operations/support surfaces have their own final matrices in the focused reports.
- The late WebKit repeat used a fresh isolated session and recorded no auth429 errors; earlier parallel-run429 results remain diagnostic artifacts. Cached NFL availability varied after server restart, so the actual chart journeys use their separately retained successful data run.
- Deliberate module failure and unavailable account service both expose a visible recovery action while navigation remains available in Chromium/WebKit. [Four final failure-state checks](../reports/mobile/loading-verification.json). A failed module shows the delayed-load retry; account failure uses the existing explicit account/session recovery notice.
- Standard `git diff --check` passed after removing one extra trailing blank line in the touched performance HTML. Existing Windows line-ending conversion warnings do not indicate test failures.

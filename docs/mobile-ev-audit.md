# Market workspace mobile audit

Audit date: 2026-09-28. Scope: the implemented `/ev` hash routes and shared quote controls. All prices in this workspace are currently **permanent demo data** (`EV_DEMO_MODE = true`); screenshots and numeric examples do not represent executable offers.

## Evidence and test conditions

- Chromium 1243 and Playwright WebKit 2336, Windows host, touch/mobile emulation, reduced motion. No physical iPhone, Android phone, native keyboard, or installed PWA was available.
- Widths: 320, 360, 375, 390, 430, 768, 667 × 375 landscape, and 1440 desktop. Fourteen actual routes were swept in both engines. JSON files record every route, width, document width, number of cards, script errors, and measurements.
- Initial untouched rendered baseline was blocked by missing `account-sync.js`: `reports/mobile-ev-before-390.png`. This was a concurrent account integration, subsequently fixed by the account author/root agent.
- The first working baseline under `reports/mobile-ev/before-chromium-fixture/` used local source HTML/static assets and an explicitly mocked null session. It is marked `fixture: true` in the JSON.
- Final verification uses the real local server on port 3201, the account author's isolated test database, a real authenticated session, and the test customer's Pro grant. The authentication state is stored only in the OS temporary directory. No production credentials or production changes were used.
- `reports/mobile-ev/before-chromium/` is a **reconstructed layout baseline**: the new mobile installer is disabled and the prior arbitrage calculator CSS is served, against the same current shared card design. Other chats were actively editing the account system and card template during the audit. These are matching visual comparisons, not a claim to have preserved an immutable repository-wide starting point.
- `reports/mobile-ev/after-chromium/` and `after-webkit/` are authenticated after captures. `journeys-chromium/` and `journeys-webkit/` contain functional screenshots and results.

## Implemented route inventory and findings

| Route | Severity | Reproduced finding and resolution | Evidence |
|---|---|---|---|
| `/ev#ev-pre` | P1 | Filters and stake controls pushed the first useful selection below the first phone screen. Native filter sheet now retains changes on Close/Back, exposes event/player search, labels active filters, and keeps the result action visible. Card footer inheritance inflated cards; compact phone layout restores density. The subsequently introduced reference template now has a phone summary with an explicit details toggle and 40-item batches. Book names accompany logos. | `before-chromium/ev-pre-390.png`, `after-chromium/ev-pre-390.png`, `journeys-chromium/filters-390.png` |
| `/ev#ev-live` | P1 | Every 15 seconds the entire live view was replaced even with unchanged prices, losing DOM identity/focus and repeating calculations. The local tick now skips hidden tabs/editing and only reevaluates when odds, capacity, suspension flag or freshness changes. Existing live EV order is preserved during automatic refresh. | `journeys-chromium/results.json`, `journeys-webkit/results.json` |
| `/ev#arb-pre` | P1 | Phone calculator used 9–11px labels/inputs; side stakes and prices were cramped. Two readable columns now place each row label above both sides, with 16px inputs and 44px controls. Displayed stake/profit calculations retain cents instead of whole-dollar rounding. “Max stake” was misleading for an anchor-stake input and is now “First stake.” | `journeys-chromium/arb-calculator-320.png`, corresponding route captures |
| `/ev#arb-live` | P1 | Same calculator issues; automatic updates could reorder opportunity pairs. Existing pair order is preserved by both quote IDs. Freshness eligibility remains controlled by existing core math. | route captures; `test/ev-core.test.mjs`, `test/ev-mobile.test.mjs` |
| `/ev#middles` | P2 | Shared cards had excessive vertical spacing and small secondary actions. Compact presentation preserves both selections, exact lines, both prices, stakes, winning interval, and one-win loss/profit. Existing integer/push caveat remains. | `after-chromium/middles-content-390.png` |
| `/ev#parlay` | P1 | Add/remove called tool navigation each time and reset browsing position/filters; ticket was below 468 rendered legs. Same-tool changes now retain scroll. A compact sticky count/combined odds/EV summary offers Review ticket and Return to legs. Initially renders 40 legs with explicit “Show more,” while filtering still searches the complete collection. Same-event and mixed-book combinations explain why totals are unavailable. | `journeys-chromium/parlay-ticket-390.png`, results JSON |
| `/ev#holds` | P2 | Shared footer height and action spacing problems. Both prices and selections remain visible in compact cards. | `after-chromium/holds-content-390.png` |
| `/ev#promo` | P2 | Numeric form inputs risked mobile zoom; shared quote cards were excessively tall. Inputs are 16px on phones and outcome receipts remain readable. Existing bonus/hedge math was regression-tested. | route captures; `test/ev-more-tools.test.mjs` |
| `/ev#optimizer` | P2 | Shared card density and target issues. Two-pick ranking cards now fit phone width with clear payout and projected EV. Existing limits of payout estimates remain explicit. | route captures |
| `/ev#slip` | P1 | Same-tool add/remove navigated back to the top and discarded browsing context. It now preserves scroll and focuses the changed pick. Shared phone input sizes and card controls improved. | route captures; generic slip core regression test |
| `/ev#fantasy-alerts` | P2 | Actual implemented discrepancy workspace was included in both browser sweeps. Phone inputs and action sizing share the fixes above. These are local comparison rules, not delivered notifications. | authenticated route captures |
| `/ev#prediction` | P2 | Shared price/card action density. Existing contract bid/ask/depth cards remain readable; trade and position tables retain controlled horizontal overflow. | route captures |
| `/ev#trends` | P2 | Existing local historical results use a dense table. Horizontal regions are keyboard focusable and identified as horizontally scrollable, while event/market data remain intact. | route captures |
| `/ev#line-alerts` | P2 | Dense saved-history table and forms. Numeric entries use phone-sized controls, table overflow stays in the region, and unchanged local quote ticks do not rebuild the screen. This is an in-browser rules/history feature, not delivered push notifications. | route captures |

Smart Money `/ev#sharp`, Odds `/ev#odds`, and Fantasy `/ev#fantasy` were audited by the parallel odds/DFS agent. Shared changes here avoid showing an extra generic filter button above their dedicated controls. Smart Money selection now scrolls/focuses the detail panel on phones and has a Back to opportunities action.

## Source changes owned by this audit

- `public/ev-mobile.js`: native mobile filter sheet using the existing controls, browser Back handling, retained filter edits/scroll, active count, comparison region keyboard access, stable record ordering, quote revision identity.
- `public/bet-history.js`, `public/bet-reference-history.js`, `public/bet-comparison.js`, `public/bet-comparison.css`: responsive line/odds history, three time ticks on phones, touch-persistent point details, portrait/landscape fullscreen, observer cleanup, and explicit gaps after 15 minutes without observations. Both independently implemented history renderers have an Expand chart action. The later reference renderer was adapted after coordination with its author.
- `test/bet-history-inline.test.mjs`: expanded the existing DOM fixture with dialog ancestry/viewport height to cover responsive binding.
- `test/bet-history-mobile.test.mjs`: viewport-scaled history and unobserved-gap semantics.
- `public/ev-mobile.css`: compact betting cards without removing price/line/value context; visible book names; sheet and form touch targets, safe area/dynamic viewport sizing; phone input sizes; parlay review summary; book search layout.
- `public/ev.js`: minimal integration into the concurrently edited workspace; unchanged-tick avoidance and hidden-tab guard; stable automatic EV/arb/Smart Money ordering; search and sportsbook multiselect retention; no navigation reload on sport filtering; preserved history state; precise arb stake/profit values; phone comparison focus; parlay pagination, position retention and combination explanations; generic slip position retention; pin/flag feedback; deferred ResizeObserver to prevent WebKit resize-loop errors.
- `public/ev-feed.js`: persistent user-selected refresh interval; no local age-status updates in hidden tabs; existing request deduplication, timeout, backoff, Retry-After and pause rules retained. These controls remain disabled in permanent demo mode.
- `public/arb-calculator.css`: readable phone calculation grid, dynamic-height dialog, persistent close header, larger controls and inputs.
- `test/ev-mobile.test.mjs`: freshness/revision semantics, retained record order, cadence persistence, request deduplication, and visibility pausing.
- `scripts/mobile-ev-audit.mjs`, `scripts/mobile-ev-journeys.mjs`, `scripts/mobile-history-verify.mjs`: repeatable screenshot/width and authenticated journey checks.

The new shared `ev-bet-card.js` / `ev-bet-cards.css` template and the later `bet-inline.js` / `bet-expanded.js` reference templates were authored by another active chat, not this subtask. The account integration and server asset registration were also coordinated with their respective owners.

## Results and measurement boundaries

The initial shared-card implementation was independently replaced again during final verification. Its earlier before/after numbers below are intermediate evidence, not a valid controlled comparison of the final reference-card design. The phone reference cards now keep market, selection, book/odds, fair probability, EV, stake and available capacity in the summary, with a 44px Compare prices & details control for the table/actions/history; desktop retains the full reference layout.

At 390px the earlier comparable layout baseline puts the first EV card at **979.9px** and arbitrage card at **1014.2px**. The authenticated optimized captures place them at approximately **511px** and **562px**, respectively. Exact current coordinates are stored in the final JSON because shared header changes can alter these values.

The original working parlay fixture rendered **468 cards / 14,141 DOM nodes**. The optimized authenticated workspace initially renders **40 cards / approximately 2,000 DOM nodes**, with an explicit button to load further matching legs. The filtering source remains complete and selected ticket legs are not limited to the visible batch.

Functional timings are browser automation wall time, not INP: Chromium's initial pass opened filters in 127ms, opened/closed a comparison in 125ms, searched empty/reset in 448ms, and added/reviewed/removed a parlay leg in 296ms. WebKit also passed these flows. The results files retain each run's actual timings; they include automation overhead and are single-run lab observations.

Final engine journeys passed search, retained sportsbook multiselect, filter-sheet Back, full-collection filtering with 40→80 pagination, both comparison/history implementations, touch point details, fullscreen, exact arb-stake edits at 320px, parlay scroll/ticket/reload restoration, with no page or API errors. The final new reference template places the first EV card at 511.14px at 390px. It renders 40 of 126 matching pregame selections and 7,291 total DOM nodes; live renders 7,171 nodes. Both EV routes were recaptured at all eight widths in both engines after the last template changes. Other unchanged routes retain the preceding sweep captures.

The dedicated landscape check verifies the entire SVG, not just the dialog bounds: at 667×375 the odds/line-history plot ends at 367.19px and the newer reference-history plot at 342px in both engines. Evidence: `reports/mobile-ev/history-landscape-results.json` and each engine’s `line-history-fullscreen-landscape.png` / `reference-history-fullscreen-landscape.png`. Portrait touch tooltip screenshots are retained in the same journey folders.

An initial 16-second unchanged-live observation retained the same first card object, unchanged scroll, and unchanged DOM count in both engines. Final journey runs extend the observation to 61 seconds and preserve the same first card, exact scroll position and 7,171-node live view in both engines. This measures local demo-clock behavior only; it does not establish production feed reconnect or long-session memory stability. Chromium's exposed heap figures are coarse, and WebKit does not expose the same memory metric.

The screenshot sweep records LCP/CLS/resource sizes for diagnosis, but it rotates/resizes the viewport and some initial runs encountered slow account initialization. **Do not use sweep LCP/CLS as a controlled before/after performance claim.** The root audit's separate normal/throttled performance run is the appropriate performance evidence. No real-user INP/RUM was available.

## Remaining limitations, in impact order

1. Production feeds, suspended-market messages, book betslip deep links, real liquidity/execution limits, and real live reconnect behavior are unavailable in permanent demo mode. The interface labels demo data; no live execution was claimed. Arbitrage currently excludes exchange quotes, so exchange-arbitrage execution was not tested.
2. Real quote sync still recomputes the workspace on a changed snapshot; unchanged timer ticks are now cheap and automatic order is stable. A one-price production update benchmark cannot be established with the demo-only application. No unsupported virtualization was introduced. Other large demo lists still render their complete result: middles 252 cards / 12,549 DOM nodes, and arbitrage 162 cards / 8,661 nodes. These remain candidates for incremental rendering if production volumes warrant it.
3. Native iOS/Android browser chrome, the on-screen keyboard, password-manager behavior, physical touch accuracy, PWA return-to-app links, and pinch zoom were not physically tested. WebKit and Chromium emulation are the available evidence.
4. Saved filter presets, weighted sharp-book/devig configuration, production notification delivery, and sportsbook-specific parlay betslip creation do not exist in these implemented tools. Numeric pricing remains an estimate from recorded/demo inputs.
5. Browser Back is verified for the new filter sheet. Inline comparison has explicit Collapse/Escape and focus return; it does not create a separate browser-history entry. The shared shell handles Back for modal dialogs.
6. Phone reflow and targets were inspected and tested, but this is not a complete screen-reader or WCAG conformance certification. Physical assistive-technology testing remains outstanding.

Run `node --test test/bet-history-inline.test.mjs test/bet-history-mobile.test.mjs test/ev-mobile.test.mjs test/ev-core.test.mjs test/ev-more-tools.test.mjs` for the 26 focused regression tests (all passed in the final run). With the root test server running, use `MOBILE_URL=http://127.0.0.1:3201 node scripts/mobile-ev-audit.mjs` (PowerShell: set `$env:MOBILE_URL` first), add `--webkit` for WebKit, and run `node scripts/mobile-ev-journeys.mjs` / `--webkit` for full interactive checks.

Final verification also runs `node scripts/mobile-history-verify.mjs`, which asserts both complete landscape plots fit the viewport and records the resulting geometry. No external sportsbook session or executable betslip was available, so external return-to-app behavior was not claimed.

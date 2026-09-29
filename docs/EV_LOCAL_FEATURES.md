# +EV suite implementation coverage

Delivery coverage for the complete supplied feature checklist, 27 September 2026. Each status below describes the implemented browser workflow and its remaining data or service dependency.

Local port: JavaScript syntax compilation passed. No automated test suite was run. Provider connectivity and native-device behavior remain unverified.

## Status key

- **Local** — a browser workflow or calculation is present in reviewed source.
- **Data** — the browser can display or calculate it from supplied records; automatic provider delivery is pending.
- **Partial** — a local portion works; the remaining automation or service-dependent portion is named in the note.
- **Service** — requires a provider, authenticated cloud service, payment/delivery system, or native application.

The local application remains in its existing permanent demo mode. Its simulated example observations refresh locally and remain labeled as demo data. User-entered records retain their supplied timestamps. Local wallets, announcements, probabilities, promotions and results are supplied research records rather than automatically verified feeds.

## Implementation evidence

The localhost files are under the main project `public/` directory. Open http://localhost:3100/ev. Existing cards stay available; Detailed analysis opens the extended market calculations. Pricing & filters, Alerts, Performance, and All tools expose the added workflows. Ticket details & grading opens the shared ledger inside the workspace. Account storage and the existing guest demo isolation are preserved.

| Feature area | Primary source |
| --- | --- |
| Suite integration, settings, saved views, +EV, arb/middle UI, parlay builder, alerts, bet links | `ev-suite.js`, `ev.js` |
| Eligibility, exact identity, devig, weighted consensus, interpolation, constrained stakes, middle outcomes, parlay and performance math | `ev-advanced-math.js`, `ev-core.js` |
| Odds Screen, sportsbook order, history, wallet-fill markers, DFS overlays, Smart Money | `ev-market-views.js`, `ev-market-views.css` |
| DFS research, app comparison, payout tables, combination search, slip history and manual grades | `ev-fantasy-lab.js`, `ev-fantasy-lab.css`, `dfs-workspace.js` |
| Shared bet storage, snapshots, warnings, tags, CSV, profit/ROI/CLV | `ev-ledger.js`, `ev-ledger.css`, `bet-utils.js`, `bet-legs.js` |
| Wallets, announcements, promos, bankroll, account preferences, affiliate ledger, coverage and reports | `ev-operations.js`, `ev-operations.css` |
| Full comparison card and profit-boost preview | `bet-inline.js`, `bet-comparison.js` |
| Installable web-app shell and offline navigation response | `ev.html`, `ev.webmanifest`, `ev-app-icon.svg`, `ev-sw.js` |

## Odds data and coverage

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Pregame odds across sportsbooks, exchanges, prediction markets, and DFS apps | Data | Quote, prediction-contract and DFS record models; actual platform coverage awaits the selected providers. |
| Live odds with fast updates | Data | Live quote state, age checks and local refresh; no incoming live feed is connected. |
| Main lines, player props, alternate lines, period/quarter markets, and live props | Local | Exact market identity includes event/player, type, period, threshold, settlement and live status. |
| Sportsbook coverage by state or region when odds differ | Data | Supplied region metadata and pricing filter; automatic location/region coverage requires provider data. |
| Available exchange liquidity and maximum stake size | Data | Supplied liquidity and stake limits are displayed and constrain arb calculations. Missing values remain unknown. |
| Automatic removal of suspended, expired, and stale lines | Local | Availability helper filters explicit statuses, expiry, start time and configured freshness limits. |
| Market matching when books use different player-prop lines | Local | Separate thresholds plus optional labeled interpolation between qualifying reference lines. It never treats different lines as identical. |
| Live game scores, clock, and game state | Data | Supplied game-state fields render on market and +EV views. |
| In-play versus game-stoppage status | Local | Supplied game state renders both states; the pricing helper supports explicit in-play/stoppage filters. |
| Sport-specific live details: down and distance, inning/count/runners, fouls, timeouts, cards, and penalties | Data | Supported supplied fields; no inferred game state. |
| Historical odds and line movements | Local | Existing timestamped observations, line/price charts and exact values table. |
| Data freshness indicators and a way to report incorrect lines | Local | Freshness indicators plus local reports shown/exported in Coverage. |

## Arbitrage and middles

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Pregame arbitrage finder | Local | Available exact-market pregame pairs and constrained stake calculation. |
| Live arbitrage finder | Local | Same calculation using current eligible live records; live delivery remains provider-dependent. |
| Stake calculator for every side of an arb | Local | Stakes and each outcome's net profit, including rounding, commission and supplied limits. |
| Actual available stake based on exchange liquidity or max bet | Data | Uses supplied limits; unknown capacity is identified. |
| Minimum and maximum arb percentage filters | Local | Pricing settings filter calculated arb margin. |
| Minimum available bet-size filter | Local | Filters minimum feasible total stake when capacity is known. |
| Pinned and hidden arbs | Local | Whole-opportunity pin/hide actions update both legs, and pinned opportunities sort first. |
| Live line movement on arb cards | Local | Cards show previous supplied price to current price and any recorded line change; absent history is labeled. |
| Middles alongside arbs | Local | Combined arbitrage-and-middle display mode. |
| Middles-only filter | Local | Dedicated mode and tool. |
| Middle payout and outcome calculator | Local | Enter both stakes and a final total/selection margin to inspect win/loss/push outcomes. |
| Bonus-bet and odds-boost calculations for arbs | Local | Bonus stake selection, first-leg profit boost and constrained recalculation. |
| Auto-refresh and saved filters | Local | Refresh reevaluates local records. Saved views include pricing, market filters, host context and ledger filters. |
| Alerts for qualifying arbs | Local | In-app/browser watches with threshold, scope, deduplication and cooldown. |

## Positive EV

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Pregame and live +EV feeds | Data | Separate filtered local feeds; incoming live odds await providers. |
| Fair probability and expected-value calculations | Local | Reference consensus, commissions, optional push probability and conditional-probability handling. |
| No-vig comparison against selected sharp books | Local | Multiplicative, additive and power devig methods. |
| Custom sharp-book selection by sport, league, and market | Local | Scoped book rules. |
| Required versus optional sharp books | Local | Required missing references prevent an estimate. |
| Custom sharp-book weights | Local | Positive configured weights shown in diagnostics. |
| Minimum number of sharp books required | Local | Minimum complete qualifying reference books. |
| Maximum vig filter | Local | Rejects excessive reference market vig. |
| Minimum and maximum EV filters | Local | Pricing settings. |
| Minimum and maximum odds filters | Local | American odds limits. |
| Filters for sportsbook, league, market, bet side, and game status | Local | Book/context and pricing filters, including explicit live in-play/stoppage state. |
| Projection of a fair line when books offer different prop numbers | Local | Optional interpolation within available same-book thresholds, with provenance and push restrictions. No extrapolation. |
| Exchange liquidity included in the pricing signal | Local | Optional liquidity weighting of complete exchange references. |
| Market-wide comparison before placing a bet | Local | Existing full comparison card via data-detail. No wager is submitted. |
| Pinned, hidden, and already-taken bet indicators | Local | Persisted flags plus ledger warnings for already tracked exact selections. |
| Alerts for qualifying +EV bets | Local | EV thresholds, scope and notification cooldown. |

## DFS / Fantasy

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| DFS pick board across supported apps | Local | Existing DFS workspace displays supplied app records and labeled design examples. |
| Fixed-payout and variable-payout app support | Local | Custom payout tables with exact-hit return multipliers; variable offers use the supplied table for that specific combination. |
| Pick-level EV and breakeven probability | Local | Pick EV requires a supplied return multiplier. Table breakeven uses independent equal-probability picks. |
| Fantasy slip builder with combined slip EV | Local | Existing independent-pick slip calculation using supplied payout rules. |
| Custom devig settings for Fantasy | Local | Separate devig method, probability basis, minimum references and interpolation setting; other sharp-book rules inherit suite settings. |
| Comparison of DFS picks against sportsbook and exchange lines | Local | Exact event/player/market/period/live family comparison with available recorded book prices. |
| Fair-line estimates when DFS and sportsbook numbers differ | Local | Exact no-vig consensus or explicitly labeled bracket interpolation; supplied probabilities remain labeled. |
| Market comparison showing each book's line and point difference | Local | Book/app comparison table includes line difference and link to the existing bet card. |
| Over/under, market, and push-line filters | Local | Side, app, market, live/pregame, push-capable and promo filters. |
| Line history and movement charts for Fantasy picks | Local | Saved pick observations provide an actual line chart and exact-value table. |
| Live DFS picks | Data | Requires live supplied app records and rules; no DFS provider feed is connected. |
| Promo-square identification and inclusion in slips | Local | Saved promo annotation/filter and inclusion in the configured app slip. |
| One-click links that populate supported DFS slips | Data | Only provider-supplied supported URLs can prefill an app; no universal URL synthesis is claimed. |
| Fantasy bet tracking and automatic grading | Partial | Saved slips, manual leg grading, app-return overrides and shared-ledger tracking. Provider-delivered grading is pending. |
| Fantasy alerts | Local | Qualifying available picks use the configured fair estimate, explicit pick payout, EV threshold and optional exact-line exchange liquidity requirement. |

## Parlay builder

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Select +EV bets to build a parlay | Local | Add/remove qualifying legs in the builder. |
| Calculate combined odds, probability, and EV | Local | Independent leg product or explicitly supplied actual odds and joint probability. |
| Account for related/correlated legs | Local | Same-event/tagged correlations require supplied joint probability and combined price; no correlation estimate is invented. |
| One-click links that populate supported sportsbook parlays | Data | A shared provider-supported parlay URL must be attached to every selected leg. |
| Track parlay bets and their individual legs | Local | Shared ledger retains the selected leg records and saved calculation assumptions; individual leg controls are present. |
| Automatic parlay grading | Partial | Manual leg/ticket settlement is available; automatic results and settlement-rule delivery remain provider-dependent. |

## Smart Money

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Track odds and activity on liquid exchanges | Data | Current liquidity and supplied fill volume; historical timestamps remain unchanged. |
| Identify notable price movement or trading activity | Local | At least two distinct observations of the exact selection and threshold; movement is implied-probability percentage points. Trade activity is shown only if supplied. |
| Find the same selection at a better price elsewhere | Local | Exact same side, market, line and settlement match. |
| Choose which exchanges contribute to the signal | Local | Persisted exchange checkboxes and minimum-liquidity filter. |
| Show Smart Money signals in +EV and DFS tools | Local | +EV rows show matching exchange liquidity and supplied previous-price movement; Fantasy shows qualifying exact-line movement badges. |
| Live Smart Money feed with auto-refresh | Data | Refresh reevaluates supplied current records; live exchange delivery is pending. |
| Track Smart Money bets | Local | Comparison card and shared-ledger tracking preserve recorded quote/source context. |
| Smart Money alerts | Local | In-app/browser watches use implied-probability movement points from recorded observations. |

## Odds screen and Market View

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Search by sport, league, event, team, player, or market | Local | Search plus separate sport/league selectors. |
| Side-by-side sportsbook odds grid | Local | Latest current quote per exact selection and book; best displayed price highlighted. |
| View all alternate lines for a market | Local | Alternate thresholds remain distinct groups. |
| Drag, reorder, and save preferred sportsbook columns | Local | Drag/drop plus accessible move-left/right controls. |
| Choose which books appear in Market View | Local | Persisted visibility checkboxes and show-all action. |
| Open any odd into a full bet card | Local | data-detail falls through to the existing comparison handler. |
| View liquidity, line history, and available bet links from that card | Local | Existing comparison card plus suite actions for quote metadata, exact-quote history, tracking and supplied bet links. |
| Live and pregame modes | Local | Pregame, live or both. |
| Mobile-friendly Odds Screen | Local | Responsive filters and horizontally scrollable semantic table; no automated mobile tests were run. |
| Auto-refresh | Local | Optional timer reevaluates saved observations; no API polling. |
| Fast keyboard search | Local | Slash shortcut focuses search outside editable controls. |

## Line history

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Price and line movement charts | Local | Decimal-price or numeric-threshold axes; no generated history. |
| Pregame and live history | Local | Exact family identity includes game phase. |
| Selectable time intervals and fullscreen view | Local | Last hour, 6 hours, 24 hours or all; Fullscreen API with fallback message. |
| Choose which books appear on the chart | Local | Persisted book visibility checkboxes. |
| Compare sportsbook movement against a Fantasy pick | Local | Optional saved Fantasy threshold overlay in line mode, separate from recorded sportsbook data. |
| Mark important market events on the chart | Local | User markers can be created, edited and removed; source status is explicit. |
| Store historical odds for later analysis | Local | Existing local quote snapshots and imported historical records. |

## Bet tracker

The suite uses the existing `/bets` storage key and validator. Personal bets, legacy workspace bets and examples remain distinguishable. Quote snapshots and calculation assumptions are stored with suite metadata.

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Add bets directly from Arb, +EV, Fantasy, Smart Money, Parlays, and Odds Screen | Local | Shared tracking dialog accepts one quote, multiple linked sides, parlay or saved Fantasy slip. |
| Quick “track this bet” action after opening a bet link | Local | Suite link dialog includes the tracking action. |
| Record stake, odds, book, market, time, and source tool | Local | Shared ledger plus suite metadata captures quote snapshots, placement time, tool and devig assumptions. |
| Open, live, settled, and ungraded bet views | Local | Ledger filters distinguish open, supplied live/review state and settled results. |
| Live stat progression for open bets | Data | Requires supplied observations/stat updates; no live results connection. |
| Current market price, estimated win probability, and potential profit | Local | Available exact selection comparison, stored probability and potential ticket profit. |
| “Already bet this” alerts | Local | Tracking dialog warns when the same selection and threshold appears in the personal ledger. |
| Correlated-bet alerts | Local | Tracking dialog warns about open exposure in the same event; parlay calculations separately require supplied joint assumptions for related legs. |
| Automatic grading for supported sports, props, DFS slips, and parlays | Partial | Structured leg observations and local settlement/manual grading are supported. Automatic results ingestion and correction delivery require a provider. |
| Flag an incorrectly graded bet | Local | Ledger grading-review flag and Coverage grading issue reports. |
| Bet notes | Local | Existing shared bet model validates and stores notes. |
| Custom color-coded tags and bulk tagging | Local | Personal-ledger selection, bulk tag addition and saved tag colors. |
| Filter by sport, league, market, sportsbook, tool, date, and tag | Local | Ledger and performance filters include all listed dimensions plus source and status. |
| CSV export with bet details and devig settings | Local | Filtered CSV includes recorded probability, devig settings, quote snapshots and leg observations; formula-like text is escaped. |

## Profit, ROI and CLV dashboard

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Cumulative, daily, and monthly profit graphs | Local | Date-ordered settled profit charts from the selected records. |
| ROI and profit by sport, league, market, book, tool, and tag | Local | All six breakdown dimensions with profit, risk, ROI, exposure and comparable CLV. |
| Custom date ranges | Local | From/through filters apply to both tracker and performance views. |
| Amount risked and open exposure | Local | Existing ledger and new performance calculation helpers. |
| Closing line value tracking | Local | Comparable exact-line closing prices; unknown/noncomparable CLV excluded. |
| CLV breakdowns and performance charts | Local | Comparable exact-selection CLV chart and per-dimension CLV statistics. |
| Separate results for +EV, arbs, middles, Fantasy, parlays, and Smart Money | Local | Source-tool metadata drives the tool breakdown; source can be reviewed when tracking. |
| Full bet history and advanced performance filters | Local | Personal, legacy and example sources remain identifiable and filterable. |

## Insider / wallet tracking

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Track selected prediction-market wallets | Local | Saved public-wallet watchlist; no automatic wallet feed. |
| See wallet bets and open positions | Data | Enter/import positions, fills and realized results. |
| Wallet performance profiles | Local | Derived from supplied realized risk and net P/L. |
| Backtested and forward-tested results | Local | Explicit sample labels and filters; the app does not run a trading-strategy backtest. |
| Adjusted ROI, sport results, arb ratio, and pregame ROI | Local | Uses supplied adjusted P/L and explicit classifications; no adjustment is invented. |
| Follow or unfollow wallets | Local | Saved local follow state. |
| Show wallet counts and positions on both sides of a market | Local | Counts distinct recorded wallets by exact event/market/line and side. |
| Display recent fills on price-history charts | Local | Saved matching wallet fills appear as timestamp markers and an accessible details table. No sportsbook price is invented from fill cents. |
| Find comparable sportsbook prices for wallet selections | Local | Linked quotes match sport, event, market, side and threshold with live/period/player/settlement guards. These are recorded comparisons; quote availability must be confirmed before use. |
| Insider bet tracking and alerts | Local | Recorded wallet positions link to comparable book cards for tracking; followed-wallet fill watches produce local alerts. |

## Lineup dropper

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Monitor official lineup announcements and changes | Data | Local announcement records with required source URL; background monitoring needs a provider. |
| Detect players added, removed, or moved in a lineup | Local | Compare pasted previous/new ordered lineup snapshots; added, removed and moved players are detected. Live official ingestion awaits a provider. |
| Estimate which player markets should move | Data | Supplied prior/new projection and affected market; no automatic projection engine. |
| Identify books still showing an older line | Local | Compares quote timestamps against the announcement; does not claim those quotes are still executable. |
| Compare available prices with an independent projection | Data | Supplied probability/source yields a transparent EV calculation. |
| Alert users to qualifying lineup-driven opportunities | Local | Local watches compare available matching quotes observed before an announcement against its supplied probability and the requested EV threshold. |
| Show opposing-pitcher projections and relevant matchup data | Data | Supplied opponent/pitcher projection and notes. |

## Promos and betting tools

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Promo and signup-offer directory | Local | Create/edit/delete saved offers, eligibility terms, links and expiry. |
| Promo converter / matched-betting calculator | Local | Supplied complementary odds, stake, commission and refund values. |
| Bonus-bet conversion calculator | Local | Bonus stake is not returned; hedge and equalized cash result shown. |
| Risk-free or insured-bet calculator | Local | Supplied cash/bonus refund value; terms must match the entered assumptions. |
| Odds-boost calculator | Local | Boost applies to profit and respects a supplied cap. |
| Apply a boost to a +EV bet, arb, middle, or promo and recalculate stakes | Local | The Compare card previews a profit boost and recalculates returns; arb, middle and promo dialogs apply boost/bonus assumptions to their calculations. |
| Refresh active promotions | Local | Rechecks saved expiry dates; provider refresh of offer terms/availability is pending. |
| Bankroll and stake-sizing tools | Local | Available bankroll, exposure, cap and fractional Kelly calculator. |

## Alerts and personalization

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Save multiple filters for every tool | Local | Saved views include tool, pricing rules, market filters, host context, ledger filters, Fantasy filters and Operations wallet/lineup/promo/report/affiliate filters. |
| Push notifications on desktop, iOS, and Android | Partial | Browser Notification API while the workspace is open; background/mobile push delivery requires a service and permission/subscription setup. |
| Discord notifications | Service | Destination authorization and delivery backend pending; watch preference can be stored. |
| Per-filter notification controls | Local | Watches can select a saved view and set scope, enable/pause, requested delivery, threshold and cooldown. |
| Minimum EV/arb thresholds and alert rate limits | Local | Threshold, per-watch cooldown and seen-observation deduplication. |
| Alerts for Fantasy, Smart Money, and lineup changes | Local | Fantasy pick EV, recorded exchange probability movement, and lineup projection-edge watches run against supplied records while the page is open. |
| Saved odds-format preference | Local | Effective suite setting supports American, decimal and fractional display. |
| Saved book order, sharp-book settings, and card-tap behavior | Local | Saved market column order, reference rules and card behavior. Coverage preferences update effective suite odds, region and card settings. |
| Tap, pin, expand, or pin-and-expand bet cards | Local | Suite quote rows honor the chosen card-tap behavior. |
| Swipe to pin or hide bets on mobile | Local | Touch gestures on suite quote rows; not every specialized card has the row marker yet. |

## Bet links and apps

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Direct event links where one-click betslips are unavailable | Local | Supplied event URLs with HTTP/HTTPS validation. |
| One-click prefilled sportsbook betslips where supported | Data | Supplied supported prefill URLs only. |
| One-click DFS slips and parlays where supported | Data | Shared supported parlay URL or saved Fantasy slip URL; actual prefill support depends on the destination provider. |
| Location-aware links | Data | Uses manually selected region and supplied per-region links; no automatic location access. |
| Verify that the selection, points, and odds still match before a bet is placed | Partial | User review dialog shows the recorded selection/price; automatic destination verification requires a provider connection. |
| Installable mobile web app | Local | EV manifest, icon, install action, standalone start URL and navigation-only offline fallback are wired; installation depends on browser support. |
| Native iOS and Android apps | Service | Native codebases, signing and distribution are outside the browser implementation. |
| Fast mobile cards, filters, charts, and tables | Local | Responsive compact layouts are present; preview visual review was performed, with no automated performance benchmark or device test suite. |

## Account and business features

| Requested feature | Status | Implementation and limits |
| --- | --- | --- |
| Free and paid feature tiers | Partial | Local tier preview only; billing, entitlements and enforcement need authenticated services. |
| Saved user settings synced across devices | Service | Browser persistence works; secure account sync is not connected. |
| Referral links and affiliate commission tracking | Data | Local referral-source/campaign/link and manually recorded attributed signups/commissions. Automatic attribution requires the affiliate service. |
| Affiliate dashboard and payout details | Local | Editable local ledger, pending/paid totals, recorded payout time/reference, status filter and CSV export. It does not issue payments. |
| In-app issue reports for stale lines and bad links | Local | Local report entry, review state, edit/delete and export in Coverage. |
| Admin tools for coverage, data-health monitoring, and user reports | Partial | Local record counts, freshness/invalid-odds summary and own reports; multi-user admin/roles require a backend. |

## Integration notes

1. **History selection:** the market module uses `marketViews.historySelection = JSON.stringify([marketIdentity(q,false), String(q.side||'').trim().toLowerCase(), ''])`, `historyScope = 'quote'`, `historyQuote = q.id`, and `historyPage = 0`. `historyQuoteId` is not a supported key.
2. **Reports:** use the normalized `suite.operations.reports` collection with `reference/description` and supported `open/reviewing/resolved` states. Imported legacy suite-level reports need normalization if present.
3. **Market identity:** arb and middle pairing must preserve sport, league, event/player, period, threshold, settlement and live identity. Reference aggregation must not mix alternate thresholds.
4. **Event capture:** suite controls are inside `#main`; suite dialogs attach their own handlers outside it. Stop propagation only for handled events. Avoid blanket `preventDefault()` on checkbox/input/drag events. Operations dispatch precedes market dispatch because both use `data-evx-action`.
5. **Saved views:** snapshots preserve view configuration and filters, not historical records or annotations. Restoring a filter should not overwrite saved market-event markers.
6. **Refresh:** automatic reevaluation must preserve supplied observation timestamps and avoid discarding unsaved form input or replacing an active fullscreen chart.
7. **Provider boundary:** official odds/results/lineups, verified betslip formats, remote push, Discord, account sync, billing, referrals, payouts and native apps remain external integrations. No service placeholders should be presented as connected systems.
8. **Review method:** modules were read directly, the build/syntax compilation succeeded, and the rendered preview received visual review. No automated test suite, provider integration test, native-app test or cross-device installation test was run.


## Local delivery status

- Files integrated into the main localhost application; the separate hosted checkout is no longer the target for these edits.
- Local server restarted on 127.0.0.1:3100; the suite JavaScript asset returns HTTP 200.
- The page currently returns **Account access is unavailable** from the existing authentication gate. BETTER_AUTH_SECRET and BETTER_AUTH_URL are not configured. This prevents browser review of the integrated page; authentication was not bypassed.
- Existing account services handle signed-in tickets and suite state. The checklist's service-dependent account features refer to their configuration/activation, not a replacement account system. Guest previews retain the app's temporary storage behavior.
- No new hosted deployment or remote Git push was performed during this local port. The prior hosted release has not been rolled back.

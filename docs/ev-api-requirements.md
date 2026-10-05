# EV API handoff for all VisualOdds tools

> **Where pricing happens:** the website's frontend no longer computes fair odds, EV, arbitrage or any other betting analytics. The browser reads finished values from the website API (`/api/odds/*`), which today prices the raw quote feed on the server and will pass through the odds API's own values once it returns them. What that API must return is in [odds-architecture.md](odds-architecture.md).

## What is already configured

The endpoint and key (`EV_TOOL_API_URL`, `EV_TOOL_API_KEY`, `EV_TOOL_API_ALLOW_HTTP`) are set in the Vercel project environment. The VisualOdds server forwards the documented health, status, quotes, matches and reserved scrape routes, attaching `X-API-Key` to every request. Credentials do not belong in browser code or examples.

The +EV page syncs quotes when it opens and auto-refreshes every 10 seconds by default (viewers can pick 15, 30, 60 seconds or Off). Live tools always refresh every 3 seconds. Refresh pauses in background tabs and while editing, and backs off after transient failures. Configuration, authentication and invalid-payload errors pause retries until a manual retry. Sportsbook prices come only from this API; there is no manual price entry or import.

## Live feed audit (30 September 2026)

A check of the production `GET /quotes` response (18,729 quotes, 689 events, 13 books) found the problems below. Until they are fixed at the source, most of the feed cannot be compared across books, so Arbitrage, Positive EV, Middles and Low holds show far fewer results than the data should support.

| Problem | Example from the feed | Effect | Fix in the feed |
| --- | --- | --- | --- |
| **Old prices are never removed** | 1 Oct 22:12 UTC: 17,000 of 30,000 records were over 15 minutes old (Fanatics: 17,948 over an hour old while its newest record was 1 minute old). Fanatics `Broncos @ 49ers` `Under 48.5` at `+140` was last seen at 15:21; Fanatics' current price is `-140`. When a price changes, some selections get a new record next to the old one (3,200+ selections had copies hours apart, e.g. a moneyline at `-245` from 15:21 and `-275` from 22:10). | Dead and outdated prices show as live +EV and arbitrage. | `/quotes` must be the **current** snapshot: update a selection's record in place (same `id`), and remove it as soon as the book stops offering it. The site now ignores prices older than 15 minutes, but the feed should never send them. |
| **Event names differ by book** | DraftKings `CIN Bengals @ MIA Dolphins`; Fanatics `Cowboys @ Texans` and `Dallas Cowboys @ Houston Texans`; theScore Bet `Steelers @ Browns`. `eventId` is just the lowercased name. | Prices for the same game never meet: only 16 of 83 NFL games had more than one book. | Send one canonical `eventId` per game shared by every book (for example a provider game ID), and one consistent `event` name. |
| **`side` disagrees with `selection_name`** | 8,573 of 8,603 totals have `side: "home"` while `selection_name` is `Over 44.5` / `Under 58.5`. Fanatics spread `side: "home", line: -3` has `selection_name: "Dallas Cowboys +3.0"` (Dallas is away). Kambi soccer (BetRivers, Desert Diamond, Bally Bet) `home` = selection `2`, `away` = `X` (draw). Kambi MLB moneylines are swapped (Bally `CHI White Sox @ HOU Astros` home = Chicago). FanDuel totals `side: "home"`, selection `Under`. | Wrong team shown and fake EV/arbitrage (for example 3,000%+ EV on Fanatics Titans @ Ravens `+4000`). | `side` must be the priced selection: `over`/`under` for totals, `home`/`away` matching the team in `selection_name` for spreads and moneylines, with the line signed from that team's view. `selection_name` is already right on 99% of quotes; make `side` agree with it. |
| **Other markets filed as moneyline** | Fanatics moneylines with selection `Dallas Cowboys / Tie`, `No`, `Under 2.5`; a tennis doubles price (`Schlagenhauf, Noah/Stroemberg, Isac`) inside the singles match `Mensik @ Bublik`. Soccer 1X2 sent as a two-way moneyline. | De-vigging mixes different bets; fake arbitrage. | Send 1X2 as `type: "1x2"` with home/draw/away; double chance, yes/no and doubles as their own markets and events. |
| **Alternate lines with no opposite side** | Fanatics Steelers @ Browns: 80 spread lines, all `side: "home"`, none `away`. | Can't pair the two sides of each line. | Send both sides of every line with `type: "alternate"`. |
| **Started games stay in the feed** | Matches that started at 03:05 were still listed 19 hours later; none disappeared over an 11-minute window. | Old prices on finished games count as current. | Remove started events from pregame, or send `status: "suspended"`/`"closed"`. |
| **Stale prices** | 40% of quotes were 30–60 minutes old; only 3.7% under a minute. | EV and arbitrage built on prices that have moved. | Scrape main markets every few seconds pregame and 1–5 s live; report per-book last-success times on `/status`. |
| **Games listed twice by one book** | Fanatics lists `Steelers @ Browns` and `Pittsburgh Steelers @ Cleveland Browns`, sometimes at different prices. | Duplicate or conflicting prices from one book. | One listing per game per book. |
| **`ts` means different things** | Bally Bet, BetRivers, Desert Diamond and theScore Bet send the game start (for example `2026-10-02T00:15:00+00:00` on 30 September); DraftKings, Fanatics and FanDuel send when the price was seen. | Freshness checks and the Starts filter can't be trusted. | `ts` = when the price was observed. Put the game start in `startTime`. |
| **Wrong sport labels** | Central American soccer clubs as `americanfootball`; European basketball clubs (`KK Bosna Sarajevo @ Lietkabelis`) as `nba`; college football and MLS games as `nfl`; plus `other` and `unknown`. | Games appear under the wrong sport and match the wrong markets. | Send a correct `sport` and a `league` (`NFL`, `NCAAF`, `NBA`, `EuroLeague`, `MLS` ...). |
| **No exchange liquidity** | 4 exchange quotes (Novig, ProphetX, Kalshi, Polymarket), none with `liquidity`. | Smart Money has nothing to rank. | Send `exchange: true` and numeric available `liquidity` in dollars for exchange prices. |
| **No DFS lines or player props** | No PrizePicks, Underdog or Sleeper lines, and no sportsbook player props (0 records with `player`). | The DFS tools have nothing to show. | Send pick'em lines and sportsbook player props in `/quotes` (section 2). |
| **No live quotes** | `live: false` on every quote. | Live +EV and Live Arbitrage are always empty. | Send in-play prices with `live: true`, updated every 1–5 s. |
| **No sharp reference book** | No Pinnacle, Circa or liquid exchange prices. | Fair odds come from one or two soft books, so EV is unreliable. OddsJam-style tools anchor fair odds on sharp books. | Add Pinnacle (a scraper exists in `integrations/ev_tool/pinnacle_odds_scraper.py`) or another sharp source. |
| **No deep links, start times or props** | No `betUrl`/`eventUrl`, no `startTime`, no player props. | Every Bet button is a dead end; rows say "Start time not entered"; prop tools are empty. | Per-quote `betUrl`/`eventUrl`, `startTime` on every quote, player props with `player`/`playerId`. |
| **Full 7 MB snapshot on every request** | 18.8k quotes, 7.08 MB (765 KB compressed) per poll; an 11-second change is about 20 KB compressed. | 235–586 MB per hour per open tab; slow on mobile. | Return `version` and `generated_at`; support `GET /quotes?since=<version>` deltas (or SSE) and `ETag`/`304`. |
| **One key for reads and writes** | The site uses one key for GET and for POST/DELETE/scrape. | A leaked or misused site key can write quotes and trigger scrapes. | Issue a read-only key for the site's quote reads. |

### What the site does meanwhile

These are workarounds, not replacements for fixing the feed:

All of this runs on the website's server, in `lib/odds/normalize.mjs` and `lib/odds/event-match.mjs`, before the prices are priced (`lib/odds/engine.mjs`) and sent to the browser. Once the odds API cleans its own feed, these steps have nothing left to repair.

- **Sides rebuilt from `selection_name`:** totals become over/under, and spreads and moneylines take the named team, with the line from that team's view. When a spread's selection has no line and names the other team, it is skipped. So are records whose selection is a different bet: another game's team, "/ Tie", Yes/No, or a doubles pair inside a singles match. Soccer `1`/`X`/`2` selections become a three-way market. Quotes without a `selection_name` (theScore Bet, BetMGM, exchanges) keep the feed's `side`.
- **Team-name matching (NFL, NBA, NHL, WNBA):** games are matched by team nickname, so `CIN Bengals`, `Bengals` and `Cincinnati Bengals` line up, and each game and team shows the fullest name any book uses. MLB is excluded because the same teams play on back-to-back days and the feed's times can't tell those games apart.
- **Skipping impossible listings:** a book's two-way listing whose own sides can't be real (both underdogs, or a margin over 25%) is skipped. So are one-sided spread/total ladders whose side couldn't be confirmed.
- **Duplicates:** one book listing a game twice, or repeating a quote id, keeps the newest price.
- **Start times:** books whose `ts` values are whole-minute game starts (Bally Bet, BetRivers, Desert Diamond, theScore Bet) have them moved to `startTime`. Their price age shows as unknown. A start time from any book applies to the whole game. Pregame prices on games that have already started are dropped.
- **Mirrored books:** books that post the same price on 70% or more of 30+ shared markets are one reference in the fair odds. In the live feed that is BetRivers, Desert Diamond and Bally Bet (Kambi).
- **Main vs alternate lines:** for each book, the spread/total line priced closest to even money is the main line. Its others show under Alternate lines on the Odds Screen, and they still compare across books.
- **Expired prices:** pregame prices not refreshed for 15 minutes are ignored, and older copies of a selection give way to the newest. Each selection gets a site id that stays the same across scrapes.
- **Sanity limits:** by default, EV above 25% (10% when one book sets the fair price), arbitrage above 15%, holds and promo pairs priced like a 15%+ arbitrage, and middles costing more than 8% are hidden. Each EV, arbitrage and middle limit can be changed.

On 30 September 2026 this kept about 14,000 of 23,000 quotes. It skipped roughly 6,000 duplicates, 2,500 records filed under the wrong game or market, and a few hundred prices on started games. The feed panel shows the skipped count on each update.

**Also check:** `Betr Picks` appeared in the feed as a book on NFL moneylines. Betr Picks is a pick'em (DFS) app. If its prices aren't real sportsbook odds, they shouldn't be sent as sportsbook quotes, because they feed the fair odds.

Only the supplied quote routes are connected to this LAN API. **The additional route names below are proposals, not claims that your server implements them.** A single snapshot endpoint could carry several datasets instead; actual response examples or an OpenAPI document are needed before wiring their adapters.

## Coverage of all 18 tools

| Tool | Required data | Current LAN connection |
| --- | --- | --- |
| Odds comparison | Available quotes for the same event, market, period, selection, line and bookmaker | Quote sync prepared |
| Positive EV — pregame | Offered price plus complete opposing outcomes at reference books | Quote sync prepared; data completeness determines results |
| Positive EV — live | Same, with real observation times and frequent live updates | Quote sync prepared; live quotes expire after 90 seconds |
| Arbitrage — pregame | Complete opposing outcomes at different books, identical settlement rules | Quote sync prepared for two-outcome markets |
| Arbitrage — live | Same, with current live observations | Quote sync prepared for two-outcome markets |
| Middles | Opposing total/spread lines for the same event and period | Quote sync prepared |
| Low holds | Complete opposing available prices | Quote sync prepared |
| Promo / bonus converter | Hedge quotes; bonus amount, type and account-specific terms | Quotes connected; terms remain user inputs |
| Parlay builder | Prices and fair probabilities for independent selections from one book | Quote sync prepared; executable book/SGP pricing is separate |
| Sharp money / Pro | Exchange quotes, available liquidity, opposing book quotes and depth observations | Works from quote records when exchange fields are supplied |
| Fantasy lines | DFS platform/player lines and selection probabilities | Separate DFS dataset needed; saved/imported props work |
| Fantasy optimizer | DFS props, probabilities, payout tables and entry restrictions | Separate DFS dataset needed |
| Fantasy slip builder | Same, with the selected app's exact payout rules | Separate DFS dataset needed |
| Fantasy alerts | New/changed DFS props with stable IDs and timestamps | Separate DFS dataset needed; browser alert engine exists |
| Prediction traders | Contracts, bids/asks, depth, positions and trades | Separate datasets needed; saved/imported records work |
| Bet tracker & CLV | Linked selections, event results, book settlement rules and closing prices | Existing game-results connection; LAN quote-to-ticket linking and closing prices still needed |
| Player prop trends | Historical player statistics aligned to game IDs and market definitions | Separate results dataset needed |
| Movement & price alerts | Current quotes, observed movements and timestamps | Local history/alerts update from quote sync; historical backfill requires a history source |

## 1. Complete sportsbook and exchange quotes

Use the existing `GET /quotes`. It must return a **complete current snapshot**, either a JSON array or `{ "quotes": [...] }`. An empty array means there are no active quotes and clears the previous API snapshot. A failed request must use a failure response, not a successful empty array. Exclude suspended, closed and unavailable prices from this snapshot. Partial or paginated snapshots cannot replace the workspace safely; delta delivery needs a separate adapter.

Required on every quote: `id`, `sport`, `event`, `market`, `side`, `book`, American `odds`, and `ts` (real observation time in ISO 8601 with timezone). Send `type`, `live` and `line` explicitly; total/spread/alternate markets need a numeric line. The small example in the supplied guide omits `id`, `book` and `ts`; its eventual GET response must include them.

```json
{
  "quotes": [{
    "id": "provider:event-123:full:total:44.5:over:book-a",
    "sport": "NFL", "league": "NFL",
    "eventId": "event-123", "event": "Arizona vs Seattle",
    "startTime": "2026-10-01T00:00:00Z", "period": "full",
    "marketId": "event-123:full:total", "market": "Game total",
    "type": "total", "line": 44.5, "side": "Over", "outcomes": 2,
    "book": "Book A", "odds": -110, "live": false,
    "exchange": false, "liquidity": 0,
    "ts": "2026-09-25T18:00:00Z"
  }]
}
```

This is an illustrative schema, not current market data. Also return the other outcomes and books for complete comparisons.

- IDs must remain stable across price updates. Use common event, market and player IDs across books; a quote ID identifies one book/selection/line. Market IDs must identify the comparable market, not a book-specific quote.
- Send `playerId` and `player` for player props. Give periods distinct values so a first-half market cannot match a full-game market.
- Use consistent sport, bookmaker and side names. `soccer` and standard lowercase league names are normalized; `1x2` is treated as three-way. Full outcomes are needed: home/draw/away for three-way; declared field size for futures.
- Use selection-perspective spread lines, e.g. home `-3.5`, away `+3.5`. `+100` is numeric `100` in JSON. Blank/missing lines are only suitable for markets that have no line.
- Exchange entries need `exchange: true` and numeric available dollar `liquidity`. A complete depth ladder requires selection ID, price, available size and timestamp for each level; the current quote adapter only represents the supplied quote/liquidity records.
- True stake constraints need max/min stake and exchange fee/commission information. The current calculators do not enforce book limits or execute wagers.
- Send accurate `ts` values, even when prices do not move. Do not replace the observation timestamp with the time an HTTP response is delivered.

## 2. DFS (pick'em) lines and player props

The DFS tools read pick'em lines from the same `GET /quotes` snapshot as everything else; no separate route is needed. Send two kinds of records:

**1. Pick'em lines**: one record per app, player, market, line and side. `book` is the app (`PrizePicks`, `Underdog`, `Sleeper`, `Betr`, `Dabble`, `ParlayPlay` ...). `odds` may be omitted, because pick'em apps post a line, not a price.

```json
{ "id": "pp:buf-mia:josh-allen:passing-yards:262.5:over", "book": "PrizePicks",
  "sport": "nfl", "event": "Bills @ Dolphins", "startTime": "2026-10-04T17:00:00Z",
  "type": "prop", "player": "Josh Allen", "team": "BUF", "market": "Passing Yards",
  "line": 262.5, "side": "over", "selection_name": "Josh Allen Over 262.5",
  "live": false, "ts": "2026-10-01T15:02:11Z" }
```

Send both `over` and `under` when the app offers both.

**2. Sportsbook player props**: the same shape, with a sportsbook `book` and real American `odds`, for both sides. The site computes each pick's hit chance from these: the no-vig probability at the **same player, market and line**, with Pinnacle weighted 3× and mirrored books (Kambi) counted once.

```json
{ "id": "dk:buf-mia:josh-allen:passing-yards:262.5:over", "book": "DraftKings",
  "sport": "nfl", "event": "BUF Bills @ MIA Dolphins", "type": "prop", "player": "Josh Allen",
  "market": "Passing Yards", "line": 262.5, "side": "over", "odds": -120,
  "selection_name": "Josh Allen Over 262.5", "live": false, "ts": "2026-10-01T15:02:09Z" }
```

Rules that make the matching work:

- **Same player name and line** across apps and books. Market names may differ in common ways ("Pass Yds", "Passing Yards" and "Player Passing Yards" are treated as one). Keep the rest consistent, or send a shared `marketId`.
- **Event names** follow the "Away @ Home" convention used for game lines. Games are matched across books the same way.
- **`type: "prop"`**, `player`, numeric `line`, and `side` `over`/`under` on every prop.
- **`ts`** is when the line was seen; **`startTime`** is the game start. Lines on started games are dropped.
- **Optional `probability`** (0–1) on a pick'em record overrides the sportsbook-based hit chance, for example from your own model. Say where it comes from.

Without matching sportsbook props, the picks still show, but with "—" for hit chance, and the optimizer can't rank them.

**Payouts.** The site starts from each app's published standard payouts:

- **PrizePicks Power Play:** 2-pick 3×, 3-pick 6×, 4-pick 10×, 5-pick 20×, 6-pick 37.5×. Source: prizepicks.com/resources/prizepicks-payouts, updated 9 Sep 2026.
- **Underdog Standard:** 2–8 picks 3.5×, 6.5×, 12×, 20×, 35×, 65×, 120×. Source: Underdog help center.

Members can edit and save their own. Sleeper and other apps price per pick, so a pick's multiplier (`multiplier`, total return per $1) would be needed to support them. Flex, Demon/Goblin and reduced-payout picks are not modeled.

## 3. Prediction contracts, depth and personal records

Proposed routes: `GET /prediction/contracts`, `GET /prediction/orderbooks`, and, if account integration is wanted, `GET /prediction/positions` and `GET /prediction/trades`.

Contract records need `id`, `sport`, `platform`, `event`, Yes `bid` and `ask` in cents (0–100), `last`, `volume`, `ts`, settlement time and contract rules. Order-book records need contract ID, side, price level, available quantity and observation timestamp. Clearly distinguish shares/contracts from dollars.

Current local positions use `id`, `name`, `contractId`, `side` (`Yes`/`No`), `quantity`, and `entry` in cents. Trades use `id`, `trader`, `contractId`, `side`, `quantity`, `price`, and `ts`. Real account records require the user's account authorization; manual/imported records remain available. These are tracking inputs, not trading/execution endpoints.

## 4. Historical results and event identity

Proposed route: `GET /players/results` with sport/player/date filters and pagination for backfills.

The current trends workspace expects `id`, `sport`, `player`, `market`, `game` (stable game ID), `date`, `line` and numeric `result`. Supply the underlying game statistics, player IDs, opponents, participation/minutes, event status and correction timestamps. Historical hit rates need the matching historical line or an explicitly selected comparison threshold; do not silently invent past lines. Correlation requires aligned game IDs.

Use the existing `/matches` route to expose a stable event catalogue, or propose `/events`: sport, league, event ID, participant IDs/names, scheduled start, live/final/postponed status and period. Confirm how cancelled events and stat corrections are represented.

## 5. Closing lines and settlement

Proposed routes: `GET /odds/history` and `GET /odds/closing`. Return quote/selection/event/market/book IDs, period, line, odds, observed timestamp and the definition of the closing observation. Historical line movement before the page was opened also needs this source. A live price after kickoff is not a pregame closing line.

The tracker already reads `/api/bets/catalog` and `/api/bets/game` through the app's separate game-data provider. It uses game IDs and structured legs to refresh results. Reuse that integration where coverage is sufficient. The EV feed needs an explicit mapping from its event/player/selection IDs to tracker IDs; matching names alone is insufficient.

For settlement outside current coverage, supply final scores/stat values, completion/void/cancellation status, overtime inclusion, DNP rules and corrected-result versions. Personal tickets still need booked odds, stake, book, placement time and linked selections. Never infer a ticket or stake from a public odds feed. Book-specific parlay repricing and cash-outs require the actual book's returned amount or manual entry.

## 6. Operational details to provide with the API

1. **Schema:** OpenAPI file or sanitized sample success, empty and error responses for each supplied dataset. No additional copy of the API key is needed.
2. **Coverage:** sports/leagues, bookmakers/exchanges/DFS apps, markets/periods, live coverage and historical date range. Confirm a real producer updates `/quotes`; `/scrape` remains reserved.
3. **Delivery:** allowed polling interval, quota/rate limits, `429`/`Retry-After`, max response size and timeout. The app can request at 15/30/60 seconds; choose a rate the host supports. Subsecond delivery needs a stream/delta design and reconnect semantics.
4. **Consistency:** ID stability, complete-snapshot semantics, removals/suspensions, timestamp timezone, corrections, and whether multi-book prices are captured together.
5. **Errors/health:** status codes for invalid keys, unavailable upstream data, rate limiting and partial failures. `/status` should identify enabled datasets and the last successful observation for each.
6. **Hosting:** the API can run on any reachable host. Set `EV_TOOL_API_URL` to a local/private address, or to a public IP or domain over HTTPS (plain HTTP to a public host needs `EV_TOOL_API_ALLOW_HTTP=1` and sends the key unencrypted). The VisualOdds server attaches `X-API-Key`; browsers never see it.

## App work completed independently of the missing datasets

- Manual sync plus session-only opt-in refresh, with no automatic request on initial load.
- Last successful sync and source-observation ages shown separately; expired live quotes are identified.
- One request at a time, retry backoff, rate-limit delay, and pauses for hidden tabs/editing.
- Saved prices retained on network/auth/config errors and malformed, duplicate-ID or partial snapshots.
- Manual prices retained on sync; imported workspaces cannot be overwritten by an earlier in-flight request.
- Movement history records actual price/line changes; the latest 5,000 API movement entries are retained locally. Manual history is retained separately.
- Tool labels distinguish quote snapshots from DFS, prediction and results data.
- Quote grouping uses sport, event, player, period and market identity to avoid comparing unrelated selections.

Remaining adapters depend on confirmed schemas and sample responses. Verification against the real server remains pending by request.

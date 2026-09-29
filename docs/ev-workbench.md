# EV workbench data contract

## Persistent design demo

The EV+ area currently has `EV_DEMO_MODE = true` in `public/ev-preview.js`, as requested. Every tool uses a populated demo workspace across NFL, MLB, NBA, WNBA, NHL and Soccer. Live sample observations renew, builders start with sample selections, and alerts, history, fantasy props, prediction positions and results are seeded. The tracker includes open/settled singles and parlays, pushes, voids and cash-outs.

The demo stays enabled across reloads until this flag is deliberately changed. Demo edits use `sportslab-ev-permanent-demo-v1` and `sportslab-ev-permanent-demo-bets-v1`; production workspace and personal-bet storage are separate. Quote sync and automatic tracker result refresh are disabled in this mode. The API instructions below describe the retained live-mode integration.

The `/ev` dashboard is usable without a feed. It starts with explicitly labeled hypothetical records. Users can add and edit records, calculate outcomes, manage local alerts, and export or import a version 1 JSON workspace. Records are saved in the browser under `sportslab-ev-workbench-v1`.

## Supported sites

`public/platform-catalog.js` defines the 29 requested sites: 11 sportsbooks, 12 DFS/pick’em apps, and six prediction platforms. The catalog supplies manual-entry suggestions, platform filters, logos, receipt-name recognition, and tracker identities. Existing DraftKings Pick6 and Pinnacle records remain supported. betPARX, Circa Sports, SuperBook Sports, and Betly are deferred.

DraftKings Fantasy and FanDuel Fantasy remain distinct from their sportsbooks. They support entered player research and manual tracker records; the pick’em calculator does not model contest scoring or standings. Other pick’em calculations require entered payout rules. Prediction contracts use cents per $1 settlement; exchange quotes entered as American odds belong in the quote tools. ESPN BET aliases resolve to theScore Bet.

Site support does not add API feeds, live prices, automatic account syncing, or jurisdiction coverage. Sportsbook state filtering continues to use its separate coverage data.

## Feed integration

The EV API connection uses `EV_TOOL_API_URL` and `EV_TOOL_API_KEY` from the ignored root `.env.local` file, with server environment variables taking precedence. The Sportslab Node server must be on the same WiFi or LAN as the EV API host on port 8000. It adds `X-API-Key` to every request, including health, and never sends the key to browser code. Use **Sync API** on `/ev` to read normalized quotes through `/api/ev/quotes`. No EV requests run automatically when the page loads. The bridge is disabled on hosted Vercel and Sites. See `integrations/ev_tool/README.md` for the route mapping.

The supplied LAN API reserves `POST /scrape` for future use. Quote producers can submit arrays to `POST /api/ev/quotes`. The bundled Python source remains an optional development scaffold; it is separate from the configured LAN server.

The quote response may be an array or `{ "quotes": [...] }`. Every usable record needs `id`, `sport`, `event`, `market`, `side`, `book`, valid American `odds`, and an ISO `ts` with timezone. The short ingestion example in the connection guide omits `id`, `book`, and `ts`; the API must supply these in its quote response before the workspace can use it. The adapter does not invent bookmaker attribution or freshness. Sports such as `soccer` and `nfl` are normalized to the workspace's sport names. A `1x2` market is treated as three-way with three outcomes.

Successful syncs replace the previous API snapshot and example sportsbook quotes while retaining manual prices and other workspace records. They save movements and switch the odds and arbitrage screens away from demo data, including when the server returns an empty quote list. Failed requests, invalid records, duplicate IDs and explicit partial/paginated responses preserve the entire saved snapshot.

Use **Sync API**, or opt into auto-refresh at 15, 30 or 60 seconds. Auto-refresh starts off on every page load, pauses while the tab is hidden or an editor is open, and retries temporary failures with backoff. Authentication, configuration and malformed-data errors pause retries until a manual retry. Rate-limit responses can supply `Retry-After`. Choose an interval supported by the server; polling is not a continuous stream.

The feed panel shows last successful sync, newest observation time, expired live counts, and the data needed by the active tool. API history records price/line changes rather than repeated identical prices and keeps the latest 5,000 API movement entries. Manual history is retained separately. Quote grouping includes sport, event, player and period identity. See [the complete API handoff](ev-api-requirements.md) for all 18 tools and the additional datasets still needed.

The feed adapter should supply the same record shapes used by `public/ev-demo.js`. The calculation functions in `public/ev-core.js` do not fetch data. Keep stable `id` values for the same quote across updates and append a history snapshot whenever its price or line changes. The current UI form and JSON import do this locally.

An ordinary quote uses:

```json
{
  "id": "provider:event:market:line:side:book",
  "sport": "NFL",
  "event": "Arizona vs Seattle",
  "market": "Game total",
  "type": "total",
  "outcomes": 2,
  "line": 44.5,
  "side": "Over",
  "book": "Example Book",
  "odds": -110,
  "live": false,
  "exchange": false,
  "liquidity": 0,
  "ts": "2026-09-25T00:00:00.000Z",
  "source": "provider"
}
```

Use American odds of `+100` or greater or `-100` or less. `ts` is the observed time, not the browser's render time. Live calculations discard quotes older than 90 seconds. An exchange quote sets `exchange: true` and provides available dollar liquidity. For fair probability, every exhaustive outcome must be available at another book at the exact event, market, line and live status. Set `outcomes` to the full field size for a multi-outcome future; incomplete fields remain visible in comparison without an EV estimate. Three-way game markets use three outcomes. Arbitrage and low-hold stake tools operate on two-outcome markets.

DFS records include `id`, `sport`, `event`, `player`, `market`, `line`, `side`, `app`, `probability` (0–1), and `ts`. Payout rules are keyed by app and entry size; each array index is the exact number of winning picks, and its value is the total return multiplier including stake. Prediction contracts use `sport`, `platform`, `event`, Yes `bid` and `ask` in cents, `last`, `volume`, and `ts`. The other arrays in the version 1 export hold local bets, game results, positions, trades and alert rules.

For spreads, enter the line from each selection's perspective (for example, Arizona `-3.5` and Seattle `+3.5`). The middle tool pairs wider opposing spread lines and different total thresholds. Calculations assume exhaustive sportsbook outcomes, independent parlay and fantasy picks, and no fees or limits. Live price and liquidity delivery, calibrated hit probabilities, sportsbook settlement rules, and account-specific promotional restrictions must be supplied by future providers before the page can present actionable opportunities.

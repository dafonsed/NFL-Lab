# EV workbench data contract

The `/ev` dashboard is usable without a feed. It starts with explicitly labeled hypothetical records. Users can add and edit records, calculate outcomes, manage local alerts, and export or import a version 1 JSON workspace. Records are saved in the browser under `sportslab-ev-workbench-v1`.

## Feed integration

The optional local EV API integration lives in `integrations/ev_tool/`. Run its Python service separately, then use **Sync local API** on `/ev` to read normalized quotes through the same-origin `/api/ev/quotes` bridge. The service is loopback-only and the bridge is disabled on hosted Vercel. Manual and imported records continue to work when it is unavailable. See `integrations/ev_tool/README.md` for routes and the local handoff.

The supplied EV tool folder's scraping code is incomplete; `POST /api/ev/scrape` returns 501. A provider must submit normalized records to `POST /api/ev/quotes` before a sync can populate the workspace.

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

# Odds and analytics architecture

The website displays betting analytics; it does not compute them. Fair probabilities, devig, +EV, arbitrage, middles, holds, consensus averages, smart-money signals and DFS fair probabilities are produced behind the website API and arrive in the browser finished.

```
QUOTE PROVIDERS → ODDS API → NORMALIZATION → DEVIG / FAIR ODDS → +EV / ARB / ANALYTICS → WEBSITE API → BROWSER
                  └──────────── today: lib/odds (server) ────────────┘   /api/odds/*      odds-client.js
                  └──────────── later: your odds API (/v1/odds/*) ────┘
```

## The boundary

| Layer | Files | Owns |
| --- | --- | --- |
| Contract | `lib/odds/contract.d.ts` (types), `public/odds-contract.js` (runtime validation, errors, pricing preferences, freshness, value states) | The one data shape every producer and the browser agree on (`visualodds.odds/1`) |
| Providers | `lib/odds/providers.mjs` | Where data comes from: `website-transition` (default) or `odds-api` (`ODDS_PROVIDER=odds-api`) |
| Transition engine | `lib/odds/normalize.mjs`, `lib/odds/event-match.mjs`, `lib/odds/engine.mjs`, run on a worker thread (`lib/odds/worker.mjs`) | Until the odds API returns analytics: cleaning the raw feed and computing every value |
| Website API | `lib/odds/http.mjs` → `GET /api/odds/*` | Validated, controlled, rate-limited answers in the contract; no secrets |
| Browser adapter | `public/odds-client.js` | The only way a page reads odds: request sharing, timeouts, typed errors, validation, server clock |
| Formulas | `public/betting-math.js`, `public/market-identity.js` | One implementation of each formula, shared by the engine (server) and member calculators (browser) |

Switching the source to the odds API changes `lib/odds/providers.mjs` configuration only. No page changes: every page already reads `/api/odds`, and both providers answer in the same contract.

## Audit: who computed what

| Calculation | Before | Now |
| --- | --- | --- |
| Feed cleaning: sides, events, duplicates, stale and started prices, mirrors, alternate lines | Browser (`ev-feed-normalize.js` on a web worker, `ev-event-match.js`), about 2 s per refresh | Server: `lib/odds/normalize.mjs`, `lib/odds/event-match.mjs` |
| Implied probability, each book's own no-vig split and hold | Browser (odds screen, comparison panel) | Server, per quote: `impliedProbability`, `bookFairProbability`, `bookHold` |
| Consensus fair probability and odds (devig, sharp weights, book rules, mirrors, interpolation) | Browser (`ev-core.js`, `ev-advanced-math.js`) | Server: `pricing` section (`fairProbability`, `fairOdds`, `devigMethod`, `devigVersion`, references) |
| +EV, edge, Kelly fraction, plausibility caps | Browser | Server: `pricing` section (`ev`, `edge`, `kellyFraction`, `plausible`) |
| Arbitrage legs, stake shares, margin, capacity, push handling | Browser | Server: `arbitrage` section |
| Middles, low holds, smart money, promo hedge pairs | Browser | Server: `middles`, `holds`, `sharp`, `hedges` sections |
| Market averages, best price exclusions (outliers) | Browser (odds screen) | Server: `markets` section, per-quote `outlier` |
| Price freshness | Browser, from `ts` and its own clock | Server: per-quote `expiresAt` and `status`; per-response `staleAfter`; DFS lines carry the same |
| DFS fair probabilities (feed lines and lines a member enters) | Browser | Server: `/api/odds/dfs`, `/api/odds/dfs/price` |
| EV and price alerts (browser and email) | Browser module reused by the email job | Shared matcher `public/odds-alerts.js` comparing server values with the member's thresholds; the email job prices with `lib/odds/engine.mjs` |
| Odds conversions, devig, Kelly, payouts, parlay, DFS payouts, CLV, ROI | Copied in about 20 files | `public/betting-math.js` only (enforced by `test/odds-architecture.test.mjs`) |

### What the browser still calculates

Only presentation and calculators on numbers a member enters:

- **Scaling server fractions**: stake = server `stakeFraction` × the member's total; Kelly stake = server `kellyFraction` × bankroll × Kelly multiplier.
- **Calculators**: the arbitrage, hedge, EV, Kelly and promo calculators; promo terms and profit boosts applied to server hedge pairs and arbitrage; the middle/boost dialog; DFS slips (the member's picks and payout table); parlays the member builds; the bankroll calculator.
- **The member's own records**: bet tracker profit, ROI and CLV from recorded and closing odds.
- **Display**: formats, sorting by decimal odds, an implied-probability chart axis, counts and averages of values already on screen.

## Website API

All routes are `GET`, `Cache-Control: no-store`, gated by the `ev-feed` entitlement and the shared price-request rate limit (120 a minute per IP with `/api/ev`). Every query value is validated; an invalid one is a `400 BAD_REQUEST`.

| Route | Answer |
| --- | --- |
| `/api/odds/snapshot?include=pricing,markets,arbitrage,middles,holds,sharp,hedges,events&sport=&books=&prefs=` | Every current price plus the requested sections |
| `/api/odds/ev`, `/arbitrage`, `/middles`, `/holds`, `/sharp`, `/hedges`, `/markets` `?sport=&live=&minEv=&limit=&books=&prefs=` | One section and only the quotes it names (`ev` lists positive, plausible rows, highest first) |
| `/api/odds/events?sport=&event=&prefs=` | Games, or one game's prices, pricing and market summaries |
| `/api/odds/dfs?prefs=` | Pick'em lines priced against sportsbooks, with power-play payout tables |
| `/api/odds/dfs/price?lines=&prefs=` | The same pricing for up to 50 lines a member entered |
| `/api/odds/history?id=&hours=` | Recorded prices for a quote's market (its book and up to four others) |
| `/api/odds/contracts?platform=` | Prediction-market contracts |

`prefs` is JSON of the pricing settings that differ from the defaults (`devigMethod`, `minSharpBooks`, `maxVigPercent`, `bookRules`, `liquidityWeighting`, `allowProjection`, `liveMaxAgeSeconds`, `pregameMaxAgeSeconds`, `minLiquidity`, `maxEvPercent`, `maxArbPercent`); members on the defaults send none and share one cached answer. `books` lists the sportsbooks the member can bet: holds and hedge pairs pick their best prices among them, while fair values use every book.

Long lists travel as tables (`{ table: 1, columns, dictionaries, refs, rows }`, see `encodeTable`), about a quarter of the JSON. Producers may send plain arrays instead.

### Values, freshness and errors

- **Units**: probabilities, EV, edge, hold and margins are fractions (0.075 = 7.5%); American odds are numbers; even money is +100.
- **Missing values**: a value the producer can't supply is `null` and shows as "—". The browser drops and counts records it can't read (`decodeSnapshot`) and never fills a gap with a substitute.
- **Value states** (`valueState`): `authoritative` (computed by the odds API), `calculated` (computed by the website's server), `unavailable`, `stale`, `pending`. The comparison panel names the source of the fair value it shows.
- **Freshness**: each quote and DFS line carries `expiresAt` (observation + the member's live/pregame price age, never past a pregame start) and `status` (`open`, `suspended`, `closed`, `unavailable`, `stale`). A price is current only while `open` and before `expiresAt` on the server's clock (the browser corrects for its own clock from the `Date` header). A response past `meta.staleAfter`, or a held-over upstream snapshot (`meta.stale`, `meta.warmingUp`), is labeled "Held-over prices". Open boards redraw when a price passes its expiry even if refreshes are failing.
- **Partial data**: `meta.partial` with `meta.warnings` (for example, missing DFS payout tables) is shown beside the data label.
- **Errors**: `{ error: { code, message, retryable, retryAfterSeconds? } }`. Codes: `NOT_CONFIGURED`, `UNAVAILABLE`, `TIMEOUT`, `MALFORMED`, `PARTIAL`, `RATE_LIMITED` (with `Retry-After`), `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, `NOT_FOUND`, `UNSUPPORTED_MARKET`, `UNSUPPORTED_BOOK`, `CONTROLS_UNAVAILABLE`. Upstream addresses, keys and error bodies are never passed through. Pages keep the last prices, say the refresh failed, and retry with backoff.

## Caching, volume and real time

- **Browser**: identical requests in flight are shared (`odds-client.js`); a page requests only the sections its tool shows; table decoding takes about 180 ms for a full slate, against about 2 s of browser normalization before.
- **Server**: the quote inventory is read once per 2 s for all visitors; a priced build is shared for 4 s per (distribution controls, pricing settings); serialized answers are reused per build. DFS props (60 s), priced DFS lines (15 s), payout tables (1 h), history and contracts (60 s) are cached the same way. Failures are never cached.
- **Main thread**: pricing runs on a worker thread, so the server keeps answering while it works (`ODDS_ENGINE_THREAD=off` prices on the main thread).
- **Payload**: on a 65,000-quote synthetic slate the full snapshot is about 18.7 MB of JSON (about 2.2 MB with brotli). Section routes, `sport` scoping and `include` keep each page's answer smaller.
- **Real time**: polling today (10 s pregame, 3 s live). Every answer carries `generatedAt`, `snapshotAt` and stable quote ids, so a delta feed (`since=<version>`), Server-Sent Events or WebSockets can deliver the same records later without changing the contract or the pages' display code.

## Database

The browser never reads betting data from a database. The site's database holds accounts, member settings, recorded bets, alert rules and market distribution controls. Odds, history and analytics come from the quote/odds API through the server. Distribution controls are read on every request and fail closed: if they can't be read, no prices are served.

## Security

- `EV_TOOL_API_*` and `ODDS_API_*` are server-only environment variables (Vercel). Keys travel only in the server's `X-API-Key` request header, which is checked by `test/odds-architecture.test.mjs` and `test/odds-api.test.mjs`.
- The browser can reach only `/api/odds/*` and `/api/ev/*`, both behind the plan entitlement and the IP rate limit, read-only and validated.
- Upstream requests use `redirect: 'error'`, timeouts and HTTPS for public hosts.

## Switching to the odds API

Set in the server environment:

| Variable | Meaning |
| --- | --- |
| `ODDS_PROVIDER=odds-api` | Use the odds API (unset: the website's transition engine on `EV_TOOL_API_URL`) |
| `ODDS_API_URL`, `ODDS_API_KEY` | Its base URL and key (HTTPS unless private; `ODDS_API_ALLOW_HTTP=1` to override) |
| `ODDS_ENGINE_THREAD=off` | Transition engine only: price on the main thread |

An unreachable or misconfigured odds API is reported as an error, never silently replaced by the transition engine.

### What the odds API must return

The same contract (`lib/odds/contract.d.ts`), with `meta.provenance.provider = 'odds-api'`, at:

| Odds API route | Website route it answers |
| --- | --- |
| `GET /v1/odds/snapshot?include=&sport=&books=&prefs=` | `/api/odds/snapshot` |
| `GET /v1/odds/section/{pricing,markets,arbitrage,middles,holds,sharp,hedges}?sport=&live=&minEv=&limit=&books=&prefs=` | `/api/odds/ev` … `/markets` |
| `GET /v1/odds/events?sport=&event=&prefs=` | `/api/odds/events` |
| `GET /v1/odds/dfs?prefs=` and `/v1/odds/dfs/price?lines=&prefs=` | `/api/odds/dfs`, `/dfs/price` |
| `GET /v1/odds/history?id=&hours=` | `/api/odds/history` |
| `GET /v1/odds/contracts?platform=` | `/api/odds/contracts` |

Authentication is the `X-API-Key` header. Status codes: 401/403 for a refused key, 404, 422 for an unsupported market or book, 429 with `Retry-After`, 5xx when unavailable.

Per quote: identity (`id`, `seriesId`, `sport`, `league`, `event`, `eventId`, `market`, `marketId`, `marketKey`, `type`, `period`, `player`, `side`, `selection`, `line`), `book`, `odds`, `ts`, `startTime`, `live`, `exchange`/`liquidity`/`maxStake` when known, and the computed `impliedProbability`, `bookFairProbability`, `bookHold`, `consistent`, `outlier`, `expiresAt`, `status`.

Per section, the records in `contract.d.ts`: pricing rows with `fairProbability`, `fairOdds`, `devigMethod`, `devigVersion`, `bookCount`, `references`, `edge`, `ev`, `kellyFraction`, `plausible`, `estimated`, `conditionalOnNoPush`; arbitrage with legs (`stakeFraction`, `multiplier`, limits), `margin`, `lowestPerUnit`, `capacity`, `minimumTotal`, `pushPossible`, `observedAt`, `expiresAt`; middles, holds, sharp and hedges likewise; market summaries with fair and average prices per side. It applies `prefs` and reports what it applied in `meta.pricing` (`devigMethod`, `devigVersion`, caps and price ages). The site still applies its distribution controls to every answer.

## Remaining work for the API, not the website

1. Serve `/v1/odds/*` in this contract with its own devig, fair, EV, arbitrage and analytics, then set `ODDS_PROVIDER=odds-api`. Until then the transition engine fills the gap.
2. Authoritative freshness: `expiresAt` and `status` per price, and remove suspended, closed and started prices from the snapshot.
3. Clean data at the source (see [ev-api-requirements.md](ev-api-requirements.md)): canonical event ids, sides that match the selection, correct sport and league labels, one listing per game, observation times in `ts`. The transition normalizer's repairs then have nothing left to do.
4. The member pricing preferences listed above, or a clear report of which ones it ignores.
5. Line history with implied probabilities, and closing prices per selection for tracked-bet CLV (CLV now uses the closing odds a member records).
6. Smart money beyond exchange depth (handle and ticket splits), which no current source supplies.
7. Distribution controls: an `exclude` parameter (books, events) so market averages and fair values also leave out blocked books. The site removes blocked quotes and the records naming them, but can't recompute an API-side average.
8. High-volume delivery: versioned deltas (`since=`), `ETag`/`304`, or a stream, and a read-only key for the site.

## Checking it

- `npm test`: the whole suite, including the engine (`odds-engine-*`), contract (`odds-contract`), client (`odds-client`), website API and provider switch (`odds-api`), engine thread (`odds-thread`), and boundary rules (`odds-architecture`).
- `npm run typecheck`: strict TypeScript over the contract and the browser boundary modules (`tsconfig.odds.json`). TypeScript isn't a dependency: install it locally or set `TYPESCRIPT_PATH` to a `typescript.js`.
- `node scripts/odds-preview.mjs`: the site on synthetic "Fixture" prices at http://localhost:3104, with `data/odds-preview-mode.txt` set to `normal`, `empty`, `error`, `slow` or `partial` to check each state. Local only.
- `node scripts/odds-benchmark.mjs`: engine timing and payload size on a large synthetic slate.

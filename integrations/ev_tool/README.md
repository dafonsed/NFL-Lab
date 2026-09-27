# EV Tool API integration

This folder contains the Python source files supplied in `C:/Users/eturn/Downloads/ev_tool/` and a maintained `api_server.py` quote handoff for Sportslab. The unpacked folder's source files are byte for byte identical to those in `ev_tool_complete.zip`. Its README described working scraper and match routes, but its API code only implemented health, status, and a placeholder scrape route. The bookmaker scraping modules here are retained as source prototypes and are not called by the quote API.

## Configured LAN connection

The active connection uses the supplied EV Tool host on the local network, port **8000**. Its endpoint and API key are saved in the ignored root `.env.local` file:

```dotenv
EV_TOOL_API_URL=http://<server-lan-ip>:8000/
EV_TOOL_API_KEY=<your-api-key>
```

`lib/ev-api-proxy.mjs` reads these two settings directly; shell environment values override the file. The Node server attaches `X-API-Key` to every upstream request, including health and status. The browser only calls same-origin `/api/ev/*` routes and never receives the key. The destination must be a loopback or private IPv4 HTTP(S) origin; redirects are rejected so credentials are not forwarded to another host.

Run Sportslab on a computer connected to the same WiFi or LAN as the host. Restart the local Node app after applying server code changes, then open `/ev` and choose **Sync API** when the service is available. No EV requests run automatically on page load. Hosted Vercel and Sites deployments return 503 because this connection requires the local network. Manual and imported records work while the API is offline. The connection has been configured without contacting or testing the service.

## Routes

| EV Tool service | Sportslab route | Purpose |
| --- | --- | --- |
| `GET /` | `GET /api/ev/health` | Health response |
| `GET /status` | `GET /api/ev/status` | Service and quote counts |
| `GET /quotes` | `GET /api/ev/quotes` | Normalized quote list |
| `POST /quotes` | `POST /api/ev/quotes` | Upsert a JSON array of quotes |
| `GET /matches` | `GET /api/ev/matches` | Events represented by quotes |
| `DELETE /matches/{id}` | `DELETE /api/ev/matches/{id}` | Remove an event and its quotes |
| `POST /scrape?url=...` | `POST /api/ev/scrape?url=...` | Reserved for future use |

The bridge forwards quote writes and match deletion to the configured host. Workspace sync reads quotes; editing a saved quote in the browser does not automatically publish it back to the server.

## Quote handoff

Submit an array of records with a stable `id`, `sport`, `event`, `market`, `type`, `line`, `side`, `book`, American `odds`, `live`, and an ISO observation timestamp `ts` with timezone. Optional fields are `outcomes`, `exchange`, and `liquidity`. The complete contract is in [`../../docs/ev-workbench.md`](../../docs/ev-workbench.md). Quote responses may be a raw array or an object with a `quotes` array. The short ingestion example in the supplied guide omits `id`, `book`, and `ts`; the API response must include these for the workspace to use a record. Missing values are not fabricated. Lowercase sport names are normalized, and `1x2` is handled as a three-way market.

The workspace prefixes incoming IDs with `local-api:`, so a sync does not overwrite manual quotes. Sync replaces the previous API snapshot and example sportsbook quotes, and records history when a quote's line or odds changes. Repeated unchanged observations update the quote timestamp without adding movement records. The latest 5,000 API movement entries are retained; manual history is kept separately. After a successful sync, the market screens use saved prices without adding demo quotes. Requests that fail, invalid records, duplicate IDs and explicit partial/paginated responses preserve the previous snapshot. A successful empty snapshot removes the old API quotes.

Auto-refresh is available at 15, 30 or 60 seconds and starts off each time the page loads. It pauses in background tabs/while editing, allows one request at a time, and backs off after transient errors. Authentication, configuration and invalid-data failures pause retries until a manual retry. `Retry-After` is forwarded for rate limiting. No polling was enabled during development.

Fantasy, prediction and personal bet records still use separate data. The tracker also has an existing game-results provider independent of this LAN API. [The full API handoff](../../docs/ev-api-requirements.md) lists all tool dependencies, response examples and proposed additional routes.

## Optional bundled Python scaffold

The source folder is retained for development; it does not need to be started to use the supplied LAN host. Its `run_server.py` listens on `127.0.0.1:8000`. Its quote records persist in the ignored `data/ev-tool-quotes.json` file unless `EV_TOOL_QUOTES_FILE` specifies another path. The bundled scaffold does not implement API key enforcement and is intended only for loopback development; the LAN host requires the supplied key.

The archive does not provide a working normalized bookmaker feed. Its own `POST /scrape` returns 501. A future source adapter should normalize its output and submit it to `POST /quotes`. Its `requirements.txt` lists optional prototype dependencies as well as FastAPI and Uvicorn; no dependencies were installed during this setup.

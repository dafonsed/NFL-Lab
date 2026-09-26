# Local EV API integration

This folder contains the Python source files supplied in `C:/Users/eturn/Downloads/ev_tool/` and a maintained `api_server.py` quote handoff for Sportslab. The unpacked folder's source files are byte for byte identical to those in `ev_tool_complete.zip`. Its README described working scraper and match routes, but its API code only implemented health, status, and a placeholder scrape route. The bookmaker scraping modules here are retained as source prototypes and are not called by the quote API.

## Local connection

The Python service is designed to listen only on `127.0.0.1:8000`:

```sh
python integrations/ev_tool/run_server.py
```

The Sportslab Node app uses `EV_TOOL_API_URL=http://127.0.0.1:8000/` by default. Its `/api/ev/*` bridge accepts only a loopback HTTP origin and is disabled in hosted Vercel deployments. The EV page's **Sync local API** button reads `/api/ev/quotes`; it does not make an automatic request while the page loads. If the service is not running, manual and imported records still work.

The quoted archive's `requirements.txt` lists dependencies for its optional source prototypes as well as FastAPI and Uvicorn. No dependencies are installed by this integration.

## Routes

| Python service | Sportslab route | Purpose |
| --- | --- | --- |
| `GET /` | `GET /api/ev/health` | Health response |
| `GET /status` | `GET /api/ev/status` | Service and quote counts |
| `GET /quotes` | `GET /api/ev/quotes` | Normalized quote list |
| `POST /quotes` | `POST /api/ev/quotes` | Upsert a JSON array of quotes |
| `GET /matches` | `GET /api/ev/matches` | Events represented by quotes |
| `DELETE /matches/{id}` | `DELETE /api/ev/matches/{id}` | Remove an event and its quotes |
| `POST /scrape?url=...` | `POST /api/ev/scrape?url=...` | Reserved; returns 501 until a scraper is completed |

Quote records persist in the ignored `data/ev-tool-quotes.json` file by default. Set `EV_TOOL_QUOTES_FILE` to use another local path.

## Quote handoff

Submit an array of records with a stable `id`, `sport`, `event`, `market`, `type`, `line`, `side`, `book`, American `odds`, `live`, and an ISO observation timestamp `ts`. Optional fields are `outcomes`, `exchange`, and `liquidity`. The complete contract is in [`../../docs/ev-workbench.md`](../../docs/ev-workbench.md).

The workspace prefixes incoming IDs with `local-api:`, so a sync does not overwrite manual quotes. Sync replaces the previous local API snapshot and records price history when a quote's line, odds, or timestamp changes. Quote-based market tools use this shared quote array. Fantasy, prediction, and personal bet records still use their own manual or imported arrays.

The archive does not provide a working normalized bookmaker feed. `POST /scrape` deliberately returns 501 rather than presenting placeholder data as real odds. A future source adapter should normalize its output and submit it to `POST /quotes`.

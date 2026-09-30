"""Local quote handoff for the VisualOdds EV workspace.

The supplied archive's scraping implementation is incomplete. This service
accepts normalized quotes from a trusted local process and makes them available
to quote-based EV tools through the VisualOdds same-origin bridge.
"""

from datetime import datetime
from hashlib import sha256
from pathlib import Path
from threading import RLock
import json
import os

from hmac import compare_digest

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


app = FastAPI(title="VisualOdds EV Tool API", version="1.0.0")
# Only answer requests addressed to this machine (blocks DNS-rebinding reads from web pages).
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[host.strip() for host in os.environ.get("EV_TOOL_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if host.strip()],
)


@app.middleware("http")
async def require_key_and_json(request: Request, call_next):
    """Every request needs the shared X-API-Key the VisualOdds server sends; writes must be JSON.

    Without these checks any web page open in the developer's browser could POST quotes to this
    local service (a no-preflight "simple" request) and poison the EV workspace.
    """
    expected = os.environ.get("EV_TOOL_API_KEY", "")
    supplied = request.headers.get("x-api-key", "")
    if not expected:
        return JSONResponse({"detail": "Set EV_TOOL_API_KEY for this service."}, status_code=503)
    if not compare_digest(supplied.encode(), expected.encode()):
        return JSONResponse({"detail": "Invalid or missing API key."}, status_code=401)
    if request.method in {"POST", "PUT", "PATCH"}:
        content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type != "application/json":
            return JSONResponse({"detail": "Send JSON with Content-Type: application/json."}, status_code=415)
    return await call_next(request)
DATA_FILE = Path(
    os.environ.get("EV_TOOL_QUOTES_FILE")
    or Path(__file__).resolve().parents[2] / "data" / "ev-tool-quotes.json"
)
LOCK = RLock()


class Quote(BaseModel):
    id: str = Field(min_length=1, max_length=180)
    sport: str = Field(min_length=1, max_length=40)
    event: str = Field(min_length=1, max_length=240)
    market: str = Field(min_length=1, max_length=160)
    type: str = Field(min_length=1, max_length=40)
    line: float | str | None = None
    side: str = Field(min_length=1, max_length=120)
    book: str = Field(min_length=1, max_length=120)
    odds: int
    live: bool = False
    exchange: bool = False
    liquidity: float = Field(default=0, ge=0)
    outcomes: int | None = Field(default=None, ge=2, le=64)
    ts: datetime


def load_quotes():
    if not DATA_FILE.exists():
        return {}
    records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("EV quote file must contain a JSON array")
    return {record["id"]: record for record in records}


def save_quotes(records):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(DATA_FILE.suffix + ".tmp")
    temporary.write_text(json.dumps(list(records.values()), indent=2), encoding="utf-8")
    temporary.replace(DATA_FILE)


def match_id(quote):
    key = f'{quote["sport"]}|{quote["event"]}'.encode("utf-8")
    return sha256(key).hexdigest()[:16]


@app.get("/")
def health():
    return {"status": "ok", "service": "VisualOdds EV Tool API", "version": "1.0.0"}


@app.get("/status")
def status():
    with LOCK:
        records = load_quotes()
    return {
        "active": True,
        "quoteCount": len(records),
        "matchCount": len({match_id(quote) for quote in records.values()}),
        "scraping": "not_implemented",
    }


@app.get("/quotes")
def quotes():
    with LOCK:
        records = load_quotes()
    return {"quotes": list(records.values()), "count": len(records)}


@app.post("/quotes")
def upsert_quotes(quotes: list[Quote]):
    if len(quotes) > 5000:
        raise HTTPException(status_code=413, detail="Submit at most 5000 quotes at once")
    with LOCK:
        records = load_quotes()
        for quote in quotes:
            if -100 < quote.odds < 100:
                raise HTTPException(status_code=422, detail="Use American odds of +100 or higher or -100 or lower")
            if quote.ts.tzinfo is None or quote.ts.utcoffset() is None:
                raise HTTPException(status_code=422, detail="Quote timestamps must include a timezone")
            record = jsonable_encoder(quote)
            record["source"] = "local-api"
            records[quote.id] = record
        save_quotes(records)
    return {"accepted": len(quotes), "count": len(records)}


@app.get("/matches")
def matches():
    with LOCK:
        records = load_quotes()
    found = {}
    for quote in records.values():
        key = match_id(quote)
        if key not in found:
            found[key] = {"id": key, "sport": quote["sport"], "event": quote["event"], "quoteCount": 0}
        found[key]["quoteCount"] += 1
    return {"matches": list(found.values()), "count": len(found)}


@app.delete("/matches/{id}")
def delete_match(id: str):
    with LOCK:
        records = load_quotes()
        remaining = {key: quote for key, quote in records.items() if match_id(quote) != id}
        if len(remaining) == len(records):
            raise HTTPException(status_code=404, detail="Match not found")
        save_quotes(remaining)
    return {"removed": len(records) - len(remaining), "count": len(remaining)}


@app.post("/scrape")
def scrape(url: str = Query(...)):
    raise HTTPException(
        status_code=501,
        detail="The supplied archive does not contain a working normalized odds scraper. Submit quotes to POST /quotes.",
    )

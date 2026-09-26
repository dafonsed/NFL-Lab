"""Run the local EV quote API. It is never bound to a public interface."""

import uvicorn

from api_server import app


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)

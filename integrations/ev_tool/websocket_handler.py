"""WebSocket Handler - Live odds streaming from bookmakers."""
import websockets
import json
import asyncio

class WebSocketHandler:
    """Handle live WebSocket connections for real-time odds updates."""

    def __init__(self):
        self.ws_connections = {}
        self.odds_updates = []

    async def connect(self, url):
        """Connect to bookmaker WebSocket endpoint."""
        try:
            ws = await websockets.connect(url)
            self.ws_connections[url] = {
                'connection': ws,
                'heartbeat': asyncio.create_task(self.heartbeat(ws))
            }
            return ws
        except Exception as e:
            print(f"WebSocket connection failed: {e}")
            return None

    async def heartbeat(self, ws):
        """Maintain WebSocket connection with periodic pings."""
        try:
            while True:
                await asyncio.sleep(30)  # Keep-alive ping every 30s
                await ws.ping()
        except:
            pass

    async def receive_odds(self, ws):
        """Receive and parse incoming odds updates."""
        try:
            while True:
                message = await asyncio.wait_for(ws.recv(), timeout=5)
                odds_data = json.loads(message) if isinstance(message, str) else message

                # Store the update
                self.odds_updates.append({
                    'timestamp': datetime.now().isoformat(),
                    'data': odds_data
                })

                # Yield to event loop for other tasks
                await asyncio.sleep(0.1)
        except websockets.exceptions.ConnectionClosed:
            print("WebSocket connection closed")
        except Exception as e:
            print(f"Error receiving odds: {e}")

    def get_latest_odds(self, url):
        """Get most recent odds update for a connection."""
        if url in self.ws_connections:
            return self.odds_updates[-1]['data'] if self.odds_updates else None
        return None

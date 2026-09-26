"""Pinnacle odds scraper for EV tool API using WebSocket"""
import websockets
import asyncio
import json

async def get_pinnacle_live_odds(match_id, api_token):
    """Get live odds from Pinnacle via WebSocket"""

    ws_url = f"wss://api.pinnacle.com/v1/sportsbook/match-events/stream?token={api_token}"

    try:
        async with websockets.connect(ws_url) as ws:
            # Receive first message to establish connection
            await ws.recv()

            while True:
                message = await asyncio.wait_for(ws.recv(), timeout=5.0)
                data = json.loads(message)

                if 'odds' in data:
                    odds_snapshot = data['odds']
                    match_info = data.get('match', {})

                    return {
                        'match_id': match_id,
                        'snapshot_time': message.timestamp(),
                        'odds': odds_snapshot,
                        'home_odds': calculate_decimal_odds(odds_snapshot.get('home')),
                        'away_odds': calculate_decimal_odds(odds_snapshot.get('away'))
                    }

    except Exception as e:
        print(f"Pinnacle WebSocket error: {e}")
        return None

def calculate_decimal_odds(american_odds):
    """Convert American odds to decimal"""
    if american_odds > 0:
        return (american_odds / 100) + 1
    else:
        return (100 / abs(american_odds)) + 1

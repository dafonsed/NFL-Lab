"""Odds Parser - Extract odds from HTML, JSON, and WebSocket streams."""
import re
from bs4 import BeautifulSoup

class OddsParser:
    """Parse odds from various formats."""

    def __init__(self):
        self.odds_format = 'decimal'  # decimal, american, fraction

    def parse_html(self, html_content):
        """Extract odds from HTML source."""
        soup = BeautifulSoup(html_content, 'html.parser')

        # Try multiple selectors for different bookmakers
        selectors = [
            '.odd', '.odds', '.decimal-odds', '[class*="odd"]',
            '[class*="odds"]', 'span[class*="odd"]'
        ]

        decimal_odds = []

        for selector in selectors:
            try:
                elements = soup.select(selector)
                for element in elements:
                    odds_text = element.get_text(strip=True)
                    try:
                        decimal_odds.append(float(odds_text))
                    except ValueError:
                        continue
            except Exception as e:
                continue

        return decimal_odds

    def parse_json(self, json_data):
        """Extract odds from JSON structure."""
        if isinstance(json_data, dict):
            odds = []

            # Look for common JSON structures
            for key in ['odds', 'lines', 'markets']:
                if key in json_data and isinstance(json_data[key], list):
                    for market in json_data[key]:
                        for line_key in ['home', 'away', '1', '2']:
                            if line_key in market:
                                try:
                                    odds.append(float(market[line_key]))
                                except (ValueError, TypeError):
                                    continue
            return odds

        return []

    def parse_websocket(self, message):
        """Parse WebSocket odds update messages."""
        try:
            data = json.loads(message) if isinstance(message, str) else message

            # Extract odds from structured WebSocket message
            if 'markets' in data and 'outcomes' in data['markets'][0]:
                odds = []
                for market in data['markets']:
                    for outcome in market.get('outcomes', []):
                        try:
                            odds.append(float(outcome.get('decimal_odds', outcome.get('odds', ''))))
                        except (ValueError, TypeError):
                            continue
            return odds
        except Exception as e:
            return []

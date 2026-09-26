"""Configuration settings for EV Tool API."""

# Proxy pool (add your residential proxy credentials here)
PROXY_POOL = [
    'http://proxy1.residential.com:8080',
    'http://proxy2.residential.com:8080'
]

# Random delay range between requests (seconds)
REQUEST_DELAY_MIN = 1.5
REQUEST_DELAY_MAX = 8.0

# Bookmaker URLs to monitor
BOOKMAKER_URLS = {
    'bet365': 'https://bet365.com/sports',
    'pinnacle': 'https://api.pinnacledirect.com/v1/sportsbook',
}

# WebSocket endpoints for live odds (if available)
WEBSOCKET_ENDPOINTS = {}

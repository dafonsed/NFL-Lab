"""Bet365 odds scraper for EV tool API"""
from playwright.sync_api import sync_playwright
import time
import random

def scrape_bet365(match_url, proxy=None):
    """Scrape Bet365 odds for a specific match"""

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
        )

        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )

        page = context.new_page()

        if proxy:
            page.set_extra_http_headers({'Proxy': proxy})

        # Navigate to match page
        page.goto(match_url)

        # Wait for odds to load with human-like delay
        time.sleep(random.uniform(3, 8))

        # Optional: Simulate mouse movements
        page.mouse.move(100, 100)
        page.mouse.down()
        page.mouse.move(200, 150)
        page.mouse.up()

        # Extract odds from DOM
        odds_html = page.content()

        browser.close()

        return parse_bet365_odds(odds_html, match_url)

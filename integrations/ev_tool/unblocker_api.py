"""Unblocker API - Anti-bot bypass for Cloudflare/Akamai/DataDome."""
import requests
from curl_cffi import requests as curl_requests

class UnblockerAPI:
    """Use Scrapfly or curl_cffi to bypass anti-bot protections."""

    def __init__(self, scrapfly_api_key=None):
        self.scrapfly_api_key = scrapfly_api_key

    def scrape_with_scrapfly(self, url):
        """Use Scrapfly Unblocker API to bypass all anti-bot vendors."""
        if not self.scrapfly_api_key:
            return self._fallback_curl_cffi(url)

        try:
            response = requests.post(
                'https://api.scrapfly.com/v1/unblocker',
                json={
                    'url': url,
                    'mode': 'auto'  # auto-detects anti-bot vendor
                },
                headers={'X-API-Key': self.scrapfly_api_key},
                timeout=30
            )

            if response.status_code == 200:
                return response.json()['content']
            return None
        except Exception as e:
            print(f"Scrapify failed, using fallback: {e}")
            return self._fallback_curl_cffi(url)

    def _fallback_curl_cffi(self, url):
        """Fallback to curl_cffi for Cloudflare v2 bypass."""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
        }

        try:
            response = curl_requests.get(
                url,
                headers=headers,
                impersonate='chrome120',  # Fake Chrome 120 fingerprint
                timeout=30
            )

            if response.status_code == 200:
                return response.text
            return None
        except Exception as e:
            print(f"Curl cffi failed: {e}")
            return None

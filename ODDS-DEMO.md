# Odds Screen demo mode

The Odds Screen stays populated throughout development. `ODDS_DEMO_ENABLED` in `public/odds-demo.js` defaults to `true`; there is no timer, browser preference or automatic expiry that disables it.

The fixture supplies 80 simulated games across NFL, MLB, NBA, WNBA, NHL and soccer. It includes player props, alternate lines, moneylines, spreads, totals, 11 sportsbook columns and simulated price history. Rosters and matchups are illustrative, not a current schedule or roster feed. Dates roll forward when the page loads on a new day.

Demo records are generated in memory. They are not written to local storage, exported as personal records, or added to the bet tracker. Saved manual prices remain intact and appear alongside the demo. Reloads, empty storage and removing old optional examples cannot empty the demo slate.

For release, explicitly set `ODDS_DEMO_ENABLED = false`, connect and verify the production feed, then rebuild the shared preview/deployment. Disabling the flag hides generated fixtures and old optional examples from the Odds Screen; it does not delete saved user data. Do not disable it merely as part of a design update.

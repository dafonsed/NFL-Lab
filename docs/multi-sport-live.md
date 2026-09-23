# NBA, WNBA and MLB live odds and props

The game-odds panel now includes independent estimated fair odds, push-aware comparisons and numeric explanations. See the [live game model](live-game-model.md) for its scoring distributions, assumptions and validation. The player projection methods below remain separate.

Pages: `/nba/live`, `/wnba/live`, `/mlb/live`. APIs: `/api/nba/live`, `/api/wnba/live`, `/api/mlb/live`, with optional `date=YYYY-MM-DD` (Eastern) and `game=ID`. Invalid dates and game IDs are rejected before source access. Games must belong to the selected slate; MLB doubleheaders retain separate official IDs.

## Sources and refresh

ESPN scoreboard/summary feeds supply basketball scores, named player statistics, clock, play timestamps and odds. MLB's official schedule and live game feed supply baseball scores, innings, pitches, lineup membership and statistics. Baseball odds join an ESPN event only when both team names and start time (within 45 minutes) match exactly one event.

Live fetches coalesce concurrent requests, cache for 15 seconds, and expire after 45 seconds including the upstream HTTP Age header. Failures retain the last successful data, timestamp and hash with a stale marker. A quiet play feed pauses projections after three minutes (halftime gets a longer allowance). Historical inputs have separate receipts and caches. Auto-refresh runs only while the page is visible; returning to the page triggers a refresh. Today follows Eastern date rollover.

## Odds and line comparisons

The automatic odds panel displays moneyline, spread/run line and total American prices from the provider's explicit `.live` quote nodes. It never falls back to `.close` or `.open` during a game. Pregame and completed games show separately labeled pregame/archived prices. Missing or explicitly suspended/unavailable selections are omitted. Fetch time is a retrieval receipt, not an asserted bookmaker update time. Public prices and availability can differ from the user's jurisdiction and sportsbook.

Player lines follow the NFL live workflow: enter and confirm the current full-game total. Confirmation expires when the game/model snapshot changes or after 60 seconds. Stale data, paused players and withheld projections cannot produce comparisons. A projection gap is not a betting edge or a win probability. No wagers are placed.

## Basketball model

- NBA regulation is 48 minutes; WNBA is 40. Clock parsing supports `MM:SS`, fractional seconds and `0.0`. Halftime is half of regulation. Overtime and the final two minutes are withheld.
- Historical role is mean minutes in the last five completed appearances with the current team divided by regulation duration. Live role is minutes played divided by elapsed regulation minutes, bounded to 0–1.
- Live role weight is `min(0.5, elapsed / duration × 0.5)`. The remaining clock times the blended role gives future minutes. Team totals are capped at five times remaining game minutes.
- Production rate is the ratio of total production to total minutes over up to 15 earlier appearances. Live rate weight is `minutes / (minutes + 100)`. The observed rate is bounded to 0–2 times history. At least five appearances with complete market statistics are required.
- Every recorded statistic is retained: `recorded + remaining minutes × blended rate`. All fields are required for combined markets. No missing statistics become zero. Reported unavailability, stale injury reports, ejections and six fouls pause projections.

## Baseball model

Only earlier, completed regular-season/postseason games contribute to history. Selected-day games are excluded, including an earlier doubleheader game, to avoid ambiguous ordering. The history window covers 120 days, extended to the previous September early in a season. No cumulative season totals are used.

Batters require five earlier appearances with complete statistics, with at most 30 used. Remaining regulation batting outs account for inning, half and current outs. Future plate appearances are `remaining outs × 1.43 / 9`; the league baseline and equal lineup share are disclosed. The batter must still be in the confirmed batting order. Historical production per plate appearance is blended with the bounded live rate using `PA / (PA + 50)`.

Pitchers require three earlier starts, with at most ten used, and must be a confirmed starter still pitching. The average last-five-start pitch count, bounded to 40–110, supplies a pitch budget. Subtract pitches already thrown and divide by historical pitches per batter; cap by remaining opponent outs converted through historical outs per batter. Live rate weight is `BF / (BF + 100)`. Removed pitchers and relievers are withheld, since later scoring changes and inherited runners can affect their final totals.

Total bases and singles use official component counts. Pitching innings use thirds (6.1 = 19 outs). Extra innings and delayed/suspended games are withheld. Neither bullpen changes, exact batting-order timing nor an unneeded bottom inning is forecast precisely.

## Limits and checks

These are transparent, experimental point estimates, not calibrated probabilities. They retain observed statistics but cannot know future rotations, injury news, managerial decisions, overtime or extra innings. Full-game sportsbook settlement can include additional periods that the model excludes.

`test/live-sports.test.mjs` verifies clock and inning arithmetic, historical exclusion, fresh/stale behavior, source identity, projection equations, injury/removal guards, live-only odds selection, doubleheader matching and no-games/invalid-input behavior. Deployment tests cover all new pages, assets and API routes. The pregame models and NFL live implementation remain separate.

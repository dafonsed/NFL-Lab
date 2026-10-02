# Player-props audit for the quote API (2 Oct 2026)

## Problem
The DFS tool can only compare a PrizePicks line with sportsbooks the API sends **at that exact
player, stat and line**, and can only compute a fair (no-vig) probability from a book that sends
**both Over and Under** at that line. Today almost every PrizePicks line has one book or none.

Example: Luther Burden III, Receptions 4.5. Only FanDuel sends it (Over +106 / Under −140).
Fanatics sends Longest Reception milestones and TD scorer props for him; DraftKings sends one
Receiving Yards rung; no other book sends anything for him.

## What the feed sends now (live check)
| Book | Player props | Usable for fair probability |
|---|---|---|
| FanDuel | Main Over/Under on .5 lines (842 pairs), plus "N+" milestones | Yes (the only one) |
| Fanatics | Over-only ladders at whole numbers (Receiving/Rushing/Passing Yards, ALT Receptions), Longest Reception "15+" milestones, TD scorer "yes" only | No: no Under |
| DraftKings | ~310 Over-only rungs at whole numbers (Receiving/Rushing/Passing Yards, FG Made, Sacks) | No: no Under |
| BetMGM, Caesars, bet365, Pinnacle, Hard Rock, BetRivers, Bally Bet, Desert Diamond, theScore, ProphetX, Novig | None (game lines only) | No |

## What to add
1. **Main player-prop Over/Under markets with both sides** for DraftKings, Fanatics, BetMGM,
   Caesars, bet365, Pinnacle (most important: the sharpest book), Hard Rock, BetRivers, Bally
   Bet, Desert Diamond, theScore, ProphetX and Novig.
2. **Alternate lines too**, each line with both sides when the book offers both.
3. **Lines exactly as the book shows them** (62.5, not 63). Don't round, and don't build an
   Under from an Over (a pair summing to ~100% implied is rejected).

## Record format (one record per side per line)
```json
{ "id": "…", "book": "DraftKings", "sport": "nfl", "league": "NFL",
  "event": "New York Jets @ Chicago Bears", "eventId": "<book's event id>",
  "startTime": "2026-10-04T17:00:00Z",
  "player": "Luther Burden III", "propMarket": "Receptions",
  "line": 4.5, "side": "under", "odds": -135,
  "ts": "2026-10-02T21:25:37Z", "type": "prop", "live": false,
  "betUrl": "<book link with the book's event, market and selection ids>" }
```
- `sport`/`league`: the real league (NFL vs NCAAF vs soccer). Today some NHL and soccer games
  are labeled `nfl`.
- `startTime` on every record (only ~11% of sportsbook quotes have it now).
- `propMarket`: the stat alone ("Receptions", "Receiving Yards"), not "Player - Stat".

## Priority stats (most PrizePicks lines)
- **NFL / college:** Receiving Yards, Rush Yards, Receptions, Pass Yards, Longest Reception,
  Anytime TD, Rush Attempts, Longest Rush, Rush+Rec Yds, Pass+Rush Yds, Pass Attempts,
  Pass Completions, Rec Targets, Pass TDs, Interceptions, FG Made
- **NBA / WNBA:** Points, Rebounds, Assists, Pts+Rebs+Asts, 3-PT Made
- **MLB:** Hits, Total Bases, Pitcher Strikeouts, Hits+Runs+RBIs, Hits Allowed
- **NHL:** Shots On Goal, Points, Goals, Assists, Goalie Saves
- **Soccer:** Shots, Shots On Target

## How to check it worked
- For each book, most prop lines have **both** an Over and an Under record at the same line.
- Over + Under implied probability adds up to roughly **102–112%** (never ~100%).
- PrizePicks lines with 2+ sportsbooks at the exact line goes up from **361 of ~33,000**.

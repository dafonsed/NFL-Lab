# API audit checklist (4 Oct 2026)

One list: what to check in the apps yourself (Part A), then what the API should change (Part B),
most important first. Every item says what the site sees today and how to verify the fix. Verify
through the site's own proxy so you see exactly what the site gets:

```bash
curl -s https://nfl-lab-xi.vercel.app/api/ev/quotes -o quotes.json
curl -s https://nfl-lab-xi.vercel.app/api/ev/site/dfs/props -o props.json
curl -s https://nfl-lab-xi.vercel.app/api/ev/site/status
```

"Site handles it" means the site already works around the problem; fixing it at the source brings
the dropped data back.

---

## Part A: check in the apps (only you can answer these)

- [ ] **A1. Underdog per-pick payouts.** Open **Justin Herbert, Higher 0.5 Passing TDs** in Underdog
      (also Calvin Ridley Lower 1.5 Receptions). Does the pick show a multiplier other than 1x?
      - Why: the API sends `payout_multiplier: 1` on every Underdog line. At 1x, 181 lopsided lines look
        like +EV (Herbert Over 0.5 TDs at a 67.6% fair chance from FanDuel -255/+188 and DraftKings
        -251/+193). If Underdog shows e.g. 0.6x there, those edges are fake until B3 is done.
- [ ] **A2. PrizePicks payout format in your state.** When you build a 2-pick standard entry, is the
      payout a fixed 3x, or does it depend on a pool of other players ("Pick'Em Arena")?
      - Why: a third-party guide says PrizePicks moved US pick'em to a peer-to-peer pool in Aug 2025.
        The DFS board uses fixed tables from `/site/dfs/payouts` (2-pick 3x ... 6-pick 37.5x). If
        payouts are pool-based, every DFS EV on the site is an approximation.
- [ ] **A3. PrizePicks goblin/demon payouts.** Put two goblins of the same stat type in one entry, one
      a little below the standard line and one far below. Do they change the payout by different
      amounts? (You already confirmed they aren't static; this pins down the number B2 must send.)

---

## Part B: API fixes, in priority order

### B1. One consistent server answering (blocks everything)
- **Now:** calls seconds apart get different data. `/quotes` alternated 503 / 200 (17,068 records,
  13 books) / 503 / 503 / 200 (8,093, 14 books) / 200 (6,100, 4 books); `/site/health` went 503, 404,
  200, 200, 404; `/site/status` said Fanatics idle while `/quotes` returned 8,359 Fanatics records.
  Looks like more than one process (or an old version) on the API's address, each with its own data.
- **Fix:** one process, or several that share one data store; stop any old version still running.
- **Verify:** hit `/api/ev/site/health` 10 times: always 200. `/quotes` record count steady across
  calls a few seconds apart.

### B2. PrizePicks: collector up, real goblin/demon multipliers
- **Now:** `prizepicks` collector shows `error`, 0 props. Before that, every goblin carried exactly
  0.7 and every demon exactly 1.55 (4,186 and 12,722 lines), whatever the line. The site ignores a
  value nearly every goblin or demon shares, so those lines get no EV.
- **Fix:** collector running; `payout_multiplier` set to each goblin/demon line's own value (A3).
  `probability` is 0.6667 on every PrizePicks row (the site ignores it; drop it or make it real).
- **Verify:** in `props.json`, goblins/demons show many different `payout_multiplier` values.

### B3. Underdog: per-pick multipliers, game, start time, sport
- **Now:** 9,612 lines arrive (good), but every one has `payout_multiplier: 1`, `line_diff: null`,
  `standard_line: null`, `event: ""`, `startTime: ""`, and NFL players are sport `other` (no record
  says `nfl`). The site now fills the game from the sportsbook game it prices from (site handles the
  missing game for priced lines), but the payout it can't know.
- **Fix:** send Underdog's per-pick multiplier (A1), the event ("Away @ Home"), the start time (ISO)
  and the real sport.
- **Verify:** Herbert Higher 0.5 Pass TDs has the multiplier the app shows; no `other` for NFL players.

### B4. Fanatics props
- **ALT ladders carry other bets' prices.** Josh Allen "ALT Passing Touchdowns" Over 2.0 (2+ TDs =
  Over 1.5) at **+114** while FanDuel -164, DraftKings -167, Pinnacle -152 (app: -170). 13 of 24
  checkable ALT prices were 12+ points off every other book (other books: about 1 in 400).
  Site handles it: drops Fanatics ALT ladders while they fail that often.
- **Player props are one-sided:** 0 of 882 Fanatics prop lines have both Over and Under, so none can
  be devigged or used as a fair-price reference.
- **Props under the wrong game, with mixed players:** "Isaiah Likely" receiving-yards ladder under
  Jets @ Bears with 40+ at +900 but 100+ at +400 (two players in one ladder). Site handles it: drops them.
- **Listings under the wrong game:** an Akita Northern Happinets spread under "Leicester City (W) @
  Sunderland (W)", a WNBA spread under Braves @ Dodgers, events named "Over 3.0" / "Over 10.0"
  holding a Padres spread. Site handles it: skips them (about 680 records per snapshot).
- **Fix:** map each ALT rung to its own player and line; send both sides where Fanatics has them;
  take the event from the market's own game.
- **Verify:** Josh Allen 2+ passing TDs at Fanatics matches the app; Fanatics paired O/U count > 0.

### B5. Other collectors
- `betr` and `dk_fantasy`: `error`. `sleeper`: `ok` with 0 items (it used to send roster rows: NBA
  players under tennis matches, line 0; those are gone, which is right). `draftkings` main lines,
  `caesars`, `bet365`, `betmgm`, `thescore`: mostly idle.
- **Verify:** `/api/ev/site/status` shows `ok` with items for each.

### B6. Names and ids that keep the same bet apart
- **Pinnacle player names:** "Davante Adams Total"; the stat inside the player ("Lamar Jackson Total
  Touchdown Passes", "Jason Myers Total Field" + "Goals"); some spellings differ from every other book
  ("Jeremiah Love" / "Jeremiyah Love"). Site handles it.
- **No shared game id:** one game arrives as "San Diego Padres (R Ray) @ Milwaukee Brewers
  (J Misiorowski)", "SD Padres @ MIL Brewers", "San Diego Padres @ Milwaukee Brewers" and "SD @ MIL"
  (Novig); college with and without mascots; tennis "Jacquet, Kyrian". Site handles it by team names
  and start time; a shared `event_id` per real game would make it exact.
- **Part-game stats named differently:** "Rec Yards 1Q" / "Receiving Yards 1st Quarter" /
  "1st Half Receiving Yds", and props carry no `period`. Site handles it.
- **PrizePicks 1H/1Q lines under the full-game stat:** Marcus Mariota "Pass Yards" at 211.5, 98.5
  and 40.5 with nothing saying which is which. Site handles it by comparing to the books' line;
  sending the period would make it exact.

### B7. Sports and event labels
- Major-league games under another sport: FanDuel's Yankees @ Rays as `ncaaf`, Fanatics' Braves @
  Dodgers as `nba`, NFL games as `mma`/`mlb`/`soccer`/`other`, Memphis @ Charlotte (college) as `nfl`,
  Liberty @ Dream (WNBA) as `nba`. Onyx sends a place as the sport ("tokyo,-japan"); FanDuel sends
  `unknown` for some college games. Site handles it when another book lists the game.

### B8. Records that aren't what their type says
- **Exchanges without an outcome:** every Polymarket, Kalshi and ProphetX record has `side: "home"`
  and no `selection_name` (ProphetX "Zverev" +526 was the other player's price). Skipped by the site.
  Send `selection_name`.
- **Betr Picks team "moneylines"** (a live Blues moneyline at +1892) in `/quotes` as sportsbook
  prices; their `startTime` is epoch milliseconds text. Site skips them and reads epoch times.
- **Onyx:** game totals as two "Team Over 60.5 total" props (which is the Over isn't said; skipped);
  spreads as "Team Over -5.5 spread" props (site converts them).

### B9. Fields and endpoints
- `fresh` turns false about a minute after a scrape (FanDuel props 62 seconds old). The site doesn't
  use it; prices expire 15 minutes after `ts` (pregame). Make it mean "still offered", or drop it.
- `/site/odds/history` returns nothing after a restart and nothing for DraftKings, FanDuel, Fanatics
  ids; `/site/odds/closing` equals the current price.
- `/ev` and `fair_prob` are not used by the site (it devigs raw two-sided odds itself). The `/ev`
  output had the problems above (raw one-sided implied chance as "fair", goblins/demons at 3x).

---

Detailed history of every finding: `docs/api-data-audit.md`.

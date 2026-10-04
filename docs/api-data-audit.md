# Quote API data problems (audit of 3 Oct 2026)

Every tool on the site was audited against a full snapshot of the API (GET /quotes, /site/dfs/props,
/site/dfs/payouts, /site/status, /site/prediction/contracts, /site/odds/closing, /site/odds/history),
taken 2026-10-03 06:17 UTC. The site now detects and drops or labels each problem below, so none of
them shows as a wrong price, but every dropped record is data the site can't use. Fixing them at the
source brings that data back.

## 0. API 2.0.0 (checked 4 Oct 2026, 03:00–03:20 UTC)
1. **Instances disagree.** Repeated calls through the site's proxy got different answers within
   seconds: /quotes 503, 200 (17,068 records, 13 books), 503, 503, 200 (8,093, 14 books), then 6,100
   with four books; /site/health 503, 404, 200, 200, 404; /site/status reported 8,010 total quotes with
   Fanatics idle while /quotes returned 8,359 Fanatics records. More than one process (or an old
   version) answers on the API's address, each with its own data. The site retries a failed request
   once and holds the fuller snapshot for up to 10 minutes, but every visitor still sees whichever
   instance answered.
2. **DFS:** /site/dfs/props returns `[]` (with and without `app`/`sport`) and /site/status shows
   prizepicks, dk_pick6, sleeper, betr and dabble idle with 0 items; no PrizePicks records are in /quotes.
3. **Betr Picks team "moneylines"** (a live Blues moneyline at +1892) arrive as sportsbook prices; the
   site skips game lines from pick'em apps. Their `startTime` is epoch milliseconds as text
   ("1791075600000"); every other book sends ISO times.
4. **Onyx sends a place as the sport** ("tokyo,-japan", "beijing,-china") for tennis; FanDuel sends
   `unknown` for some college games.
5. **Still open from 3 Oct:** Polymarket, Kalshi and ProphetX send no `selection_name` (all skipped);
   Fanatics files listings under other games (an Akita Northern Happinets spread under "Leicester City
   (W) @ Sunderland (W)", a WNBA spread under Braves @ Dodgers) and events named "Over 10.0"; Pinnacle
   still sends players as "Name Total".
6. New fields `fresh` and `age_seconds` are read: a price with `fresh: false` is dropped.

## 1. Sides and selections
1. **Exchanges send no outcome.** All ProphetX (81), Kalshi (46) and Polymarket (33) records have
   `side: "home"` and no `selection_name`. The price is often the other participant's: ProphetX
   "Zverev" +526 while every book has Zverev -1250 / Shang +700. Send `selection_name` (the team or
   player the price is for) on every record.
2. **Fanatics combos and other markets sent as moneylines.** "Lehecka, Jiri & Over 22.5" (+190),
   race-to-25/50/75 lines (`line` 25/50/75), "Either team 1-5", "(9-12)", correct scores, and
   yes/no props sent as `[Team, "No"]` moneylines (Lions -150 / "No" +280). Send each as its own
   market type.
3. **Fanatics 1X2 draw sent as "Tie"** and Kambi (BetRivers, Desert Diamond, Bally) 1X2 missing the
   "1" outcome (1 record vs 801 "2"), with "2" tagged side `home` and "X" side `away`. Send all three
   outcomes with consistent sides.
4. **theScore sends no `selection_name`** on any record (sides can't be verified).
5. **Novig sends team moneylines as player props** ("IOWA Over 0 moneyline").

## 2. Events and games
1. **Records filed under another game's name.** 73 of 124 Fanatics game listings carry another
   game's name: Memphis prices under "Denver Broncos @ San Francisco 49ers", Navy under "Falcons @
   Saints", Michigan under "Dolphins @ Vikings", the Monday-night game under "Jets @ Bears", Rhode
   Island and Brown under "Rams @ Eagles", Premier League matches under "Notre Dame @ North Carolina".
   ProphetX and Kalshi have the same problem. Bet links on those records open the other game.
2. **Start times disagree.** FanDuel stamps some games with the scrape day at 16:00 UTC (MNF Falcons
   @ Saints on 10-03 instead of 10-06; NBA games on 10-03 instead of 10-20) and adds a minute to others
   (17:01). Fanatics duplicates games with starts a day or more off. One Liberty-Dream WNBA game was
   listed at 1 PM ET (PrizePicks), 6 PM ET (Fanatics) and 8 PM ET (Pinnacle).
3. **Naming.** Fanatics prop events use "Home v Away" while everything else uses "Away @ Home";
   FanDuel puts the player in the market name ("Laquon Treadwell - Total Receptions").
4. **Record ids reused across selections.** 2,852 Fanatics ids changed event, sport, odds or side
   between two snapshots 9 minutes apart; a ProphetX id moved from a tennis match to a J-League game.
5. **No shared game or player ids** (cross-book check of the 15:00 UTC snapshot). `eventId` is each
   book's own game name lowercased, so one game arrives under several ids: "San Diego Padres (R Ray) @
   Milwaukee Brewers (J Misiorowski)" (FanDuel, Fanatics), "SD Padres @ MIL Brewers" (BetRivers, Desert
   Diamond, Bally), "San Diego Padres @ Milwaukee Brewers" (the rest), "SD @ MIL" (Novig); college games
   with and without mascots ("Vanderbilt Commodores @ Georgia Bulldogs" / "Vanderbilt @ Georgia");
   tennis as "Jacquet, Kyrian" (Fanatics) and "Kyrian Jacquet". The site now matches these by team
   names and start time; a shared game id from the API would make that exact.
6. **Pinnacle player names carry "Total" and sometimes the stat.** 471 of 623 Pinnacle prop players
   are sent as "Davante Adams Total"; others as "Lamar Jackson Total Touchdown Passes" (also sent as
   the stat), "Jason Myers Total Field" + "Goals", "Victor Wembanyama Total Pts & Rebs & Asts". Pinnacle
   spells some players differently from every other book ("Jeremiah Love" / "Jeremiyah Love", "Andrew"
   / "Andres Borregales"). Before the site handled this, none of Pinnacle's 1,100 prop lines matched
   another book's.
7. **Props filed under another game.** Fanatics sent the Giants' Isaiah Likely and Jameis Winston under
   "Jets @ Bears", and Yankees hitters (Trent Grisham, Andrew Rasmussen) under an `mlb` "Green Bay
   Packers @ Tampa Bay Buccaneers". Fanatics also sends events named "Over 3.0" / "Over 7.5" holding a
   game's spreads and totals ("San Diego Padres +2.5"); the site drops those.
8. **Part-game stats named differently**: DraftKings "Rec Yards 1Q", Fanatics "Receiving Yards 1st
   Quarter", FanDuel "1st Half Receiving Yds". Props carry no `period`.

## 3. Sport and league labels
- J-League and A-League tagged `epl`; USL tagged `nwsl`; Swedish, Finnish and KHL hockey tagged
  `nhl`; Czech, Kosovo and Finnish basketball tagged `nba`; Welsh and Zambian soccer tagged `nfl`;
  table tennis tagged `soccer`; KBO tagged `mlb` or `tennis`; badminton tagged `mma`; esports, golf,
  NASCAR and F1 tagged `other`; some college games with no sport.
- PrizePicks events for leagues without matchups are the league code ("CS2", "PGA", "NBASZN").
- Major-league games under another sport: FanDuel's Yankees @ Rays as `ncaaf` (264 records),
  Fanatics' Braves @ Dodgers as `nba` (154), NFL games as `mma`, `mlb`, `ncaaf`, `soccer` and `other`;
  Fanatics' Memphis @ Charlotte (college) as `nfl`; Fanatics' Liberty @ Dream (WNBA) as `nba` and
  Onyx's as `ncaaf`; Novig's Florida @ Missouri as `nhl` and Indiana @ Rutgers as `nfl`. Where other
  books list the same game, the site files it under their sport; a game only one book lists keeps the
  feed's label.

## 4. Ladders and lines
1. **Fanatics spread and total ladders mix markets.** 19 of 22 spread and 47 of 53 total ladders
   aren't monotonic (Colts -3.5 at +165 between -3 at -145 and -4 at -110): 1st-half, quarter and team
   lines are mixed into the full-game ladder with `period: "full"`. They are also one-sided (2,889
   Unders vs 225 Overs). The raw spread `line` has the opposite sign to `selection_name`.
2. **Fanatics alternate prop ladders mix players.** "Brenton Strange ALT Receptions 4+" at +650 while
   DraftKings has him at -101 for Over 3.5.
3. **Lines kept after a book moves them.** DraftKings moved Darius Slayton Receiving Yards 13.5 to 14.5
   and the 13.5 prices stayed in the feed; PrizePicks lines it pulled stay too. Remove records a book
   no longer offers, or flag them.

## 5. PrizePicks and DFS apps
1. **1st-half and 1st-quarter lines arrive under the full-game stat.** Marcus Mariota "Pass Yards"
   comes as 211.5, 98.5 and 40.5 (full game, 1H, 1Q) with nothing saying which is which; 1,833 NFL
   lines. Send the period (or PrizePicks' own stat name, "1H Pass Yards").
2. **Player missing.** 2,376 NFL and college rows have the team code as the player ("WAS"); esports
   rows have the team ("Legacy MAPS 1-2"); 28 season-long rows have "2026-2027 Season".
3. **Goblin and demon multipliers.** `payout_multiplier` is null (or a flat 0.7 / 1.55) on every
   goblin and demon line, so their payout can't be calculated.
4. **No other apps.** Betr, Underdog, DraftKings Pick6 (status "error"), Dabble and ParlayPlay return
   no lines, even with `?app=`, although /site/dfs/payouts lists them; Sleeper sends only roster rows
   (line 0) and FanDuel Fantasy only contest lobbies.
5. `probability` is 0.6667 on every PrizePicks row (the site ignores it).

## 6. Exchanges and prediction markets
1. **Novig prices don't form a market.** Prop pairs add up to 63-96% implied (Over +257 and Under
   +186), so they can't both be takeable. Novig sends no liquidity.
2. **ProphetX "liquidity" equals the contract's traded volume**; Kalshi sends liquidity 0 on most
   records; Kalshi multi-leg parlays ("yes Texas A&M, yes BYU, ...") are sent as moneylines.
3. **No commission fields** from any exchange.
4. **/site/prediction/contracts**: ProphetX sends up to 113 unlabeled contracts per event (900 rows,
   no outcome names); 87 books are crossed (bid above ask); ids change every scrape; `platform`
   filtering is case-sensitive.

## 7. Endpoints
1. **/site/odds/history** files several selections' prices under one id within the same scrape
   (BetMGM: -102, 175, 525 together), returns nothing for DraftKings, FanDuel, Fanatics, Novig and
   PrizePicks ids, and its 24-hour history resets when the API restarts.
2. **/site/odds/closing** only has `{id, closing_odds, ts}`, and every closing price equals the current
   one (rows for started games carry in-play prices).
3. **Partial snapshots during restarts.** /quotes went 9,564 → 20,670 → 48,332 → 51,307 records in
   about 70 seconds while /site/status showed collectors idle. Return 503 (or a flag) until a snapshot
   is complete.
4. **/site/status counts don't match /quotes** (Fanatics 35,367 items vs 12,003 records; Betr 578
   items vs none served) and reports "ok" when a run returns far fewer items than usual (Pinnacle
   props fell from about 1,450 to 78).
5. **Live prices arrive old.** All 47 live quotes were 58-200 seconds old when downloaded.

## 8. Coverage
- Pinnacle: 48 game-line quotes, no NFL or NBA, and some MMA markets at 7-18% hold.
- NFL main markets two-sided only at DraftKings and theScore; FanDuel totals are Under-only and it
  sends no moneylines.
- BetMGM: no start time on 24 of 43 records; no links for DraftKings, Pinnacle, bet365, Hard Rock,
  BetMGM or the exchanges; event-level links only (empty `market=`); BetRivers links always point to
  Arizona.

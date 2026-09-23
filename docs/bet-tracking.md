# Bet Tracker: selections and results

The tracker stores tickets in the existing `nfl-lab.personal-bets.v1` browser-storage record. Old tickets without structured legs load as manual tickets. No ticket, stake, odds or profit record is uploaded. The result service receives only the selected sport, league, game date and game ID. Exported CSV files include each leg, its last reading and source URL.

## Entering a ticket

Enter the ticket title, date placed, stake and combined ticket odds. Each leg separately records its game date, exact game ID (including doubleheaders), athlete/team ID, market, side and booked line. Changing the current market's sportsbook total cannot change the saved line. The dropdowns support the app's connected NFL, MLB, NBA, WNBA, NHL and soccer markets, plus full-game moneylines, spreads and totals. Manual selections support other markets and quarter lines. Soccer moneylines are three-way, including a draw. Connected soccer lines use regulation time; other connected full-game markets include overtime. Book-specific exceptions must be settled manually.

Pregame roster entries are selectable but do not establish participation. Player names identify a selection to the user; result joins use athlete and game IDs. Multiple legs on the same game share one result request. Up to three distinct game requests run concurrently, with a 30-second source cache and source-level concurrency limits.

The player picker filters by the chosen prop's role using reported positions and game stat categories: passing, rushing, receiving and kicking in football; hitters versus pitchers in baseball; skaters versus goalies in hockey; and goalkeepers for soccer saves. Basketball props remain available to all basketball positions. Recorded exceptions and two-way baseball roles remain eligible. A previously saved selection is retained explicitly even if it is no longer in the matching roster.

Choose **Quick Search** in the **Tracking** dropdown and type a player name. No matchup or prop selection is required first. Results cover the selected sport and date, accepting partial names and ignoring accents and punctuation. Picking a player fills the game and exact player ID, then presents only that player's eligible prop types. Enter the side and booked line next. Quick Search is the default for new connected legs; its selections use the same automatic result tracking as **Pick a game**. Existing entries retain their selected entry method. Searches run only after at least two letters are entered and use at most three concurrent game requests. Failed roster requests are disclosed as incomplete results; doubleheader selections remain separate.

## Source and result rules

For a player milestone, choose **Target type → At least (X+)** and enter your **Custom amount**, such as 25 for 25+ points or 2 for 2+ hits. Reaching the entered amount wins; it is not an Over bet and cannot push at that amount. **Exactly** wins only when the final statistic equals the custom amount. Both use nonnegative whole-number targets and work on singles and parlay legs. Over/Under still accepts your own whole- or half-point alternate line and pushes on equality. Saved tickets, editing and CSV exports preserve these distinctions.

- MLB: `https://statsapi.mlb.com/api/v1/schedule` for game selection and `https://statsapi.mlb.com/api/v1.1/game/{id}/feed/live` for score, status and box scores. Pitcher outs convert innings with baseball notation: 5.2 means 17 outs. Batting and pitching fields stay separate.
- Other connected sports: `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard`, `/summary?event={id}`, and pregame `/teams/{id}/roster` when available. Football fields remain attached to their statistical category, so defensive interceptions cannot become interceptions thrown.
- A live reading is progress, even if an over has passed its line. Only a completed game can establish hit/miss/push. A later official-stat correction updates the automatic result when checked again.
- A real reported zero can settle a leg; absent fields cannot. Missing participation, DNP, postponed/canceled/suspended games and ambiguous rules remain pending or flagged for review. Stale source responses do not create a final result. Network failures retain earlier readings with an explicit refresh warning and their original timestamps.
- Soccer extra-time or shootout games are flagged for manual review because full-game summary statistics may exceed regulation. Tied two-way moneylines outside soccer also require book-rule review.

## Ticket settlement and operation

One lost leg loses an automatically tracked ticket. All won legs win it at the entered combined odds. A single push returns stake; all refunded selections refund the ticket. Mixed wins and refunds require sportsbook confirmation, since the original parlay odds cannot establish a repriced payout. The user can override any leg result and can set the overall ticket result and actual total return. Manual cash-outs and ticket settlement survive refresh.

Refresh runs on page open, visibility return and the Refresh results button. While visible, unfinished legs and recently dated games are rechecked every minute. Polling pauses while editing so form entries are not replaced. The page must be open for periodic updates; reopening catches up. There is no unattended personal-bet scheduler or sportsbook-account connection.

Updates re-read local storage before writing, preserve tickets added in another tab, and reject stale edits. Corrupt or inaccessible storage is never silently overwritten. Clearing this site's storage removes the tickets; CSV export is the user's portable record.

// Content for the VisualOdds API reference (/odds-api): guide pages and one page per endpoint.
// Parameters and response shapes mirror the route handlers in server.mjs, lib/sports, lib/mlb,
// lib/source.mjs, lib/live-*.mjs and lib/ev-api-proxy.mjs. Keep them in sync when routes change.

const TODAY = 'YYYY-MM-DD';
const SPORTS = ['nba', 'wnba', 'nhl', 'soccer'];
const SOCCER_LEAGUES = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'usa.1', 'uefa.champions'];
const NFL_MARKETS = ['any_td', 'pass_yds', 'pass_tds', 'rush_yds', 'rush_attempts', 'rec', 'rec_yds', 'pass_attempts', 'pass_completions', 'pass_interceptions', 'rush_rec_yds'];
const MLB_MARKETS = ['hr', 'hits', 'k', 'tb', 'rbi', 'runs', 'hrr', 'sb', 'singles', 'doubles', 'bb', 'batter_k', 'outs', 'er', 'hits_allowed', 'walks_allowed'];

const ACCESS = {
  public: { label: 'Public', note: 'No sign-in needed. Still counts toward the rate limit.' },
  research: { label: 'Research plan', note: 'Needs a signed-in account on Basic or Premium (the research feature).' },
  ev: { label: 'Premium · EV feed', note: 'Needs a signed-in account on Premium (the EV feed feature).' },
  staff: { label: 'Staff only', note: 'Needs a staff account with data permission and a recent sign-in. Every call is audit-logged.' },
};

const sportParams = [
  { name: 'sport', type: 'string', required: true, values: SPORTS, example: 'nba', description: 'The league to read.' },
  { name: 'date', type: 'string', format: 'date', example: '', placeholder: TODAY, description: 'Slate date, `YYYY-MM-DD`. Defaults to today (America/Phoenix).' },
  { name: 'market', type: 'string', example: 'points', description: 'Stat market, e.g. `points`, `rebounds`, `assists`, `threes` (NBA/WNBA), `shots`, `goals`, `saves` (NHL/soccer). Defaults to the sport\'s first market.' },
  { name: 'league', type: 'string', values: SOCCER_LEAGUES, example: '', description: 'Soccer only. Defaults to `eng.1`.' },
  { name: 'game', type: 'string', example: '', description: 'An event ID (6–12 digits).' },
];

export const API_BASE_PATH = '/odds-api';

export const API_GROUPS = [
  { id: 'docs', label: 'Documentation' },
  { id: 'research', label: 'Research' },
  { id: 'live', label: 'Live games' },
  { id: 'ev', label: 'EV feed' },
  { id: 'system', label: 'System' },
];

export const API_PAGES = [
  // Guides
  {
    slug: '', group: 'docs', kind: 'guide', title: 'Getting started', nav: 'Getting started',
    lede: 'Welcome to the VisualOdds API: schedules, player research, live game context and sportsbook quotes as plain JSON over HTTPS.',
    sections: [
      { id: 'welcome', title: 'Welcome', body: ['Every tool in VisualOdds reads from the same JSON routes documented here. If you can load a page in the app, you can request the data behind it.', 'Responses carry their own source and freshness details (`source`, `fetchedAt`, `stale`, `warnings`) so your code can decide how to treat delayed or missing data.'] },
      { id: 'access', title: 'Access', body: ['Requests are authorized by your VisualOdds session today. Sign in, and the reference pages can send live requests for you with **Try it**.', 'Personal API keys for server-to-server use are on the way. When they launch, you will send the key in an `X-Api-Key` header; nothing else about the requests changes.'] },
      { id: 'base-url', title: 'Base URL', code: 'https://visualodds.com/api' },
      { id: 'onboarding', title: 'Recommended onboarding flow', body: ['Work through the API in this order; each step builds on the one before it.'], steps: [
        ['sport-catalog', 'Sport catalog', 'List the games, dates and markets for a sport. Everything else takes these IDs.'],
        ['research-board', 'Research board', 'Player research for one game: history, availability and model context.'],
        ['nfl-board', 'NFL board', 'The weekly NFL research board, by market.'],
        ['live-game', 'Live game', 'Live score, player projections and game model while a game is on.'],
        ['ev-quotes', 'EV quotes', 'Normalized sportsbook quotes that feed the EV workbench.'],
      ] },
      { id: 'first-request', title: 'Make your first request', body: ['Start with the health check. It is public, so it works without signing in.'], code: 'curl https://visualodds.com/api/health' },
    ],
  },
  {
    slug: 'authentication', group: 'docs', kind: 'guide', title: 'Authentication', nav: 'Authentication',
    lede: 'How requests are authorized, and which plan each route needs.',
    sections: [
      { id: 'sessions', title: 'Session authentication', body: ['Signed-in requests are authorized by the secure session cookie VisualOdds sets when you sign in. Browser requests from the same site send it automatically.', 'A signed-out request to a protected route returns `401` with `code: "SIGN_IN_REQUIRED"`.'] },
      { id: 'api-keys', title: 'API keys (coming soon)', body: ['Personal API keys will let your own servers call the API without a browser session. Keys will be sent in the `X-Api-Key` header and can be rotated from your account page.'], code: 'curl https://visualodds.com/api/sports/catalog?sport=nba \\\n  --header \'X-Api-Key: YOUR_API_KEY\'' },
      { id: 'plans', title: 'Access by plan', table: [['Route family', 'Access'], ['`/api/health`', 'Public'], ['`/api/sports/*`, `/api/board`, `/api/mlb/board`', 'Basic or Premium'], ['`/api/{sport}/live`', 'Basic or Premium'], ['`GET /api/ev/*`', 'Premium'], ['`POST` / `DELETE /api/ev/*`', 'Staff only']], body: ['A signed-in account without the right plan gets `403` with `code: "UPGRADE_REQUIRED"`.'] },
    ],
  },
  {
    slug: 'errors', group: 'docs', kind: 'guide', title: 'Responses & errors', nav: 'Responses & errors',
    lede: 'Every response is JSON. Errors share one shape and a stable `code` where one applies.',
    sections: [
      { id: 'shape', title: 'Error shape', code: '{\n  "error": "Sign in to continue.",\n  "code": "SIGN_IN_REQUIRED"\n}' },
      { id: 'status-codes', title: 'Status codes', table: [['Status', 'Meaning'], ['`200`', 'Success.'], ['`400`', 'A parameter is missing or invalid, e.g. an unknown `sport` or a malformed `date`.'], ['`401`', 'Sign in required (`SIGN_IN_REQUIRED`).'], ['`403`', 'Your plan does not include this route (`UPGRADE_REQUIRED`).'], ['`404`', 'Unknown route, or the requested game is not on that date.'], ['`405`', 'Method not allowed. Most routes are read-only (`GET`/`HEAD`).'], ['`429`', 'Rate limited (`RATE_LIMITED`). Wait for `Retry-After` seconds.'], ['`502` / `503`', 'An upstream source failed or is unreachable. Retry later when `retryable` is `true`.']] },
      { id: 'freshness', title: 'Freshness fields', body: ['Research and live responses include `fetchedAt` (when VisualOdds fetched the source), `stale` (`true` when the source could not be refreshed and cached data was returned) and `warnings[]` with plain-language notes. Show them to your users rather than hiding a stale number.'] },
    ],
  },
  {
    slug: 'rate-limits', group: 'docs', kind: 'guide', title: 'Rate limits & caching', nav: 'Rate limits',
    lede: 'Limits keep the shared sources healthy. Most routes are cached, so polling faster than the cache does not return newer data.',
    sections: [
      { id: 'limits', title: 'Request limit', body: ['Each IP address can make **240 requests per minute** across `/api/*`. Over the limit, you get `429` with `Retry-After: 60`.'] },
      { id: 'caching', title: 'Cache windows', table: [['Route', 'Cached for'], ['Research board (`/api/sports/board`)', '60 seconds'], ['MLB board', '15 minutes'], ['Live games', 'Refresh every 15 seconds; data older than 45 seconds is marked stale']] },
      { id: 'refresh', title: 'Forcing a refresh', body: ['Add `refresh=1` to research routes to skip the cache. Forced refreshes are limited to one per route per minute; other requests in that window get the cached copy.'] },
    ],
  },
  // Research
  {
    slug: 'sport-catalog', group: 'research', kind: 'endpoint', title: 'Sport catalog', method: 'GET', path: '/api/sports/catalog', access: 'research',
    summary: 'Games, available dates and supported markets for one sport and date.',
    description: ['Use the catalog first: it returns the game IDs and market keys the research board expects.', 'Only games ESPN lists for that date are returned. `availableDates` shows nearby dates that have games.'],
    params: sportParams,
    responses: [
      ['200', 'The catalog.', { sport: 'nba', league: null, date: '2026-10-21', games: [{ id: '401704871', date: '2026-10-21', startTime: '2026-10-21T23:30Z', home: { id: '2', name: 'Boston Celtics', code: 'BOS', score: null }, away: { id: '18', name: 'New York Knicks', code: 'NY', score: null }, venue: 'TD Garden', state: 'pre', complete: false, status: 'Scheduled', season: 2027, seasonType: 2 }], availableDates: ['2026-10-21', '2026-10-22'], source: { url: 'https://site.api.espn.com/…', fetchedAt: '2026-10-21T15:02:11Z', stale: false, error: null }, markets: { points: { label: 'Points', fields: ['PTS'], benchmark: 'season' } } }],
      ['400', 'A parameter is invalid.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  {
    slug: 'research-board', group: 'research', kind: 'endpoint', title: 'Research board', method: 'GET', path: '/api/sports/board', access: 'research',
    summary: 'Player research for one game: recent history, availability, props and model context.',
    description: ['Pass a `game` from the catalog. Without one, the first game that has not started is used.', 'WNBA also accepts `game=all` to build the whole slate; the response then lists each game under `matchups[]` and reports partial failures.', 'Model values are experimental research estimates. Check `model.status` and `warnings[]` before using them.'],
    params: sportParams,
    responses: [
      ['200', 'The research board.', { sport: 'nba', date: '2026-10-21', game: { id: '401704871', state: 'pre' }, market: 'points', players: [{ id: '4065648', player: 'Jayson Tatum', team: 'BOS', opponent: 'NY', home: true, position: 'SF', starter: true, lineupConfirmed: false, availability: 'active', prop: { line: 27.5, book: 'Captured' }, forecast: { point: 28.1 }, result: null }], unavailablePlayers: [], historyGames: [{ id: '401656359', date: '2026-04-12' }], model: { version: 'nba-2026.3', status: 'experimental' }, sources: [], warnings: [], fetchedAt: '2026-10-21T15:02:13Z' }],
      ['404', 'That game is not on the requested date.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  {
    slug: 'nfl-board', group: 'research', kind: 'endpoint', title: 'NFL board', method: 'GET', path: '/api/board', access: 'research',
    summary: 'The weekly NFL research board for one market.',
    description: ['Returns every player with a research row for the week: recent trend games, availability, the line when one was captured, and the experimental forecast.', 'Send `season` and `week` together, or neither for the current week.'],
    params: [
      { name: 'market', type: 'string', values: NFL_MARKETS, example: 'rec_yds', description: 'Stat market. Defaults to `any_td`.' },
      { name: 'view', type: 'string', values: ['board', 'games', 'viper', 'edge'], example: 'board', description: 'Board layout. `edge` leaves out forecast, availability and history fields.' },
      { name: 'season', type: 'integer', example: '', description: 'Season year (2000–2200). Requires `week`.' },
      { name: 'week', type: 'integer', example: '', description: 'Week number (1–22). Requires `season`.' },
    ],
    responses: [
      ['200', 'The NFL board.', { current: { season: 2026, week: 4 }, weeks: [{ season: 2026, week: 4 }], market: 'rec_yds', view: 'board', players: [{ id: '4430878', player: 'Jaxon Smith-Njigba', team: 'SEA', opponent: 'ARI', position: 'WR', line: 71.5, details: { sampleCount: 8 }, forecast: { point: 76.4 } }], stale: false, warning: null, fetchedAt: '2026-09-29T14:00:05Z' }],
      ['400', 'A parameter is invalid.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  {
    slug: 'mlb-board', group: 'research', kind: 'endpoint', title: 'MLB board', method: 'GET', path: '/api/mlb/board', access: 'research',
    summary: 'MLB games and player research for one date and market.',
    description: ['Batter and pitcher research with recent game logs, lineup status, the opposing pitcher and the experimental forecast. Cached for 15 minutes.'],
    params: [
      { name: 'date', type: 'string', format: 'date', example: '', placeholder: TODAY, description: 'Slate date, `YYYY-MM-DD`. Defaults to today.' },
      { name: 'market', type: 'string', values: MLB_MARKETS, example: 'hr', description: 'Stat market. Defaults to `hr`.' },
    ],
    responses: [
      ['200', 'The MLB board.', { sport: 'mlb', date: '2026-09-29', market: 'hr', games: [{ gameId: 776543, startTime: '2026-09-29T23:05Z', state: 'Preview', home: { name: 'New York Yankees', code: 'NYY', pitcher: 'G. Cole' }, away: { name: 'Baltimore Orioles', code: 'BAL', pitcher: 'C. Burnes' } }], players: [{ id: '776543:592450', player: 'Aaron Judge', team: 'NYY', lineupStatus: 'confirmed', battingOrder: 2, forecast: { probability: 0.21 }, logs: [{ date: '2026-09-28', value: 1 }] }], stale: false, warnings: [], fetchedAt: '2026-09-29T15:10:00Z' }],
      ['400', 'A parameter is invalid.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  {
    slug: 'parlay-pool', group: 'research', kind: 'endpoint', title: 'Parlay lines', method: 'GET', path: '/api/trends/parlay', access: 'research',
    summary: 'Every open player line on a slate, in every market, with each player\'s recent games.',
    description: ['The input to the Trends parlay builder: one row per posted line that is still open (the game has not started, the player is not ruled out), with both prices, the projection model\'s chance and the player\'s last 20 games for that stat, newest first.', 'NFL takes `season` and `week` together, or neither for the current week; other sports take a `date`. Soccer has no posted player lines.'],
    params: [
      { name: 'sport', type: 'string', values: ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer'], example: 'nfl', required: true, description: 'Sport.' },
      { name: 'date', type: 'string', format: 'date', example: '', placeholder: TODAY, description: 'Slate date for sports other than NFL, `YYYY-MM-DD`. Defaults to today.' },
      { name: 'season', type: 'integer', example: '', description: 'NFL season. Requires `week`.' },
      { name: 'week', type: 'integer', example: '', description: 'NFL week. Requires `season`.' },
    ],
    responses: [
      ['200', 'The open lines.', { sport: 'nfl', slate: { season: 2026, week: 4 }, linesAt: '2026-10-05T03:53:35Z', markets: { rec_yds: { label: 'Receiving yards', unit: 'yards' } }, games: [{ id: '2026_04_ATL_NO', label: 'ATL @ NO', start: '2026-10-06T00:15:00Z' }], legs: [{ id: '2026_04_ATL_NO:00-0037239:rec_yds', player: 'Chris Olave', team: 'NO', opponent: 'ATL', market: 'rec_yds', line: 85.5, book: 'FanDuel', books: 3, over: -113, under: -113, projection: 107.4, model: { over: 0.54, under: 0.46 }, games: [['2026-09-27', 107, 1, 0, 'LV']] }], notes: [] }],
      ['400', 'A parameter is invalid.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  // Live
  {
    slug: 'live-game', group: 'live', kind: 'endpoint', title: 'Live game', method: 'GET', path: '/api/nfl/live', access: 'research', pathSport: ['nfl', 'nba', 'wnba', 'mlb'],
    summary: 'Live score, player projections and the game model for one game.',
    description: ['Replace `nfl` in the path with `nba`, `wnba` or `mlb` for other leagues. Without `game`, the first live game (or the next one) is selected; `events[]` lists the rest.', 'Poll every `refreshSeconds` (15). Data older than `maxAgeSeconds` (45) is flagged with `stale: true`.'],
    params: [
      { name: 'game', type: 'string', example: '', description: 'An event ID (6–12 digits).' },
      { name: 'date', type: 'string', format: 'date', example: '', placeholder: TODAY, description: 'Scoreboard date, `YYYY-MM-DD`. Defaults to today.' },
    ],
    responses: [
      ['200', 'The live game.', { events: [{ id: '401772941', name: 'Seattle Seahawks at Arizona Cardinals', state: 'in' }], selected: '401772941', game: { clock: '8:42', period: 3, home: { code: 'ARI', score: 17 }, away: { code: 'SEA', score: 20 } }, players: [{ player: 'Jaxon Smith-Njigba', projections: { rec_yds: { point: 88.2 } } }], gameModel: { homeWin: 0.41 }, refreshSeconds: 15, maxAgeSeconds: 45, stale: false, fetchedAt: '2026-09-29T21:14:03Z' }],
      ['400', 'Unknown game or bad date.', { error: 'This request could not be completed. Please try again.' }],
      ['401', 'Not signed in.', { error: 'Sign in to continue.', code: 'SIGN_IN_REQUIRED' }],
    ],
  },
  // EV feed
  {
    slug: 'ev-quotes', group: 'ev', kind: 'endpoint', title: 'List quotes', method: 'GET', path: '/api/ev/quotes', access: 'ev',
    summary: 'The current snapshot of normalized sportsbook quotes.',
    description: ['The same quotes that power odds comparison, +EV, arbitrage, builders and alerts. The snapshot is complete: quotes missing from it have been removed.', 'Quotes are filtered by the markets VisualOdds currently distributes; `controlScope` says which filter applied.'],
    params: [],
    responses: [
      ['200', 'The quote snapshot.', { quotes: [{ id: 'feed:event:total:over:book', sport: 'NFL', event: 'Arizona vs Seattle', market: 'Game total', type: 'total', line: 44.5, side: 'Over', book: 'Example Book', odds: -110, live: false, ts: '2026-09-25T00:00:00Z' }], count: 1, complete: true, controlsApplied: true, controlScope: 'public' }],
      ['403', 'Your plan does not include the EV feed.', { error: 'Your current plan does not include this tool.', code: 'UPGRADE_REQUIRED' }],
      ['503', 'The quote source is unreachable.', { error: 'The EV API is unavailable.', retryable: true }],
    ],
  },
  {
    slug: 'ev-upsert-quotes', group: 'ev', kind: 'endpoint', title: 'Upsert quotes', method: 'POST', path: '/api/ev/quotes', access: 'staff',
    summary: 'Add or replace quotes by ID.',
    description: ['Send a JSON array of quotes (up to 2 MB). Each quote needs a stable `id`, `book`, its observation time `ts` with a timezone, and `sport`, `event`, `market`, `side` and `odds`.'],
    params: [],
    body: [{ id: 'feed:event:total:over:book', sport: 'NFL', event: 'Arizona vs Seattle', market: 'Game total', type: 'total', line: 44.5, side: 'Over', book: 'Example Book', odds: -110, live: false, ts: '2026-09-25T00:00:00Z' }],
    responses: [
      ['200', 'The upstream result.', { ok: true, upserted: 1 }],
      ['413', 'The body is larger than 2 MB.', { error: 'Request body is too large.' }],
      ['403', 'Not a staff account with data permission.', { error: 'Your current plan does not include this tool.', code: 'UPGRADE_REQUIRED' }],
    ],
  },
  {
    slug: 'ev-matches', group: 'ev', kind: 'endpoint', title: 'List matches', method: 'GET', path: '/api/ev/matches', access: 'ev',
    summary: 'Events represented in the current quote snapshot.',
    description: ['One row per event, with the IDs you can pass to the delete route.'],
    params: [],
    responses: [
      ['200', 'The matches.', { matches: [{ id: 'nfl-2026-w4-sea-ari', sport: 'NFL', event: 'Arizona vs Seattle', start: '2026-09-29T20:25:00Z', quotes: 48 }], count: 1, complete: true, controlsApplied: true, controlScope: 'public' }],
      ['403', 'Your plan does not include the EV feed.', { error: 'Your current plan does not include this tool.', code: 'UPGRADE_REQUIRED' }],
    ],
  },
  {
    slug: 'ev-delete-match', group: 'ev', kind: 'endpoint', title: 'Delete a match', method: 'DELETE', path: '/api/ev/matches/{id}', access: 'staff',
    summary: 'Remove an event and all of its quotes.',
    description: ['`id` may contain letters, digits, `_` and `-` (up to 180 characters).'],
    params: [{ name: 'id', in: 'path', type: 'string', required: true, example: 'nfl-2026-w4-sea-ari', description: 'The match ID from List matches.' }],
    responses: [
      ['200', 'The upstream result.', { ok: true, deleted: 'nfl-2026-w4-sea-ari' }],
      ['404', 'Unknown route or ID format.', { error: 'Unknown EV API route.' }],
    ],
  },
  {
    slug: 'ev-status', group: 'ev', kind: 'endpoint', title: 'Feed status', method: 'GET', path: '/api/ev/status', access: 'ev',
    summary: 'Health and quote counts for the quote source.',
    description: ['Use this before a sync to check that the quote source is reachable. `GET /api/ev/health` returns a lighter liveness check.'],
    params: [],
    responses: [
      ['200', 'Source status.', { ok: true, quotes: 1284, matches: 37, updatedAt: '2026-09-29T21:14:00Z' }],
      ['503', 'The quote source is unreachable.', { error: 'The EV API is unavailable.', retryable: true }],
    ],
  },
  // System
  {
    slug: 'health', group: 'system', kind: 'endpoint', title: 'Health check', method: 'GET', path: '/api/health', access: 'public',
    summary: 'Is the API up, and when did it last sync?',
    description: ['Public and cheap to call. Use it for uptime checks; the status page polls it too.'],
    params: [],
    responses: [
      ['200', 'The API is up.', { ok: true, app: 'independent-nfl-workspace', syncing: false, lastSync: null, refreshMinutes: 15 }],
      ['429', 'Rate limited.', { error: 'Too many requests. Wait a minute and try again.', code: 'RATE_LIMITED' }],
    ],
  },
];

export { ACCESS };
export const apiPage = slug => API_PAGES.find(page => page.slug === slug) || null;
export const apiPagePath = page => page.slug ? `${API_BASE_PATH}/${page.slug}` : API_BASE_PATH;

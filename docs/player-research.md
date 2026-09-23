# Player research and trends

NFL, MLB, NBA, WNBA, NHL and soccer use the same player research dialog. Open a player from a research board or Trends. The interface puts completed-game results first, followed by supporting statistics and a model estimate; opponent information, participation and observed line movement sit beside the chart on desktop and below it on phones.

## Reading a player

- L5, L10 and L20 select the most recent available appearances. Home/away filters apply before selecting the window. H2H selects this opponent; year filters select the calendar year within the available sample. These are not complete career or season databases.
- The chart runs oldest to newest. Combined markets use stacked components only when all component statistics are present and agree with the recorded total. Missing statistics do not become zeroes. Ties are shown separately and remain in the past-game frequency denominator.
- A posted or explicitly archived line is the comparison for every historical result. It is not each past game's original line. A custom comparison line changes the chart but does not create sportsbook odds or a new model probability.
- Average, median and supporting-stat sample counts use the same filters. The model's underlying sample and projection remain independent of the chart filters. Recent change compares five appearances with the previous five, requiring ten usable results.
- Basketball opponent tables distinguish the entire team from guards, forwards and centers. They total the opposing position group in up to 15 prior games, using positions supplied by the box score. They do not invent league rankings or individual defender assignments. Missing fields are excluded per statistic; counts are displayed.
- NFL TD estimates use the available modeled over probability consistently. The projection covers rushing/receiving TDs; the chart retains all recorded player TDs, including returns. The two scopes are explained in the view.

## Data and storage

NFL research history contains up to 20 completed appearances before the selected week, potentially across seasons. The board sends compact results; `/api/nfl/research` returns one player's full statistics, model inputs and source context. MLB boards contain 20 compact results; `/api/mlb/evidence` includes up to 60 available prior appearances with supporting statistics. Pitcher history contains starts only and excludes same-day games. NBA/WNBA/NHL/soccer retain their existing, at most 20-appearance model samples, with opponent and source metadata added.

History helpers do not alter forecast inputs, model weights, saved predictions or result grading. Sources can still revise completed box scores. Offseason dates and unavailable histories display empty states.

Line movement records only real quotes observed by this browser, separated by sport, game, player, market and bookmaker. Duplicate timestamps, out-of-order quotes and stale quotes are excluded. The bounded local history keeps 80 observations per key and 500 keys. One quote is shown as one observation, not an invented opening line; multiple fresh checks can show a flat line. Archived quotes remain labeled as archives. Clearing browser storage removes observations, notes, saved players and preferences.

Dev mode is a display preference, available at the top right of the site and player dialog. It reveals technical model details and raw source context and persists locally; it does not change calculations or grant access permissions. Notes and saved-player controls retain each sport's existing browser storage.

## Validation

`npm run check` verifies module syntax; `npm test` covers history eligibility, combined markets, missing versus zero values, pushes, time windows, quote isolation/retention, NFL payload immutability, opponent samples and all-sport navigation. Browser verification exercised real NFL, MLB, NBA, WNBA, NHL and soccer data: opening players, switching markets/windows, custom lines, H2H, venue filters, game logs, averages/medians, availability, insights, notes, saved players, Dev mode and Escape. Layouts were checked at 1440, 390 and 320 pixels.

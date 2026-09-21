# MLB verification — September 21, 2026

The MLB section is served at `/mlb`; the existing NFL section remains at `/` and `/nfl`.

## Automated checks

- 69 unit/regression tests passed, including the existing NFL and Vercel startup tests.
- MLB coverage includes stat definitions, zero versus missing values, innings-to-outs conversion, date rollover, no selected-day or incomplete-game leakage, doubleheaders, pitcher starts, lineup status, hit/miss/push, missing/in-play lines, public event identity, quote preference, archive preservation, offline cache, empty schedules, and full evidence behind compact boards.
- `npm run check` validates the server and frontend/backend module syntax.
- `npm run audit:mlb -- 2026-09-20` checked all 16 routes across 15 completed games. **3,527 final-stat comparisons** matched fresh official MLB box scores; **16 full-sample calculation checks** passed. No source warnings or audit errors occurred.
- Spot check: Cristopher Sánchez (game 823570) recorded 6 strikeouts, 19 outs (6.1 IP), 2 earned runs, 6 hits allowed, and 0 walks. Both over and under alerts were verified against the displayed archived totals.

## Live feed and hosting checks

- September 21: 3 scheduled games, 84 batter profiles, 6 probable starters; 57 home-run lines, including 54 FanDuel lines.
- September 22: 16 scheduled games and 448 batter profiles; lines remained unposted when the public source had none.
- January 15, 2027: successful empty offseason board, with no fabricated players or games.
- The Vercel preview returned HTTP 200 for the full September 20 hits board: 420 profiles, 327 totals, 313 FanDuel totals, approximately 1.56 MB. A cold request took about 9 seconds in the observed preview.
- Full player evidence remained available with all 20 batter appearances while grid responses included only ten compact chart rows. The full-slate board stays below the hosted response-size budget.

## Browser checks

Desktop and 390-pixel mobile layouts were inspected. Verified market/date navigation, historical hit/miss switching between over and under, player details with official links, watchlist, notes, comparison, CSV export, and game matchups. No browser console errors were observed during these checks. Temporary test notes/watchlist entries were removed and the viewport override was reset.

## Limits

These checks establish data and arithmetic consistency, not predictive performance. Ratings are recent-production scores, not calibrated win probabilities. The initial public comparison feed offered lines for 12 of the 16 markets; runs, doubles, batter walks, and batter strikeouts had no totals. Other markets sometimes used explicitly named fallback sportsbooks. Arizona-specific prices are not independently verified. Hosted captured-line history is temporary per instance; public archives are the fallback and do not prove closing lines. Book-specific void/settlement rules are not applied. Source corrections can revise past boards.

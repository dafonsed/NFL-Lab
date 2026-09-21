# Verification of the independent implementation

The previous reference-site scraper and its tests were removed. Runtime data adapters use only the configured nflverse GitHub release files. ESPN is used separately for cross-provider auditing and user-facing box-score links.

## Automated checks

`npm test` covers field-zone boundaries, null values, penalty/nullified-play exclusion, two-point exclusions, kneels/spikes, TD conversion rates, spread signs, historical samples, incomplete games, future rosters, byes, active status, snap-only zero appearances, missing weekly rows, missing charting, NGS coverage joins, data-source allowlisting, input validation, conditional caching and offline fallback.

`npm run audit` writes a reproducible report containing source URLs/hashes, arithmetic checks, and ESPN comparisons. The report deliberately records disagreement; it is not a blanket claim that every statistic is correct.

## Practical limits

- Scores and probabilities are this app's model, not the reference app's private model.
- Charting is limited to available FTN sample games. It is not a live current-season feed.
- No live injury feed or player-prop sportsbook feed is connected.
- Source data can change after NFL stat corrections. Historical boards use the corrected records available now.
- Expected-production and probability models are not betting-calibrated.

See README.md for source links and reports/INDEPENDENT-AUDIT.md for the current data audit.

## Completed checks — September 20, 2026 (Arizona)

- 25 automated tests passed; syntax checks passed.
- 23 HTTP board selections passed: all five markets in all four data views, plus 2026 weeks 1 and 3 and 2025 week 18. Invalid requests were rejected, an unpublished future season stayed pending, and raw evidence loaded.
- 1,093 player/market profiles passed 4,744 arithmetic and sample assertions.
- 1,489 of 1,491 compared ESPN counting stats matched across 16 games. Two target-count disagreements are retained and displayed. One unmatched category entry belongs to an offensive lineman outside the supported positions. The audit intentionally exits nonzero for the source disagreements.
- Chrome: all market views rendered; per-stat definitions, raw evidence links, source-discrepancy notices, game-line movement, methodology, Viper filters and future-week selection checked.
- Mobile viewport checked at 390 pixels: one matchup column with no document overflow. Desktop viewport restored.
- Final Chrome page showed “Independent data,” 2026 Week 2, 429 player profiles and 16 matchups, with no captured browser errors.
- Old reference-site snapshots/reports were archived; runtime/scripts contain no old provider URL, page decoder or imported score field.

## Purple interface and player explanations

- Reworked the theme, navigation, filters, matchup cards, player details and mobile layout in dark purple with restrained glow effects.
- Every player now has a market-specific explanation directly below their name, built from the same recorded inputs as the model. Low scores, missing inputs and small samples are handled explicitly.
- Passing-TD cards expose red-zone attempts per game and its source formula, so the note's volume input can be checked in the detail panel.
- 32 automated tests passed, including seven explanation tests; syntax checks passed.
- Chrome verified all five market explanations, expanding player details, per-stat source definitions, search, rankings and saving. The temporary save was reverted.
- Checked 390-pixel mobile layout with no horizontal document overflow and corrected the save-button overlap on expanded cards. Restored the normal desktop viewport.
- The finished Game Vault remains open with no captured browser errors.

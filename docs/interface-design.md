# Sports Lab interface

The app uses one dark design system across NFL, MLB, NBA, WNBA, NHL, and soccer. `public/app-design.css` is the final stylesheet and owns the shared visual tokens, navigation, controls, responsive rules, and workspace surfaces. Sport styles retain their data-specific layout rules. `public/ui-icons.js` supplies the same SVG icon geometry on the server and client.

## Design decisions

- The night theme uses graphite surfaces, visible cyan/violet lighting at panel edges, and a dotted texture on navigation and featured headers. Blue-to-violet pills mark primary actions. Secondary actions use translucent dark pills, and circular utility controls use a light surface. Mint/red remain the chart's hit/miss colors; decorative glows never imply a model outcome.
- Sport selectors, market tabs, saved-player actions, metadata labels, filter counts, and the floating mobile dock have distinct selected states. Player headers keep matchup labels, sportsbook lines, and chart controls together in the Outlier research hierarchy. The mobile player footer keeps the line and source button in one row.
- The desktop rail carries destinations; the top bar carries sports and display controls. On phones, Research, Trends, Live, My picks, and More remain available in the bottom bar. Every icon-only destination has an accessible name.
- Charts, projections, and lines stay ahead of technical explanations. Board overviews, source notes, and matchup context use native expandable sections. Source failures and stale-data warnings remain visible. Developer mode reveals calculation details and the longer model explanations.
- Filter sheets edit drafts. Cancel or Escape discards them; Apply updates the existing page controls. Presets are scoped to sport and workspace, preserve the current date/market/search, and save only the controls shown in the sheet. Names are escaped. Storage failures are reported without preventing session use.
- Research toolbars keep search, sort, and quick toggles in one row; detailed dropdown filters live in the filter sheet. Related source and overview disclosures share a compact strip, with an open disclosure expanding to the full width.
- The labeled Appearance control opens the theme preview, comfortable/compact spacing, and reduced-animation preferences. Preferences persist locally. Native dialogs provide modal focus behavior; closing a sheet restores the trigger, including opening settings from the mobile menu.
- My picks adds All/Open/Settled views over the existing local ticket ledger. Refunded tickets count as settled; existing profit, ROI, export, and settlement calculations are unchanged.
- Remote headshots reveal when available. Initials remain behind slow or failed images; no placeholder statistics or fabricated player imagery are used.

## Reference direction

The user supplied Flatstudio's Outlier [registration](https://dribbble.com/shots/25538765-Outlier-iOS-Registration), [Trends](https://dribbble.com/shots/25157754-Outlier-iOS-Trends), [filters](https://dribbble.com/shots/25323957-Outlier-iOS-Filters), [boosts and middle bets](https://dribbble.com/shots/25313928-Outlier-iOS-EV-Boosts-Middle-bets), [EV](https://dribbble.com/shots/25318193-Outlier-iOS-EV), and [My picks](https://dribbble.com/shots/25040665-Outlier-My-picks) screens, plus a dark UI control reference. Their compact hierarchy, neutral selected states, mint actions, restrained gradients, and filter sheets inform the design. Sports Lab retains its own brand, data, and working features. The references do not imply that unsupported EV, arbitrage, signup, or sportsbook placement features exist.

## Verification

Browser checks cover the home chooser, six sport research pages, six Trends dashboards, Live, My picks, performance, paper returns, and the locally available simulation workspace. Player details and Trends were checked at 320, 390, 768, and 1440 pixels. Interaction checks cover filter cancellation/application, saved presets across reload, custom lines, venues, game windows, full player history, Dev mode, display preferences, Escape/focus return, mobile destinations, ticket views, editing/saving, and CSV export.

The MLB Trends detail request uses the game-and-player identifier required by the evidence endpoint, including doubleheader identity. It must not use the player's standalone ID.

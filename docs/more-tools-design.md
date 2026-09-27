# More tools design

Reference review: OddsJam's Tools navigation and dense opportunity presentation; SmartStake's compact product menu, inline platform marks, and calculator / result hierarchy. Preserve SportsLab's own names, assets, math and saved records.

Palette: canvas #0d1316, surface #171e22, elevated #202a30, text #eef4f6, mint #54d9b2, blue #83bcf6. Muted text and borders use existing workspace tokens. Outfit carries tool titles; Inter carries controls, tabular numbers and descriptions.

Layout: retain the seven primary links and place More beside them. The menu uses three readable columns. On small screens it becomes a scrollable panel with primary destinations included. Hover, click, keyboard, Escape and outside-click all work.

    Main navigation                 More
                      Markets | Builders | Research & alerts

    Tool title + purpose                    Main action
    Related tools / filters
    Working area (table, inputs, chart) | Calculation / selection
    Secondary records / short method note

Different jobs get different layouts: middles use paired outcomes; low holds use a ranked price table; converter uses inputs and an outcome receipt; parlay and fantasy slips pair choices with a ticket; optimizer ranks combinations; alerts pair watch rules and activity; prediction markets show bid/ask contracts above positions; trends pair result history and correlation.

Review against brief: avoid another generic dashboard of repeated KPI cards. Use a small, inline summary where it helps, and spend the visual emphasis on the actual calculation or selected ticket. No new live-feed claims, synthetic results, or payout assumptions. Empty states provide the relevant entry action. Existing live EV and arbitrage designs are retained and exposed in More.

Second-pass review: the header popup sits outside the scrolling navigation, with a focus-transition fix to keep links clickable. Mobile keeps the primary links in a scrollable row alongside More; the popup scrolls within the viewport. Secondary screens put feed status after the working area, retain Import/Export in Workspace tools, and show the data source beside the title. Prediction filters now sit in a compact toolbar, and prop-result bars have an explicit flex layout. Search preserves selected fantasy picks.

Verification: all 12 More destinations opened in the browser with example data, without horizontal page overflow or console errors. Checked optimizer-to-slip selection, typed stake recalculation, platform filtering, alert creation and persisted pause/resume. Reviewed desktop and 390px mobile layouts. Unit tests cover shared navigation, accessible/escaped controls, balanced promo outcomes, hover/focus behavior and selected-ticket preservation.

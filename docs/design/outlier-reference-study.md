# Outlier reference study

Reviewed September 23, 2026. This is a study and implementation reference, not a record of site changes.

Source: `C:\Users\eturn\Downloads\Outlier site images`.

All **157 supplied images** were visually inspected through 18 labeled contact sheets. Key layout, control, chart, and interaction diagrams were additionally examined at full resolution. The set contains the cover plus `outlier_web_01` through `outlier_web_157`, with **no file numbered 70**. All 157 files have distinct SHA-256 hashes. See [the image catalog](outlier-image-catalog.md) for every image, its observation, and its original local path; [the inventory](outlier-reference-inventory.json) includes dimensions and hashes.

The folder is largely a presentation of interface designs: browser mockups, phone mockups, component closeups, annotated design iterations, and montages. Treat it as the user's visual reference, not proof of today's production Outlier website. Screenshots reveal visible structure and states, not private source code, API contracts, exact breakpoints, animations, or calculation methods. Some mockups deliberately reuse placeholder sports data across different contexts. Do not reproduce those data inconsistencies.

## The design we are aiming for

A compact sports research workspace: persistent navigation, a shallow page header, a tightly aligned filter strip, dense comparison tables, and a focused research view with a main chart and contextual side column. The design depends on hierarchy, proportions, alignment, and complete states. Applying dark backgrounds and rounded corners to oversized stacked cards will not produce this result.

The strongest anchors for the next implementation are:

| Area | Reference IDs | What to follow |
| --- | --- | --- |
| Foundations | 005, 006, 012–014, 017 | Typography, palette, annotated grid, icon consistency, hover states, separate click targets |
| Discovery boards | cover, 043–044, 071–078, 118 | Dense desktop columns; deliberate mobile card anatomy; refined EV hierarchy |
| Full filters | 045–052, 079–088, 091–095 | Category navigation, focused editors, selection summaries, clear/apply actions, mobile accordions |
| Research | 031–042, 053–069, 096–101 | Compact identity header, market/window controls, primary visualization, sport-specific side panels |
| Picks and menus | 002, 015–018, 118–124 | Grouped picks, small inline sportsbook prices, contextual popovers, explicit selection states |
| Settings and saved views | 129–136 | Consistent drill-in panels, form focus/disabled states, reusable filter templates |

### User preferences that remain binding

- Keep the **dark appearance**. Light references supply layout and control structure only.
- Latest instruction supersedes the previous purple preference: reproduce the supplied **dark Outlier reference palette** directly: black canvas, neutral charcoal panels, white selected controls, teal actions, and green/red historical results. The masthead follows the supplied teal-to-muted-orange gradient. Brand marks retain their actual colors.
- Keep Trends and Model as separate destinations and mental tasks. A compact contextual link may connect them.
- Navigation, markets, filters, and research panels must follow the selected sport. MLB must not expose NFL-only performance tools.
- Use actual player cutouts and real team/league marks. Keep the team badge overlapping the player in the established position; choose a legible alternative logo asset when necessary. Do not solve contrast by moving the badge into another layout.
- Use a small sportsbook symbol beside an available price. Do not use a large sportsbook wordmark or a separate promotional block.
- Remove redundant visible microcopy, repeated source summaries, explanatory footers, and decorative metadata. Keep relevant detail in a tooltip, disclosure, or information panel when it is useful.
- Latest instruction requests direct reproduction of the supplied designs. Use specific reference screens for each composition; do not invent alternative meters, oversized KPI cards, or dashboard treatments. Application data and supported functionality remain real.

## 1. Layout and density

### Desktop shell

Reference 006 explicitly annotates one desktop grid with a **246 px left region, 760 px main region, and 338 px right region**, 16 px margins, and an 8 px grid gutter. Its main grid uses twelve 56 px columns with eleven 8 px gaps: 760 px total. These are dimensions for that illustrated layout, not evidence of universal production CSS.

The left navigation is quiet: logo and book selector near the top, a consistent column of outline icons and short labels, and account controls at the bottom. The active navigation item is a distinct neutral surface. The rail supports the data workspace instead of competing with it. Avoid many section captions, a very large brand lockup, or oversized vertical gaps between tool links.

Main pages follow a clear stack:

1. A shallow masthead containing page identity and sport context.
2. A compact toolbar of aligned controls, with consistent heights and icon scale.
3. A header row and immediately visible data rows.

Research pages replace discovery content with their own compact identity/market header. Do not leave a full discovery masthead, a large filter form, a large return row, and a large player hero stacked above the chart. This was a major source of the earlier mismatch.

When present, the right column is for supporting decisions: picks, line history, matchup, injuries, or insight. Its cards are tighter than the main chart. Use a real two-column research composition at desktop widths; do not leave a full-width chart followed by unrelated boxes far below it.

### Mobile recomposition

Reference 006 annotates a **328 px content grid**, six 48 px columns with five 8 px gaps, and 16 px side margins. The examples show different mobile shells, including web hamburger headers and native-style bottom navigation in the user's earlier attachments. Choose one consistent shell for our product.

Desktop tables become compact cards with intentional internal rows: identity and market; sportsbook prices; hit-rate or metric strip; optional expanded details. Filters become stacked expandable sections. Context panels become drill-in views, tabs, or sheets. Large charts can scroll inside a controlled region; the whole page should not acquire accidental horizontal overflow.

## 2. Visual foundation

Reference 005 names **SF Pro**. Use a carefully matched system sans stack where SF Pro is unavailable; do not assume it is installed on Windows. Match weight, line height, and optical scale, not just the family name. Numeric cells need stable tabular alignment.

The following are **approximate decoded-image samples from the center of the style-board swatches**, not claimed production CSS values:

| Role on the board | Sample |
| --- | --- |
| Primary teal | `#2cccba` |
| Charcoal | `#1c1e1d` |
| Mid gray | `#616161` |
| Muted gray | `#b0b0b0` |
| Light neutral | `#e7e7e7` |
| Positive/result green | `#1cdd92` |
| Caution | `#eea901` |
| Negative/result red | `#cd3316` |
| Secondary data pink | `#fa7288` |
| Secondary data blue | `#335ffe` |

Dark app examples use nearly black canvas, slightly lighter panels, and restrained separators. They do not tint every panel green. Gradients are concentrated in page/research headers; large marketing gradients and 3D artwork belong to marketing, onboarding, or promotion screens, not regular table rows.

Establish tokens for canvas, panel, inset, hover, selected-neutral, text-primary, text-secondary, border, accent, result-positive, result-negative, result-neutral, and focus. Page-specific hardcoded accent colors should not override this system.

Starting implementation dimensions, to be calibrated against a matched viewport rather than treated as measured source facts:

| Element | Starting target |
| --- | --- |
| Desktop toolbar control | 32–36 px high, 6–8 px radius |
| Mobile interactive target | At least 44 px, even when the visible icon is smaller |
| Desktop data row | Approximately 48–56 px for two lines of identity |
| Table portrait | Approximately 28–34 px, badge about 12–16 px |
| Research portrait | Approximately 44–56 px, badge about 18–22 px |
| Inline sportsbook mark | Approximately 12–16 px beside the price |
| Main panel padding | Usually 12–20 px, adjusted to purpose |
| Text scale | 12–14 px dense data; 14–16 px section titles; 22–28 px page titles |

Rounded corners are differentiated: small controls, medium cards, larger modal/sheet corners. Avoid giving all controls and panels the same pill shape. Borders should be subtle; avoid a heavy outline around every nested group.

## 3. Control families and states

| Control | Visible reference pattern | Implementation requirement |
| --- | --- | --- |
| Toolbar dropdown | Icon, concise selected value, small chevron; shared baseline | Anchored panel, consistent width rules, selected option, keyboard support, outside/Escape dismissal |
| Single-select menu | Compact option rows, selected indicator | Distinguish active selection from hover; keep the trigger value synchronized |
| Multi-select | Named rows with entity logos/portraits and right-aligned checkbox | Search when needed, grouped selections, clear action, count summary |
| Time-window segments | Dark inset track with a white/light selected segment in dark examples | Keep it thin and readable; do not add oversized checks and decorative subtitles |
| Market tabs | Text with a short active underline | Separate this navigation language from button groups |
| Secondary tabs | Neutral raised segment, e.g. Matchup/Injuries/Insights | Keep visible panel state aligned with selected tab |
| Primary action | Teal fill, dark text, optional split chevron | Reserve for the main action within that surface |
| Secondary action | Neutral/dark surface, quiet border, icon plus short label | Clear hover/focus/disabled behavior without competing with primary action |
| Checkbox/switch | Teal selected state, neutral empty state | Full label is clickable; visible check and accessible state |
| Range control | Numeric endpoints, rail, distinct handles; histogram where applicable | Real underlying distribution, valid bounds, keyboard operation and typed values |
| Stepper | Minus, centered count, plus in a compact group | Minimum/maximum bounds; distinct disabled buttons |
| Overflow menu | Small contextual list, e.g. quick bet or hide | Scope the operation to the intended row; do not navigate the parent row accidentally |
| Disclosure | Inline chevron or small explicit expansion row | Preserve state and alignment; no jumps caused by broken sizing |

References 014 and 017 explicitly document row hover and click zones. Saving, opening market research, opening de-vig detail, expanding odds, and opening a context menu are separate interactions. One giant click handler cannot stand in for this design. Hover changes row/cell surfaces and can emphasize book logos; active and saved states remain visible without hover.

Accessibility behavior is our implementation requirement, not something proven by these still images: focus restoration, roving tab focus where appropriate, accessible names, visible focus rings, modal focus management, and equivalent keyboard actions.

### Dates and calendar

The supplied images show date context, schedule strips, and a **Dates of events** preset editor in 091: Any time, Today, Tomorrow, next 3 days, week, next two weeks, and month. They do **not** provide a sufficiently clear full month-grid calendar to claim an exact calendar reproduction.

A custom calendar should therefore be explicitly treated as a compatible extension: the same dark popover surface, compact month/year header, small previous/next actions, aligned weekday/day grid, neutral hover, distinct selected date, subtle today marker, and concise presets. Support arrow-key navigation, month transitions, leap days, and local date semantics. Do not introduce an unrelated native-looking panel or invent special Outlier calendar behavior.

## 4. Full filter design

References 045–052 and 079–095 establish a **desktop modal with a category column and a focused editor**, not an undifferentiated long form. The header has Current filters with a count, Current/Templates navigation, and close. The bottom action area contains clear/reset, save filters where supported, and a prominent results action. Category rows summarize current choices and can expose a small clear action.

Examples of category editors:

- Players: search, portrait, name, muted team identity, checkbox, selected row background.
- Leagues: logo plus name, group headers, select-all per group, selected rows.
- Odds/implied probability: explicit mode switch, From/To values, two-handle histogram control.
- Hit rate: window-specific condition and bounded percentage range.
- Sorting: ascending and descending alternatives, one clear selected state.
- De-vig books: required/optional columns, real book marks, weight editor and minimum-book stepper.
- De-vig method: a simple focused single-selection list.
- Book market limits: separate branded ranges per selected book.

On mobile, the same categories form a vertical accordion/sheet with summaries and persistent apply access. Do not force a tiny left-column modal onto a phone.

Selected filters must have consistent draft, apply, clear, reset, and count semantics. The screenshots show apply/result-count controls; exact cancellation behavior is not proven, so define and test it deliberately. Errors belong to the relevant category/editor (082), not a generic unexplained failure at the bottom.

Only render categories our data and product actually support. A sportsbook weight diagram or odds histogram must represent real data. Do not add fake sliders, invented availability, meaningless options, or controls that never affect results just because they appear in a reference.

### Separate chart filters

References 058–059 show another filter scope: games with/without a player, home split, win/loss margin, minutes played, opponent rank. These filter one player's historical sample. Keep this scope separate from board filters that select players, props, markets, dates, and books. Each sport gets appropriate sample filters; do not expose basketball minutes or positional defenses in MLB indiscriminately.

## 5. Discovery tables and cards

The desktop proposition row is a small, repeatable information unit: add/save; portrait and team badge; name plus matchup; market/side; line; small book-logo price cells; implied probability or relevant rank; aligned historical windows.

Columns maintain consistent widths and numeric alignment. Shorter identifying text is secondary but readable. Hit-rate cells use restrained conditional text/background treatment. Use a clear selected/sort indicator and preserve table state when opening and returning from a player.

Mobile uses structured cards rather than a table cropped offscreen. Market identity, price, and sample metrics should remain recognizable across layouts. Expand secondary book comparisons on demand. Do not turn a simple row into a large marketing card with duplicated metadata.

References 071–073 are explicitly labeled earlier EV iterations; 074–078 emphasize a cleaner focus. Prefer the refined information hierarchy. A single page should not mix incompatible early and late component variants.

## 6. Player and game research

The intended reading order is:

1. Identity, matchup, selected market, and actionable line/price.
2. Market tabs and time-window controls.
3. Selected-sample hit rate and compact comparisons to other windows.
4. The chart or game log as the dominant content.
5. Supporting metrics and sport-specific matchup context.

A desktop research page must show useful chart data in the first screen. Avoid multiple 80–160 px bars above it. The reference often places alternative lines and save/add actions in the compact hero, then puts window selection directly above the chart.

Chart treatment: even bar widths and gaps, very quiet gridlines, visible numeric labels, a subtle dashed comparison line with a small value marker, concise opponent/date labels, and outcomes encoded consistently. Combo stats can use stacked components. Binary outcomes use result tiles rather than pretending to be continuous bars (060–061).

For our requested opponent labels, use a small actual team mark, @/vs, short team code, and compact date. Maintain alignment beneath each bar, reserve sufficient space, and disclose full details on hover/focus. Avoid names truncated into repeated fragments such as '@ Athle...'.

Supporting stats should be dense and aligned: metric label, value, and real sparkline if useful. Keep Average/Median local to that panel. Repeated text such as '10 games · average' under every value should be removed when a single contextual label already establishes the sample.

The right research column has small tables and comparisons, not mostly empty explanatory cards. Examples include line history, matchup/injury/insight tabs, ranks and values, paired team comparison bars, pitchers, batters, and availability. Missing information should not occupy a large empty card; give it a concise local state and allow the useful content to remain prominent.

### Sport-specific research modules

| Sport/context | Observed patterns | References |
| --- | --- | --- |
| Basketball | Combined-stat bars; position-filtered opponent defense; team ranks; minutes and teammate sample filters | 035, 053–059 |
| Baseball | Starting pitcher comparison; handedness splits; batter table; pitch arsenal; pitch-type tabs; weather/park context | 062–066 |
| Football | Line matchup; run/pass proportions; target share; depth of field; red-zone and position context | 067–069 |
| Soccer/team markets | Yes/no, three-way outcome, both-teams-to-score, scored/conceded and game-result logs | 037–042 |
| EV research | Soft/fair price, de-vig book list and weights, method comparison, odds movement | 019–021, 089–101 |

Sharing the shell and table primitives does not mean sharing irrelevant domain panels. Use a sport/market capability registry to decide which modules and controls can render. Placeholder content in the visual references is not a source of sports facts.

## 7. Asset treatment

Keep transparent player cutouts naturally proportioned. Use object-fit and optical positioning, not stretched photos or inconsistent rectangular crops. The overlapped team badge must be legible against both the player and the surface. Choose suitable team mark variants, including dark-background variants where available, and compare the real assets at their rendered size.

Use a single identity component for table rows, headers, selection lists, game logs, and mobile cards, with explicit size variants. Normalize apparent logo size without forcing every logo into the same distortion. League marks belong beside sport labels. Book marks belong beside their corresponding price; no price means no misleading branded offer.

Preserve meaningful branding while avoiding decorative color proliferation. Outlier's wordmark, promotional 3D art, and illustrative example names are not required for Sportslab's identity.

## 8. Additional flows studied

The folder also documents arbitrage and middle-bet allocation, boost detail, book selection, multi-step sportsbook handoff, QR continuation, success/restore, selected-pick sharing, public shared-pick pages, expired links, profile/preferences, saved templates, onboarding, subscriptions, referral, email and notification prompts (102–157).

These flows reuse the same building blocks: grouped event/market cards, bounded overlays, small inline brands, a single clear footer action, visible progress where necessary, and explicit selected/disabled states. They are reference material for later matching features, not an instruction to add unrequested betting, account, payment, or marketing functionality now.

## 9. Suggested architecture for this project

This section proposes our implementation; it does not describe Outlier's private architecture.

- **Design tokens:** a single authoritative palette, typography scale, spacing scale, radii, borders, state treatments, and motion preferences.
- **Layout primitives:** desktop navigation rail, compact masthead, toolbar, data board, research main/aside, mobile card/sheet shell.
- **Control primitives:** button variants, icon button, tabs, segments, popover, select/combobox, checkbox/switch, date picker, range/stepper, dialog, disclosure.
- **Data presentation:** player/team identity, book-price cell, rate cell/strip, comparison table, history chart, game-log row, supporting-stat panel.
- **Filter model:** shared schema with separate discovery and research scopes; drafts, validation, normalized values, active summaries, reset, apply and result counts.
- **Capabilities:** sport/market-specific navigation, markets, units, sample filters, and research panels backed by actual data availability.
- **View state:** preserve selected sport, date, market, player, sort, filters, and return position across expected navigation; maintain URLs where already supported.

The existing project uses browser modules and shared CSS. A framework rewrite is not necessary to implement this. Before editing, inspect the current shared controls and preserve working data behavior. Consolidate styles and primitives rather than adding another layer of page-specific overrides.

## 10. What must change in the next design pass

1. Match page type to page type: board against board, research against research, open filters against open filters. Do not compare our giant player detail stack to a reference table and call it equivalent.
2. Fix the shell and visible content density before polishing shadows or gradients.
3. Use the desktop category/editor filter structure and its responsive mobile form when rebuilding the full filter experience.
4. Build distinct, repeatable control families. Avoid universal large pill buttons, oversized selected checks, inconsistent radii, and mixed native/custom panels.
5. Make research chart-first with compact controls and real right-column context.
6. Consolidate the accent system while preserving semantic outcome and brand colors.
7. Remove redundant explanatory microcopy; maintain useful source/timing detail through appropriately scoped disclosure when needed.
8. Verify player/team/book assets at actual display size, across teams and sports.
9. Finish every state: default, hover, focus, selected, expanded, saved, loading, no results, unavailable, invalid, and mobile.

## 11. Acceptance for future implementation

Compare screenshots at the same viewport and browser zoom. Crop away the presentation background/browser/phone frame in the reference conceptually; do not measure those as application padding. Keep an explicit reference ID beside each implementation screenshot.

- At desktop sizes, the board has useful dense rows above the fold, consistent columns, compact controls, and the intended sidebar proportion.
- Player research exposes the main visualization without scrolling through several oversized headers; its supporting column aligns with it.
- Full filters show category selection, a focused editor, active summaries, and clear apply/reset behavior; mobile sections remain usable.
- Menus/calendars open within the viewport, preserve selection, close predictably, and work by keyboard.
- Portraits are proportionate; badges remain in the intended overlapping position; dark logos remain legible; sportsbook marks sit beside actual prices.
- One neutral/teal control system is used across all supported pages. Semantic chart and brand colors remain intentional.
- Sport switching updates navigation, filters, markets, labels, units, and panels together.
- Empty/missing data never becomes fabricated sample bars, odds, ranks, or distribution histograms.
- Changing filters, selecting dates, saving/removing a pick, navigating to research/back, and changing chart samples remain functional.
- Mobile has deliberate cards/sheets and no clipped dropdowns, blocked primary actions, or page-wide horizontal overflow.

Study completed; **no application source, styles, or runtime behavior was changed during this review**. The next step is implementation only when the user continues.

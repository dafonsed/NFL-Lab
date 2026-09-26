# Sportslab workspace structure

Implemented September 23, 2026, using `outlier-reference-study.md` as visual guidance. Sportslab keeps its own navigation, models and data capabilities.

## Shared shell

- One compact masthead owns the title, page actions, sport switcher and display settings on every internal route.
- A quiet, neutral sidebar uses `navigation.js` as its sport capability map. Model and Trends remain separate destinations; MLB never inherits NFL Performance.
- Mobile replaces the sidebar with bottom navigation and a More sheet. Sport choices and market choices scroll within their own rows.
- Black/charcoal surfaces, purple actions, restrained dividers and tabular numbers are shared. Outcome colors and authentic team/book identities retain their meaning.
- Existing controls are moved, not cloned; original form state, IDs, event handlers and data calculations remain authoritative.

## Page composition

| Workspace | Structure |
| --- | --- |
| Overview | Masthead, combined search/date/market toolbar, schedule and research links, player board |
| Model | Compact toolbar, underlined view navigation, aligned projection table; player research opens in its own compact dialog |
| Trends | Single toolbar and dense table on desktop, player cards on mobile; selecting a player replaces board chrome with chart and context |
| Live | Date/game controls, scoreboard, Game odds / Player projections tabs, source and methodology disclosures |
| Simulation | Compact horizontal setup toolbar, matchup summary, aligned metrics and distribution panels; stacked research panels on mobile |
| My picks | Tickets and Performance tabs; month and day selection connect the profit calendar to the ticket list |
| Model performance | Separate Pregame archive and Historical evaluation panels |
| Paper returns | Shared masthead and compact sport/period controls above the saved record |

## Controls and interaction

- Trends filters: centered desktop dialog with Performance, Players & teams, and Lines & odds categories. Mobile uses a bottom sheet with horizontal category tabs.
- Draft filter edits update the matching-player count; only Apply changes the board. Closing discards the draft. Invalid numeric ranges prevent Apply.
- Model filters use the same dialog layout with Board filters and Saved presets. Existing sport-specific filters and browser-local preset storage are retained.
- Game dates use custom calendar popovers. Ticket months use a 12-month picker with year navigation and the same visual treatment.
- Calendar and category tabs support keyboard navigation, selection states, Escape, input constraints and focus return.
- Research market navigation is underlined; time windows and over/under use compact segmented controls.
- Simulation input changes clear the previous run and show the selected matchup, not a permanent loading placeholder.
- Live feed failures show a useful empty state and refresh action; source details remain available without dominating the workspace.

## Implementation and validation

`workspace-ui.js` composes the existing page elements; `ui-theme.css` owns final shared skins and responsive composition. `trends-filters.js`, `trends-controls.js` and `calendar-control.js` own the custom controls. Data and model calculations are unchanged.

The accepted Trends board is the visual reference for page content as well as the shell: Model and Overview use its 55px desktop rows and 32px player portraits, compact inline sportsbook odds, restrained purple probability cells and small row actions. Archive records use the same player identity scale and table geometry. Live, Simulation, Paper returns and My picks share the charcoal panels, metric typography, divider treatment and control sizes. Mobile boards deliberately recompose into compact cards; they are not squeezed desktop tables. Repeated explanations live behind named disclosures or the masthead's About this data action.

Verification artifacts are in `.research/site-structure/`. Browser checks cover all six sport boards, player research, filters, presets, calendars, picks views, evidence views, live tabs and viewport widths 360, 390, 768, 1280 and 1440. Populated Live, Simulation and My picks layouts are additionally checked with fixtures confined to an isolated browser context. Model row and portrait measurements are compared directly with Trends. Provider-dependent pages are also checked in their unavailable/stale states; external feed success is not claimed by these layout checks.

## Black and purple refinement

The latest user direction supersedes the earlier teal palette. The shared accent is `#a78bfa`, with black and neutral charcoal surfaces, purple chart bars and selection states, and consistent purple mastheads. The landing page, favicon and mobile browser theme follow it. Team, league and sportsbook artwork retains its authentic colors; losses and cautions remain distinguishable.

The page audit removed duplicate overview links, repeated successful-feed messages, redundant chart captions, empty sportsbook breakdowns, empty paper metrics and repeated player explanations. Source receipts, model definitions and game details remain accessible through named disclosures. Methodology is a compact expandable index, and game-line tables pair team marks with matchup names. Empty schedules provide aligned date actions; simulation distinguishes loading, empty, ready and failed schedule states.

Custom dropdown wrappers now track the visibility of their native select, fixing duplicate controls and the WNBA Players / Rankings sort transition. Calendars, filter editors, dropdown menus, player dialogs and responsive controls use the same visual states.

Validation: 407 automated tests passed, general and simulation syntax checks passed, and the 28-route desktop/mobile audit reported no browser exceptions or page overflow. Additional browser checks cover model subviews, keyboard dropdown selection, source details, expandable methodology, logo alignment, and simulation empty/error states. Screenshots and results are in `purple-final`, `purple-secondary`, `verification` and `design-parity` under `.research/site-structure/`. The final player checks use the explicitly selected September 23 MLB date to avoid relying on the changing default schedule.

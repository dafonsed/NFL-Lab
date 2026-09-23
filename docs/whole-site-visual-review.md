# Sportslab — whole-site visual review

Completed September 23, 2026 against the local application at `http://127.0.0.1:3131`.

This pass reviewed the rendered product beyond its first viewport and kept the existing black, blue and cyan design. It changed frontend presentation and interaction only. Existing models, odds calculations, source contracts and saved records were preserved.

## Observed defects and implementation

| Area | Observed issue | Implemented correction | Verification |
|---|---|---|---|
| Research, all six sports | Primary date/week controls were inside secondary options; several layers of disclosure repeated headings and borders | Date/week stays available above research; secondary controls use one menu; cleaner disclosure rows and SVG navigation icons | Six-sport navigation, selection, save, return and reload; desktop/mobile screenshots |
| NBA/WNBA/NHL/Soccer tools | Closed research-tools menu had an invisible desktop summary, making evidence actions inaccessible | Visible toggle in conventional views; remove redundant inner menu in player research | WNBA evidence and pregame-record dialogs opened, scrolled and closed at desktop/mobile widths |
| Live, four supported sports | Final games retained disabled comparison forms, empty model metrics and repeated warnings for every player | Compact final-stat records with expandable context; preserve actual zero versus missing values | Rendered values compared to API responses; refresh retained expanded context and focus for all four sports |
| Live game odds | Separate tables repeated headers and displayed several empty columns while models were withheld | One table per sportsbook; retain all available markets/prices and the actual withholding reason | Unit coverage and browser review; in-progress comparison workflow also rechecked |
| Trends | Legend colors did not match chart bars; tied/unpriced results lacked accurate legend labels; sample counts were hidden; archived prices called current | Matching above/below/tied/recorded-result legend, visible sample count, precise quote wording | Computed bar/legend colors compared; screenshots for six sports |
| Performance | Large diagnostic tables preceded the actual archive; row text buried values in raw identifiers and explanations | Archive first, aligned record columns, expandable estimate/source details; diagnostics remain available below | Filters, pagination, disclosures and mobile horizontal scrolling |
| Paper returns | Raw market/model identifiers and a dense records table | Readable market names, explicit model over/under labels, prices and outcomes separated; detailed model version retained | Period changes, record details, model results and empty MLB period |
| My picks | Empty dashboard led with unused metrics and filters | Focused first-ticket state; record controls return once populated | Isolated create/edit/reload/delete, validation, storage failure, duplicate submission and unsaved changes |
| Simulation and Live directory | Repeated introductory copy, decorative rows and inconsistent icons | Compact sport links and simulation setup; inputs/limitations remain accessible | NBA/MLB simulation runs, result charts, unsupported sports, responsive review |
| Mobile | Narrow data-note strip; archive horizontal scrolling unclear; research header alignment drifted | Responsive disclosure width, corrected heading flow, scroll hints and focusable archive table regions | 390/360 px review and workflow checks |
| Bet-entry dialog | Long-form footer and newly simplified empty page required regression review | Preserved independent body scroll and footer; fixed empty-page selector so it cannot hide Add leg inside the dialog | One/multiple legs, manual and game tracking, errors, Escape, focus return and reduced-height viewport |

## Coverage and evidence

- Browser route sweep: **38 route/dialog states × five viewport sizes**: 1440×900, 1280×800, 768×1024, 390×844 and 360×800.
- Research and Trends: NFL, MLB, NBA, WNBA, NHL and Soccer. Additional views: NFL matchups, board, opportunity, movement and methodology; MLB matchups/watchlist; WNBA rankings.
- Live: directory and NFL/MLB/NBA/WNBA game odds and player views. Simulation: directory/default, four supported sports, plus NHL/Soccer unavailable states.
- Home research, Performance, NFL/MLB Paper returns, My picks, player detail, evidence, week selection, appearance controls and bet-entry dialogs.
- Screenshots include top, middle and bottom desktop positions, mobile pages and expanded dialog states. They were visually inspected, not only checked for successful navigation.
- Before/after gallery: [comparison](../.research/whole-site-review/comparison.html).
- Final route evidence: [route results](../.research/product-polish/whole-review-final/results.json).
- Additional workflow evidence: [workflow results](../.research/whole-site-review/workflows.json).

## Verification

- `npm run check`: passed.
- `npm run check:simulation`: passed.
- `npm test`: **368 passed, 0 failed**. Three focused tests cover final-record missingness/escaping, withheld odds layout and presentation labels. The existing Live directory test now checks the new whole-row links.
- **34 browser workflow groups passed**: 11 ticket/live checks, eight research checks, four shell/appearance checks, two simulation-result checks and nine additional archive/Trends/final-record/evidence checks.
- Route sweep found no page-wide overflow, open-dialog horizontal overflow, JavaScript exceptions or console errors in the tested states.
- No build, typecheck or lint script is defined for this plain JavaScript application; the available syntax and test commands were used.

## Limits

Verification used Chromium. Physical-device keyboards and Safari/Firefox were not tested. Short-height mobile viewports were used to check footer reachability. Controlled fixtures covered an in-progress refresh failure and MLB extra-innings/provider-transition states; real API responses covered final games. This does not certify future provider states or every player record. No production deployment was performed.

No known blocking frontend defect remained in the tested workflows. Backend/model work already present in the working tree was not changed as part of this pass.

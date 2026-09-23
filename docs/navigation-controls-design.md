# Sidebar and controls

The sidebar is now an inset panel with the same dark materials, rounded edges and restrained blue/violet light as the interactive controls. Its navigation scrolls below the fixed logo, so short windows retain access to the bottom links. The tablet icon rail retains accessible names. Mobile navigation uses the same visual treatment.

The shared interaction section and `--ui-*` tokens in `public/app-design.css` define:

- Blue/violet primary actions, dark secondary capsules, and distinct destructive actions.
- Circular icon buttons, white selected segments, rounded market tabs and consistent saved states.
- Rounded fields, checkboxes, disclosure controls, hover treatments and visible keyboard focus.
- Matching Appearance controls and preferences, with reduced motion respected.

Clickable records retain their information layout. Chart outcomes retain green/red semantics. No calculations, data sources or stored record formats changed.

[Before/after gallery](../.research/control-system/comparison.html) · [Desktop](../.research/control-system/after/research-1440.png) · [Mobile](../.research/control-system/after/research-390.png) · [Appearance](../.research/control-system/after/appearance.png) · [Bet dialog](../.research/control-system/after/bet-dialog.png)

## Verification

- `npm run check`, `npm run check:simulation`: passed.
- `npm test`: 359 passed, zero failed.
- 4 focused browser workflows: sidebar scrolling and navigation; hover/focus and saved preferences; tablet accessible labels and mobile icon alignment; mobile menu and narrow bet dialog.
- 8 research/Trends workflows passed across all six sports.
- 11 editor/Live regression workflows passed with isolated browser records and labeled failure fixtures.
- 38 route/dialog states checked at 1440 × 900, 1280 × 800, 768 × 1024, 390 × 844 and 360 × 800, with no detected page overflow, page errors or console errors; detailed results are in `.research/product-polish/controls-final/results.json`.

Screenshots and workflow outputs are in `.research/control-system`. Verification uses Chromium; physical mobile keyboards, Safari and screen readers were not tested. Changes are local, not deployed.

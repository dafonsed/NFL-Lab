# Independent review of the shared mobile changes

Reviewed the current `mobile-workspace.js/.css`, `workspace-ui.js`, `dashboard-navigation.js`, `lib/http-compression.mjs`, and `live-utils.js`, plus their actual callers. Verification used authenticated local pages at `127.0.0.1:3201`, Chromium and WebKit, with the isolated temporary test account. The research chart used the application's loaded NFL history. Live state transitions used explicitly synthetic NFL/NBA responses, as documented in [the live audit](mobile-live-audit.md).

## Reproduced defects and fixes

| Priority | Reproduction / measured effect | Fix and verification |
|---|---|---|
| P1 | A live poll while the navigation drawer was open replaced `history.state` with null on both NFL and NBA pages. The drawer's history entry could then remain after closing. | Live URL updates and live-panel selection preserve the existing history state. A synthetic automatic poll retains `workspaceNavigation=true`; closing consumes that entry in both engines. |
| P2 | `--mobile-viewport-height` set on html was overridden by `100dvh` on body. A simulated 400px visual viewport still gave the expanded dialog an 820px maximum height at an 844px layout viewport. | Removed the body override. The existing fallback remains on each consumer. Both engines now inherit 400px and compute a 376px dialog maximum. This is a CSS inheritance test, not a physical keyboard claim. |
| P2 | WebKit tapping the drawer launcher did not focus it. Capturing `document.activeElement` therefore captured body, so closing failed to return focus to the launcher. | Return focus explicitly to the visible drawer launcher. Browser Back closes the drawer, unlocks main, keeps the URL and focuses the launcher in both engines. |
| P2 | The expanded chart moved its comparison slider outside the research dialog's delegated handlers. The visible slider advertised adjustment but ArrowUp did nothing (0.5 to 0.5). | Expanded view now presents an explicitly labeled reference line and a visible instruction to close the chart to adjust it. The dead slider handle is removed from touch/focus interaction. Bar details remain interactive. Closing restores all original slider attributes; ArrowUp then changes 0.5 to 1 in both engines. |
| P2 | Live Confirm line measured 32px tall and number input 38.4px, because the theme overrode the initial mobile minimum. | Scoped mobile minimum height now wins: both are 44px in both engines. The pause checkbox's associated label and Projection inputs disclosure are also 44px tall. |

The expanded chart retains the same node and original parent. Closing retained parent scroll at 531px in Chromium and 532px in WebKit and focused Expand chart. Browser Back closed only the expanded chart, leaving player research open on the same route. Opening Appearance from the drawer released inert page content, and Back closed Appearance without changing route. No browser page errors occurred in these journeys.

## Compression and utility review

The public response helper's existing unit checks pass for explicit gzip opt-out, public/API boundaries, exact decompression, cache policy, account exclusions and HEAD. A separate real HTTP check of `/style.css` measured 50,896 identity bytes and 9,836 gzip bytes; decoded bytes matched exactly. `gzip;q=0, *;q=1` returned the original bytes, Content-Length matched each representation, Vary included Accept-Encoding, and Cache-Control stayed no-cache. HEAD emitted zero body bytes. No compression source change was necessary. Account/auth responses use their separate `accountJson` path, outside this helper.

The stable ordering utility preserves prior player order, appends arrivals, and removes missing players. The display-revision utility intentionally ignores receipt/provenance timestamps; a same-content live response keeps the original player DOM, input value, focus and scroll. A changed projection still invalidates the displayed comparison. These are covered by the existing utility tests and the synthetic live browser run. No additional utility source edit was necessary.

## Names, targets and contrast samples

The tested number inputs have the associated labels “Your full-game receiving yards line” / “Your full-game points line”, the action reads “Confirm line”, and each pause checkbox has a full clickable explanatory label. Number inputs render at 16px. Measured mobile targets: number input 44px, Confirm 44px, pause label 44px, disclosure 44px. The checkbox box itself remains 20 × 32px, within that 44px label target.

Computed foreground/background samples on the synthetic NFL and NBA cards gave 15.75:1 for player name, 6.12:1 for muted supporting text and value labels, 5.19:1 for EXPERIMENTAL, and 15.44:1 for Confirm. These are selected text samples with composited flat backgrounds, not a complete automated accessibility certification. Native screen reader, device keyboard, and every focus/disabled/placeholder color were not audited in this pass.

## Evidence and reproduction

- [Chromium shared review results](../artifacts/mobile-audit/shared-review/chromium/results.json)
- [WebKit shared review results](../artifacts/mobile-audit/shared-review/webkit/results.json)
- [Expanded chart in WebKit landscape](../artifacts/mobile-audit/shared-review/webkit/chart-landscape.png)
- [Compression transport result](../artifacts/mobile-audit/shared-review/compression.json)
- [Chromium live results including history, targets and contrast](../artifacts/mobile-audit/live-synthetic/chromium/results.json)
- [WebKit live results including history, targets and contrast](../artifacts/mobile-audit/live-synthetic/webkit/results.json)

```text
node scripts/mobile-shared-review.mjs chromium
node scripts/mobile-shared-review.mjs webkit
node scripts/mobile-compression-review.mjs
node scripts/mobile-live-audit.mjs chromium
node scripts/mobile-live-audit.mjs webkit
node --test test/dashboard-navigation.test.mjs test/http-compression.test.mjs test/live-mobile.test.mjs
```

The focused unit command passed 15 tests. Both shared-shell browser journeys and both synthetic live runs passed; syntax checks passed for the edited JavaScript. Live screenshots cover 320px, 390px, 667px landscape and 1440px. Shared chart checks cover 390px portrait and 667px landscape, including a synthetic 400px viewport-height value.

This review changed small sections of `public/mobile-workspace.js`, `public/mobile-workspace.css`, `public/dashboard-navigation.js`, `public/live.js`, `public/live-sports.js`, and `public/product-ui.js`; it added `scripts/mobile-shared-review.mjs`, `scripts/mobile-compression-review.mjs`, and extended `scripts/mobile-live-audit.mjs`. Concurrent shared-shell changes elsewhere in those files were preserved. The main audit owns the full files and its broader report. The expanded chart deliberately requires returning to inline research to change the comparison line.

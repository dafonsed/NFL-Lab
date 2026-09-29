# Live mobile stability verification

## Scope and test conditions

Verified 2026-09-28 on the real authenticated local app (`http://127.0.0.1:3201`) using the isolated account fixture and its temporary session state. This is **synthetic API-response verification**, not evidence that an upstream live sports or sportsbook feed was available.

`scripts/mobile-live-audit.mjs` intercepts only `/api/nfl/live` or `/api/nba/live`. It supplies eight clearly named synthetic players and inputs adapted from `test/live-nfl.test.mjs` / `test/live-sports.test.mjs`. Initial projections are calculated by the real `projectLiveProp` / `projectBasketball` model functions. The changed-order scenario deliberately replaces one synthetic projection with 200 to challenge display ranking; it is not a forecast claim. The real page HTML, scripts, CSS, authentication and browser event handlers remain in use.

The tests use a controlled browser clock for 15-second refreshes and 60 seconds offline. They ran in Chromium and Playwright WebKit at 390×844 with mobile/touch emulation, plus captures at 320×740, 667×375 landscape and 1440×1000. These are not physical iOS Safari or Android Chrome runs.

## Results

| Scenario | NFL Chromium / WebKit | NBA Chromium / WebKit |
| --- | --- | --- |
| Enter 42.5 and confirm the line | Current comparison shown | Current comparison shown |
| Same response with newer receipt timestamp | Same player DOM node retained | Same player DOM node retained |
| Focus and draft during automatic unchanged update | `line-102`, value 42.5 preserved | `line-102`, value 42.5 preserved |
| Scroll during unchanged update | 1243→1243 / 1244→1244 px | 1211→1211 / 1212→1212 px |
| Projection changes enough to invert natural ranking | Existing player order 100…107 retained | Existing player order 100…107 retained |
| Focus and scroll during changed update | Preserved | Preserved |
| Changed game snapshot | Comparison requires line reconfirmation | Comparison requires line reconfirmation |
| Explicit stale response | Confirm disabled | Confirm disabled |
| Source age 46 seconds | Confirm disabled | Confirm disabled |
| Delayed/suspended game | Confirm disabled after model fix below | Confirm disabled |
| Paused player | Confirm disabled | Confirm disabled |
| Synthetic HTTP 503 with saved snapshot | Confirm disabled; service-unavailable message generated | Confirm disabled; service-unavailable message generated |
| 60 seconds offline with auto enabled | Zero requests; old snapshot confirmation disabled | Zero requests; old snapshot confirmation disabled |
| Reconnect with auto disabled | No automatic request | No automatic request |
| Manual refresh after reconnect | Fresh snapshot restores confirmation | Fresh snapshot restores confirmation |
| Page errors / document overflow at checked widths | None | None |

The unchanged node assertion verifies the new `liveDisplayRevision` path avoids replacing the player card. Changed snapshots deliberately replace content, preserve drafts and focus, and keep established reading order through `stableLiveOrder`. Both the player-pause flow and source/clock freshness guards are exercised through real browser handlers.

## Validated defect and fix

**P1 — Fresh suspended NFL games continued projecting.** `normalizeSummary` already exposes `game.interrupted` for delayed/suspended states. Unlike basketball's model, `projectLiveProp` did not check that flag. The first synthetic browser run reproduced a finite NFL projection with an enabled Confirm button while the game was suspended (`suspendedDisabled: false`).

Fixed `lib/live-nfl-model.mjs` to withhold future production when `game.interrupted` is true. Recorded statistics remain visible; projection and remaining production become `null`, with a clear delayed/suspended explanation. Added a regression in `test/live-nfl.test.mjs` for delayed/suspended receiving yards and combined rushing/receiving yards, plus recovery when interruption is cleared. The final browser run asserts disabled confirmation and passes in both engines.

Independent review also identified an existing stylesheet rule in `public/reference-design.css` that hides `#feed-status` unconditionally. The page still marks player cards **STALE ESTIMATE**, but hiding the feed-level status weakens the distinction between an outage and an empty slate. This was reported to the main audit owner for the shared mobile stylesheet fix. The generated error text is asserted in the DOM; this focused test does not claim that every legacy warning is visibly rendered.

## Evidence and reproducibility

- [Chromium results](../artifacts/mobile-audit/live-synthetic/chromium/results.json)
- [WebKit results](../artifacts/mobile-audit/live-synthetic/webkit/results.json)
- [NFL changed snapshot with focused input](../artifacts/mobile-audit/live-synthetic/chromium/nfl-changed-focused.png)
- [NFL suspended player with withheld projection](../artifacts/mobile-audit/live-synthetic/chromium/nfl-suspended-player.png)
- [NBA stale state](../artifacts/mobile-audit/live-synthetic/webkit/nba-stale.png)
- [NBA suspended player](../artifacts/mobile-audit/live-synthetic/webkit/nba-suspended-player.png)
- [NFL recovered at 320px](../artifacts/mobile-audit/live-synthetic/chromium/nfl-recovered-320.png)
- [NBA recovered in landscape](../artifacts/mobile-audit/live-synthetic/webkit/nba-recovered-667.png)

Run after starting the isolated server and generating its temporary authenticated session:

```text
node scripts/mobile-live-audit.mjs
node scripts/mobile-live-audit.mjs webkit
node --test test/live-nfl.test.mjs test/live-sports.test.mjs test/live-mobile.test.mjs
```

The unit command passes **38 tests**. Existing fixture tests intentionally log two invalid injury-response warnings while testing provider failures; they are not browser errors or real provider incidents.

## Limits

This proves the client state transitions and the interrupted NFL model guard under controlled responses. It does not establish upstream availability, real ingestion latency, high-volume stream throughput, calibrated forecasts, successful sportsbook execution, or physical-device keyboard behavior. The NBA run exercises `live-sports.js`; MLB and WNBA share that controller but were not directly replayed by this focused fixture. The unit suite covers their model-specific behavior. No production data or sportsbook action was changed.

Files changed by this focused follow-up: `lib/live-nfl-model.mjs`, `test/live-nfl.test.mjs`, `scripts/mobile-live-audit.mjs`, this report and its generated artifacts. The main audit owns the `live.js`, `live-sports.js` and `live-utils.js` stability changes verified here.

## Independent shared-shell follow-up

The live fixture now also holds navigation open during an automatic poll. This exposed and fixed URL updates that erased the drawer's history token; both engines now preserve it and consume it on close. Scoped CSS fixes made the live input and Confirm action 44px tall, with 16px input text. Updated results include these assertions and selected text contrast samples (minimum 5.19:1). See the [shared mobile review](mobile-shared-review.md) for the exact reproductions, additional chart/drawer fixes, file ownership and limits. Player scroll positions changed slightly because controls grew; unchanged and changed snapshot tests still preserve each captured position.

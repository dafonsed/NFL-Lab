# Bet tracker: calendar and screenshot import

The personal tracker at `/bets` now uses the Sportslab black/cyan visual system with a monthly profit calendar, cumulative profit chart, monthly accounting, sportsbook breakdown, and a filterable ticket ledger. Calendar days open the corresponding tickets. Calendar accounting groups records by **date placed**, and continues to use the existing `bet-utils.js` calculations. Open, refunded, profitable and losing days remain distinct.

Screenshot import reads PNG/JPG/WebP files locally with a self-hosted Tesseract engine. The screenshot is neither uploaded nor persisted. Recognized fields become an editable draft, including combined ticket odds and individual parlay selections. The original image remains available while reviewing the form. Nothing is saved until the user confirms the ticket. Missing fields remain blank, results start open, and game/player IDs are never inferred from text. Imported selections initially use manual results; existing connected tracking remains available.

## Verification checklist

| Area | Result |
| --- | --- |
| Monthly accounting, calendar day filters, month/year boundaries and leap years | Passed |
| Existing accounting, grading, persistence and model regression suite | 386 tests passed |
| Existing syntax-check command | Passed |
| Real OCR of a light single and dark two-leg parlay screenshot | Passed in Chromium; synthetic receipts explicitly labeled as test data |
| Stake, odds, sportsbook, date, player lines and milestone prefill | Passed; combined odds preserved rather than calculated from leg prices |
| Import review, create/edit/delete, calendar updates, CSV and filters | Passed with isolated browser records |
| Invalid/oversized/corrupt images, missing date, missing leg line and text fallback | Passed |
| OCR cancel, Escape, focus return, focus trapping, dirty-form protection | Passed |
| Existing Quick Search and Pick a game flows, no results, automatic result refresh | Passed with an isolated provider fixture; no new provider integration |
| Storage write failure and retry, unreadable records | Passed; existing records preserved |
| 1440×900, 1280×800, 768×1024, 390×844, 360×800 | Browser reviewed; no page-wide horizontal overflow; modal footer and final fields reachable |
| Browser errors in the verified flows | None |
| Import network behavior | Same-origin engine/language assets only; no image upload or API extraction |

Browser evidence is retained locally in `.research/bet-redesign/`: before/after screens, calendar views, import review, the mobile parlay editor, and JSON verification results. Example profit amounts are isolated QA records, never production/demo records added to a user's tracker.

## Practical limits

- OCR is best effort, optimized for clear English receipts. Review every field; cropped, low-resolution or unusual layouts can need correction. Two receipt layouts were exercised with actual image recognition, not every sportsbook's possible format.
- PNG/JPG/WebP input is limited to 12 MB and 24 megapixels. HEIC/PDF must be converted first. The text correction path remains available if image reading fails.
- Promotional payouts and settled receipts require manual result/return review. Import does not automatically grade outcomes or connect players to provider IDs.
- Existing browser-local storage and lack of device sync are unchanged and disclosed. Screenshots are discarded after review.
- Desktop Chromium with mobile viewport/touch emulation was used; physical iOS/Android keyboards were not tested.

The pinned OCR assets and licenses are in `public/vendor/ocr`; regenerate with `node scripts/vendor-bet-ocr.mjs` after installing the locked development dependencies. WebAssembly permission is limited to the OCR worker response.

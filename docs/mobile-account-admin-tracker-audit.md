# Mobile account, admin, tracker and performance audit

Audit date: September 28, 2026 UTC. This is the account/admin/tracker portion of the broader mobile implementation. The active application is the Node server and `public/`, not any `sites-*` export.

## Scope and test conditions

- Captured the initial rendered state of 31 routes at 390 × 844 before these edits. See `reports/mobile-account-admin-tracker/before.json` and matching `before-*.png` files.
- Final width sweep: 320, 360, 375, 390, 430 and 768 CSS pixels; 667 × 375 landscape; 1440 × 1000 desktop. Chromium and WebKit desktop engines with touch enabled and reduced motion. These are browser emulations, not physical iOS Safari or Android Chrome devices. Actual OS keyboard, autofill/password-manager overlays and installed-PWA behavior remain device checks.
- Customer account tests use the account implementation's explicit in-memory test server on localhost:3201 and its verified Pro fixture. No production accounts, emails, purchases, access grants, account deletions or payments were changed. Session storage remains in the OS temporary directory, outside the project.
- Tracker density tests seed 120 synthetic tickets in that ephemeral account through the real authenticated account-data API, including a long player selection, +12500 odds, a $10,000 stake, 6 sports, multiple books/tags and settled/open records. These are not actual customer bets or live betting opportunities.
- Concurrent user-requested account/admin implementations were active during the audit. The initial broken module/routes were repaired by those implementations and root integration. The final synthetic admin catalog is `/admin-sandbox`; `/admin/accounts` is now the distinct protected real account-management surface. Do not equate sandbox personas with authenticated staff permissions.
- Verification snapshot times on September 28 UTC: Pro account05:29; account/admin sweep05:29; performance archive05:34; tracker journey05:37; controlled-feed journey05:38. JSON and screenshot evidence reflect the code/server at those times; concurrent backend work after them requires its own checks.

## Inventory and route findings

Severity: P1 blocks a workflow or obscures decision data; P2 materially impairs mobile use; P3 polish. Initial route names are retained to make screenshot matching unambiguous.

| Route (final) | Source | Initial finding and severity | Implemented / verified |
|---|---|---|---|
| `/login` | `login.html`, `auth.js`, `account-client.js`, `auth.css`, account styles | P1 missing account-client.js blocked form module; P2 marketing story preceded the form and 14px inputs invited keyboard zoom | Root/account author wired assets. Independent account-mobile.css puts form first, 16px inputs, 44px password controls and wrapped options. Logged-out width sweeps; no real credentials submitted. |
| `/register` | `register.html`, same auth modules | P1 missing client module; same phone hierarchy/input issues | Same styles; consent remains visible. Production registration/email delivery not asserted. |
| `/forgot-password` | `recovery.html`, `recovery.js` | P1 returned404 initially | Account author exposed actual route. Narrow recovery layout and keyboard sizing; delivery requires configured service. |
| `/reset-password` | recovery files | P1 returned404 initially | Invalid/missing link state rendered; token completion covered by separate account implementation, not claimed here. |
| `/verify-email` | recovery files | P1 returned404 initially | Recovery route and errors render at all widths. No real verification email sent. |
| `/two-factor` | recovery files | P1 returned404 initially | Authenticator/recovery-code form accessible at phone widths. Physical authenticator challenge not completed here. |
| `/account` | `account.html`, `account.js`, `account-sync.js`, account styles | P1 route absent; account-system.css absent at initial inspection | Account implementation integrated. Pro account, all sections, reauthentication cancel and deletion guards verified with real ephemeral session; 8 widths, both engines. Billing unavailable message retained. |
| `/admin/accounts` | `admin-accounts.html`, `admin-accounts.js`, account backend | Did not exist as a protected rendered staff surface at baseline | Customer request to staff API returns403. New connected-staff addendum below covers actual owner login/MFA, populated accounts, details and canceled guarded actions in an isolated database. |
| `/admin/operations` | `admin-operations.html/js`, `admin-confirmation.js`, `admin-connected.css` | Added by the concurrent admin implementation after the initial audit | Connected support queue, notices and EV distribution controls inspected with a real test owner session and synthetic inventory. New addendum below. |
| `/support` | `support.html/js`, account and connected-admin styles | Added after initial audit; introduces customer support reports including grading disputes | Real test-customer report submission, populated report list and notices layout checked in the isolated fixture. New addendum below. |
| `/bets` → `/ev/tracker` | `bets.html`, `bets.js`, `bet-dashboard-v3.js`, tracker CSS, bet-editor/legs/utils | P1 missing account-sync.js broke module; P1 booked odds display:none on phones; P2 194px minimum tickets; P2 volatile demo claimed persistent browser storage; P2 repeated full-list replacement/reset work | Restored dependency integration; compact mobile tickets keep prices/selection/book visible. Truthful account/demo copy; 40-ticket explicit pagination; search/export still cover full filtered ledger. Keyed DOM reuse, stable sort timestamp during live checks, batched filter resets, chart height reservation and WebKit resize-loop fix. |
| `/performance` (Dev mode) | `performance.html`, `performance.js`, `forecast.css`, `performance-mobile.css`, shared shell | Initial module blocked by account-sync.js; this route is historical NFL model evidence, not personal P&L | Dedicated phone table behavior and export timeout. Personal profit/ROI/CLV remain in tracker. Dev-mode gate preserved. |
| `/admin-sandbox` (initial `/admin`) | `lib/admin-page.mjs`, `admin.js/css/store/catalog` | P2 tiny operational text/controls; mobile drawer remained keyboard-focusable when closed | Legible mobile controls, inert closed drawer, focus trap/restoration, safe dialog sizes, synthetic environment kept visible. |
| `/admin-sandbox/users` | shared admin files, users catalog | P1 document width680px at390 | Contained scroll region, sticky record identity/status, focused inspector; account actions still simulated. |
| `/admin-sandbox/billing` | shared admin, billing catalog | P1 document width811px | Same table/detail fix. Charges/refunds are not connected. |
| `/admin-sandbox/sources` | shared admin, sources catalog | P1 document width719px | Same fix; source inspect/edit/cancel tested, reason/approval forms preserved. |
| `/admin-sandbox/events` | shared admin, events catalog | P1 document width681px | All widths and both engines. |
| `/admin-sandbox/quality` | shared admin, quality catalog | P1 document width696px | All widths and both engines; stale-line details remain sample evidence. |
| `/admin-sandbox/ev` | shared admin, EV catalog | P1 document width705px | All widths and both engines. |
| `/admin-sandbox/arbitrage` | shared admin, arbitrage catalog | P1 document width733px | All widths and both engines. |
| `/admin-sandbox/fantasy` | shared admin, fantasy catalog | P1 document width733px | All widths and both engines. |
| `/admin-sandbox/links` | shared admin, links catalog | P1 document width726px | All widths and both engines. |
| `/admin-sandbox/grading` | shared admin, grading catalog | P1 document width673px | All widths and both engines; reason/reviewer workflow retained. No real bets graded. |
| `/admin-sandbox/clv` | shared admin, CLV catalog | P1 document width810px | All widths and both engines. |
| `/admin-sandbox/wallets` | shared admin, wallets catalog | P1 document width759px | All widths and both engines. |
| `/admin-sandbox/lineups` | shared admin, lineups catalog | P1 document width850px | All widths and both engines. |
| `/admin-sandbox/notifications` | shared admin, notifications catalog | P1 document width695px | All widths and both engines. No emails/push/Discord sent. |
| `/admin-sandbox/content` | shared admin, content catalog | P1 document width734px | All widths and both engines. |
| `/admin-sandbox/support` | shared admin, support catalog | P1 document width821px | All widths and both engines. Production support reports are not connected. |
| `/admin-sandbox/system` | shared admin, system catalog | P1 document width754px | All widths and both engines; outage/replay/rollback are synthetic records. |
| `/admin-sandbox/admins` | shared admin, admins catalog | P1 document width764px | All widths and both engines; persona restriction tested separately from real staff API403. |
| `/admin-sandbox/security` | shared admin, security catalog | P1 document width730px | All widths and both engines. Sandbox audit log is not production security evidence. |
| `/admin-sandbox/reports` | shared admin, reports catalog | P1 document width736px | All widths and both engines. CSV remains an explicit action. |

Admin document overflow was caused in part by absolutely positioned screen-reader labels escaping the scroll container; positioning the scroll region fixed the containing block instead of hiding body overflow. Visible horizontal-scroll hints, keyboard-focusable regions and a sticky identity/status column keep records comprehensible. At small widths the dedicated inspector shows all fields without a desktop table.

## Changes owned by this audit

- `public/account-mobile.css`: independent responsive extension included by the account author in login/register/recovery/settings/staff pages; form-first mobile order, touch/keyboard dimensions, safe-area spacing, wrapping, dialogs and focus.
- `public/admin.css`: appended mobile overrides, deliberate horizontally scrolling tables, readable mobile text, sidebar safe areas, 44px controls and viewport-aware dialogs. Existing desktop rules retained.
- `public/admin.js`: inert hidden navigation/background, keyboard trap and focus restoration, accessible dialog heading and explicit non-submit close button, visualViewport sizing, table scroll names/hints and mobile record status. The concurrent admin author preserved these changes when moving routes.
- `public/bet-tracker-reference.css`: compact natural-height tickets, visible booked odds, long amounts/names, larger controls/inputs, confirmation dialogs, chart space reservation, explicit Show more and scroll margins below shell chrome. Final interaction testing caught sports navigation and Add bet sharing grid row 2; navigation now has its own row 3 on phones, preserving both controls.
- `public/bets.js`: explicit 40-item pages; full-ledger search/filter/export; preserved unchanged ticket DOM/disclosures; filter-reset batching; no result-update modification of ticket sort time; scroll anchor during live result changes; skip unchanged snapshot writes; truthful storage text.
- `public/bet-dashboard-v3.js`: coalesces width-only resize updates into animation frames, eliminating the observed WebKit ResizeObserver loop. Large chart-axis amounts use compact currency labels so $1.25 million does not clip beyond the left edge; the overview and accessible chart description retain exact values.
- `public/performance.html`, `public/performance-mobile.css`, `public/performance.js`: page-scoped phone table/control styles and source context; visible scroll hint; bounded existing requestData helper used for export requests.
- Browser harnesses under `scripts/mobile-account-admin-*.mjs`, `mobile-account-pro-verify.mjs`, `mobile-tracker-*.mjs`, and `mobile-performance-verify.mjs`; evidence under `reports/mobile-account-admin-tracker/`.

## Reproduction and evidence

1. Initial auth failures: navigate `/login` or `/register`, observe404 account-client.js; `/account` and recovery paths returned404. Initial tracker/performance imported404 account-sync.js. See before.json and before route screenshots. These are baseline evidence, not claims about the integrated final server.
2. Initial admin overflow: open any listed admin record route at390px; screenshot extends to673–850px. Compare `before-admin-sources-390.png` with `after-admin-sandbox-sources-390.png`. The final account-admin-verification.json contains zero document overflows in448 route/viewport/engine cases.
3. Initial tracker: see `before-bets-fixture-sample-390.png` and `before-bets-fixture-editor-390.png`. Those specific screenshots used browser-only anonymous-session/module routing because the initial server could not serve account-sync. They show the existing78-ticket permanent demo, not a signed-in account. Final `after-tracker-*`, `after-ledger-*` and `after-editor-*` show the authenticated synthetic120-ticket test account. Different data populations are explicitly not a pixel-identical performance comparison.
4. Account: `after-account-pro-{chromium,webkit}-{320,390,1440}.png`; `after-account-reauth-*-390.png`. Current Pro state is a test grant; billing provider unavailable remains explicit.
5. Admin inspector/edit: `after-admin-source-inspector-*-320.png`, `after-admin-source-editor-*-320.png`; no synthetic edits submitted in these screenshot checks.

## Verification and practical limits

- Existing tracker accounting, legacy migration, editor validation, CSV and result grading suite: 30 tests passed after changes.
- Tracker full user journey covers pagination, searching a ticket outside the first page, filter/clear/empty, expand and retained DOM, add/edit/tag, discard/keep editing, calendar selection and graph return. All writes are to the disposable test account.
- Final tracker journey passed in Chromium and WebKit at all 8 widths with no page JavaScript errors. `tracker-live-verification.json` additionally verifies changed live values, fixed booked odds, unchanged ticket order, retained unaffected receipt DOM, stable viewport anchor, stale-feed state remaining open/ungraded, and refresh suppression while hidden or editing. Result-feed responses and `document.hidden` are controlled browser fixtures; this is not a real long-running sports feed or physical background-app test.
- Account journey covers actual authenticated Pro settings, reauthentication modal/cancel, required deletion confirmation/acknowledgment, and denied customer access to staff API. No deletion, session revocation, MFA disable or purchase was performed.
- Admin sandbox: all21 sections render without document overflow across8 sizes in Chromium/WebKit; navigation inertness/focus, inspector, edit/cancel, search empty/reset and Support role restrictions pass. This is not production outage/feed/billing integration testing.
- Performance archive: final browser run loaded 53 actual local snapshots for 2026 week 3 and 12 tables. Both engines passed all 8 widths, contained horizontal scrolling/context, and controlled503 error/retry availability. Dev mode is intentionally required; fixture failures from attempting to interact before opening that gate were corrected in the harness.
- Native browser zoom is preserved. OS keyboard reduction is approximated by viewport resize and visualViewport sizing; physical-device keyboard/password-manager/PWA acceptance remains outstanding.
- Tracker has Open and Settled views plus individual leg live/review/unavailable states. The subsequent `/support` implementation now provides a grading-dispute category with an optional bet/market/snapshot reference. This is a general support report; the audit does not claim an automatic disputed-ticket link or regrading action inside the tracker. Editing the recorded result is also available.
- Real-user INP, mobile-device battery/thermal behavior, physical Safari/Chrome and long multihour live sessions are not measured here. Event Timing samples are lab interaction durations, not field INP.

## Performance measurements

Final post-compression measurements are stored in `tracker-verification.json`. Single local lab runs, a shared development server, synthetic ticket data and desktop engine emulation limit comparisons; these are not field Core Web Vitals or real-device INP.

| Measurement | Final normal Chromium | Final constrained Chromium |
|---|---:|---:|
| Conditions | 390 × 844, touch emulation | Same; 4× CPU, 150ms latency, 1.6Mbps download |
| Initial rendered ticket count | 40 of 120 | 40 of 121 after add/edit journey |
| Initial DOM elements | 3,103 | 3,106 |
| Encoded resource bodies | 848,838 bytes | 847,398 bytes |
| Resource requests | 79 | 79 |
| Navigation load | 833ms | 8,074ms |
| LCP at initial ticket readiness | 932ms | 7,740ms |
| CLS at initial ticket readiness | 0.02035 | 0.37395 |
| Filter apply to next animation frame | 29.5ms | 36.4ms |

The early unbounded 120-ticket ledger had 7,058 DOM elements. Showing 40 initially reduces that count by about 56%, while search/export still use all filtered tickets. Before compression the resource payload was about 2.03MB; the final payload is about 58% smaller. The prior constrained run took 11.8s load, LCP7.1s and CLS≈1.00: final load and CLS improved, but LCP did **not** improve in this single comparison and still misses the target. Constrained cold load and layout stability remain explicit P1 performance follow-up work; no claim of passing all Core Web Vitals is made.

Normal Chromium filter-open/expand measurements were 8.3/44ms; WebKit measured 187/25ms and 68ms for filter apply. Maximum Event Timing duration across the full interaction journey was 72ms Chromium and 400ms WebKit. These samples include browser scheduling/layout and are lab interaction durations, not an INP percentile. Initial WebKit readings were load253ms/LCP141ms/CLS0, which are engine-dependent and not a reliable cross-engine speed comparison.

Intermediate same-fixture measurements before chart space reservation observed initial normal Chromium CLS0.819, versus0.035 after reservation and0.02035 in the final run. Physical keyboard handling, long-session responsiveness and production field measurements remain unverified.

## Connected staff and support addendum — 05:49 UTC

The concurrent admin implementation subsequently added connected account records, `/admin/operations` and `/support`. They are distinct from `/admin-sandbox`. This addendum tests the new production code paths with the author's `test/helpers/admin-browser-fixture.mjs`: the actual application server, a fresh in-memory database, normal email/password sign-in followed by a real authenticator challenge, and explicitly injected synthetic EV inventory. No production account, real notice, external message, upstream source or payment was touched.

Final evidence: `connected-admin-verification.json`, `connected-admin-{accounts,operations}-*-{320,390,667,1440}.png`, `connected-support-*.png` and `connected-dialog-*.png`. Reproduce with `node test/helpers/admin-browser-fixture.mjs`, then `node scripts/mobile-connected-admin-verify.mjs <printed-loopback-launch-URL>`. The launch page and browser sessions contain disposable credentials; no session material is stored in the repository.

| Surface | Verified at final snapshot |
|---|---|
| Connected page widths | `/admin/accounts`, `/admin/operations`, `/support` at 320/360/375/390/430/768/667-landscape/1440 in Chromium and WebKit: 48 cases, zero document overflow, no page JavaScript errors. |
| Staff operations | Populated support queue, notice drafts and market-control cards with long content. Create support, create notice, inspect/update report, publish confirmation and suppress-feed confirmation fit 320×568 and 320×320; cancel restores the invoking control. These staff changes were canceled. |
| Account details/actions | Real customer detail, contained audit history, suspension and access-grant confirmation. Role-change dialog tested against the MFA-enabled candidate because the ordinary customer correctly does not expose that action. All three confirmations canceled at 320×320; focus restoration verified. |
| Customer report | A long grading-dispute report with an optional reference was submitted through the actual customer form and persisted in the fixture database. Staff list displayed the report. No notification was sent. |
| Permissions | Customer request to staff capabilities returned403. Owner authentication completed normal MFA. Browser checks do not replace the backend role/reauthentication tests. |
| Audit records | Named keyboard-focusable horizontal scroll region; mobile scroll hint and sticky first action column retain row context. Detail dialog has no internal horizontal overflow. |

Additional narrow changes preserve the author's workflows: `account-mobile.css` gives phone navigation/brand targets44px, expands internal-note summaries, adds safe-area dialog padding, and improves audit-table readability/context. `admin-accounts.js` adds a named `tabindex=0` audit region. Both account and operations dialogs now receive explicit opener elements, making focus restoration deterministic when pointer input does not focus the invoking button. The WebKit harness waits for the native dialog close event before checking focus; an earlier immediate assertion was a test timing race.

The final phone target sweep found no visible enabled button/link/input/select below43px in height at 320–430px (the acceptance target is44px, allowing subpixel rounding in measurements). The existing API and password-confirmation tests passed15/15: role/MFA/origin checks, customer ownership, private notes, optimistic versions, draft/publication windows, persisted market controls and reauthentication caching.

This audit opened and canceled publication/suppression/account-change dialogs; it does not claim those mutations were executed through the mobile browser. Their backend behavior is covered by the passing isolated tests, and the admin author's separate end-to-end publication workflow remains separate evidence. Physical device keyboards, screen readers and OS background behavior are still unverified.

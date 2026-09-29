# Unified connected admin workspace

`/admin` is the canonical staff dashboard. It uses the white admin navigation and layout with authenticated database-backed controllers. The navigation covers the full requested scope, but each area identifies its actual integration status. An unavailable area has an explicit explanation rather than sample records or a control that only stores an execution request.

## Routes and access

All connected pages use the existing staff session and MFA guard. The shared shell reads `/api/admin/capabilities` for the real identity and permission set; each data endpoint independently enforces permissions. There is no persona selector in the connected workspace.

| Canonical page | Data and controls | Required data permission |
| --- | --- | --- |
| `/admin` | Permission-aware account, support, content, and EV inventory overview | Any staff permission; each domain is checked separately |
| `/admin/users` | Account search, detail, and permitted access/security actions | `inspect`; each mutation also requires its action permission |
| `/admin/billing` | Subscription records and manual access grants | `inspect`; grant mutations require `grant` |
| `/admin/admins` | Staff directory, roles, security, and permitted account actions | `inspect`; role changes require `roles` |
| `/admin/security` | Bounded, sanitized account and operational audit history | `inspect` |
| `/admin/support` | Persisted customer reports, triage, assignment, and internal notes | `support` |
| `/admin/content` | Draft, schedule, publish, and archive plain-text customer notices | `content` |
| `/admin/sources`, `/admin/events` | Inspect local EV inventory and suppress or restore distribution | `data` |
| `/admin/reports` | Export the authorized current operational snapshot and numeric counts | Any staff permission; each exported domain is checked separately |

`/admin/accounts` and `/admin-accounts.html` render the Users view. `/admin.html` renders the overview. `/admin/operations` preserves a combined support, content, and EV controls view, restricted to the actor's permissions. These are compatibility renderings, not separate administration systems. Unknown admin sections return 404.

The sidebar labels remaining unimplemented services as not connected. Some connected areas are explicitly limited: billing does not issue refunds or set prices; EV controls do not stop upstream collection; content does not administer promotional billing offers; reports do not calculate revenue or historical traffic.

## What dashboard numbers mean

`GET /api/admin/dashboard` uses SQL counts and bounded projections of real records. Domains the actor cannot read are `null`. An unavailable authorized domain is `null` with a fixed error code in `errors`; other available domains still return. A quote-provider outage is different: stored distribution rules remain available, while `inventoryUnavailable` is true and `observedQuotes` is null. Unknown inventory is not zero inventory.

- Account totals cover all accounts, including staff. Active accounts have persisted status `active`; they are not a measure of recent engagement. Active sessions are unexpired sessions belonging to active accounts. Subscription records include all persisted lifecycle states and are not paid-subscriber or revenue counts. Active manual grants are unrevoked, unexpired grants.
- Open support reports include every status except `resolved`. Urgent and unassigned counts include only those unresolved reports. The five latest summaries include resolved reports too, ordered by update time; report bodies and internal notes are not loaded for the dashboard.
- Published notices are published records currently within their time window. Scheduled, expired, draft, and archived counts are separate. Publication time and expiry are evaluated when the data is read, without a background worker. The five latest content summaries omit body text.
- Observed EV sources, events, and quote rows describe the current upstream inventory. Suppression counts describe stored rules, including rules for items absent from that inventory. Controls affect the connected local EV bridge; an already open consumer updates on its next successful feed refresh. A failed refresh can leave its prior saved snapshot visible. See [market control boundaries](admin-market-controls.md).
- The latest eight audit events are a sanitized projection of account and operational activity, which can include customer and system actions as well as staff actions. Passwords, session tokens, and private saved collections are not selected for the dashboard. Service flags describe configuration, not a successful live email delivery or billing-provider health check.

The JSON snapshot contains only domains returned for the current staff identity. The report CSV contains retrieved numeric metrics and the retrieval timestamp. Account and audit page exports contain the displayed page, not the entire database. These are point-in-time exports, not historical analytics. Records can change during a refresh; the dashboard does not claim a transactionally frozen cross-service snapshot.

## Setup and verification boundary

The UI does not seed accounts, support reports, notices, or EV rules. Apply the existing additive account migration to the intended database and configure the account runtime as described in [connected operations](admin-connected-operations.md). A local fixture database used for tests does not establish production configuration or migrate a deployed database.

The dashboard and connected account/operations HTTP suites pass with isolated real SQLite databases. They cover role privacy, exact counts, effective publication windows, bounded projections, sanitized audit, provider failure, partial service failure, and staff-directory pagination. The controller review checks that the unified renderer retains required forms, dialogs, and event targets. Browser visual and interaction verification for the unified layout is tracked separately; this document does not treat server tests as proof that every browser control has been exercised.

`/admin-sandbox` remains a separate browser-local workflow demonstration. Its personas, approval queue, fixtures, and CSV exports do not authorize or execute any connected service operation.

## Unified browser verification — 2026-09-27

Verified the actual staff sign-in and authenticator flow on an isolated in-memory database at port 26938, then exercised the shared workspace through the browser. The fixture's accounts and quote inventory are disposable test records; this does not establish a production database connection.

- The overview uses database counts, and publishing a notice updated its published count from zero to one.
- The Users detail dialog suspended and restored a customer, revoked the customer's sessions on suspension, and retained both changes with their reasons in audit history. The staff directory showed only the owner; the audit route showed the recorded mutations without the customer directory.
- Content draft creation and publication persisted through route navigation. Support, source, and event pages displayed only the controls for their respective section. Source and event inventory remained distinct.
- Admin search filtered all 21 areas and supported keyboard selection. The report page showed actual numeric metrics and its CSV action was invoked; downloaded file contents were not inspected in this browser pass.
- At a 390-pixel viewport, the overview and customer directory had no document overflow. The wide account table scrolled inside its region; account details scrolled inside their dialog. The mobile drawer opened, Escape closed it, and focus returned to the menu button.
- An unimplemented grading area displayed its unavailable state and a support link, without an execution button.

Screenshots: `reports/admin-unified-desktop.png` and `reports/admin-unified-mobile.png`. The full repository suite completed with 1,930 passed and three unrelated failures in `test/bet-inline.test.mjs`, recorded in `reports/admin-unified-tests.txt`. The admin suites passed.

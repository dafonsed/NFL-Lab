# Connected support, content, and EV operations

`/admin` is the canonical connected staff workspace. Its scoped `/admin/support`, `/admin/content`, `/admin/sources`, and `/admin/events` pages use real authenticated server APIs and the account database; `/admin/operations` remains a combined compatibility view. `/support` lets customers submit their own reports, read their status, and see published notices. These pages do not read the sandbox store or insert sample tickets, content, identities, or market controls. The separate `/admin-sandbox` remains a workflow demonstration. See [the unified workspace](admin-unified-workspace.md) for routing, permissions, and dashboard count definitions.

## What is connected

| Workflow | Persistent effect | Actual consumer effect |
| --- | --- | --- |
| Customer report submission | A ticket is inserted in `adminOperation`, bound to the signed-in user's immutable ID, with an audit event. | The customer can read their own saved report and subsequent status changes at `/support`. Another customer cannot read it. |
| Staff support triage | Support staff can create a ticket for an existing account, update status/priority/assignment, and append immutable internal notes. | Customer report status updates are visible on the next report refresh. Internal notes, assignments, staff reasons, and staff identities are excluded from customer report responses. No email, push, or Discord message is sent. |
| Notice drafting and editing | Content staff create and revise plain-text drafts with category, publication time, and optional expiry. | Drafts are private and absent from the public endpoint. Published content cannot be edited in place; archive it and create a replacement draft. |
| Publish, schedule, and archive | Explicit actions update the content lifecycle and audit atomically. | `GET /api/content` returns only published content inside its effective time window; `/support` consumes this endpoint. Future publications appear when the next read is at or after their start, expiry excludes them immediately on subsequent reads, and archiving removes them. No background publication worker is required. Already rendered pages refresh on the next read. |
| EV source/event distribution | Staff persist an optimistic-versioned suppression rule in `adminMarketControl`. | The connected local EV bridge filters `/api/ev/quotes` and rebuilds `/api/ev/matches` from the filtered inventory. It does not stop collection or change unrelated feeds. See [EV distribution controls](admin-market-controls.md). |

Ticket categories such as billing or grading dispute classify reports. Resolving a ticket does not refund a payment, grade a bet, or recalculate a customer's bankroll. A free-text bet/market reference is a report label, not a verified link to a result snapshot.

## Authentication and changes

The HTTP layer derives identity from the real session. Staff need active verified accounts, persisted role permission, and completed MFA. Mutations additionally require the configured same origin, JSON, password reauthentication within the existing recent-proof window, and an 8–500-character reason. Customer report submission requires their own valid session and same-origin checks; clients cannot select another owner.

Owner and Admin have `support` and `content`; Support has `inspect` and `support`; Content has `content`; Data Operator has `data`. `GET /api/admin/capabilities` exposes the current real identity and permissions without requiring account-inspection access. The server independently checks each action. These workflows execute directly after authorization and do not implement independent two-person approval.

Every row edit, note insertion, and audit event commits in one transaction. Updates require the current positive integer `version`. Stale updates return HTTP 409 and do not partially save notes or audit events. A failed audit write rolls back the operation. Assignees must be active, email-verified support-capable staff with MFA enabled.

## API contract

| Endpoint | Methods and behavior |
| --- | --- |
| `/api/admin/support` | GET bounded ticket list; POST ticket for an existing `userId`. |
| `/api/admin/support/{id}` | GET ticket and bounded internal notes; PATCH status, priority, assignment and/or an appended note. Original customer report text is immutable. |
| `/api/account/support` | GET the signed-in customer's ticket list; POST their new report. |
| `/api/account/support/{id}` | GET the signed-in customer's safe ticket detail. Other owners' IDs return 404. |
| `/api/admin/content` | GET bounded content list; POST a private draft. |
| `/api/admin/content/{id}` | GET content detail; PATCH a draft. |
| `/api/admin/content/{id}/publish` | POST an explicit publication or scheduled publication. |
| `/api/admin/content/{id}/archive` | POST an explicit removal from publication. |
| `/api/content` | Public GET of currently effective published content. |

Lists return `{items, page, pageSize, hasMore}`. `pageSize` defaults to 25 and cannot exceed 100; `page` is bounded to 1–10,000. Staff support detail also returns `notes`, `notesPage`, `notesPageSize`, and `notesHasMore`; query `notesPage` and `notesPageSize` to read older notes. Detail/mutation responses return `{item}`. Staff lists support literal title/ID search via `q`; customer queries always retain the authenticated owner restriction.

Support creation accepts `title` (1–160), `body` (10–10,000), optional `category` (default `other`), and optional `reference` (at most 200). Staff additionally supply `userId` and `reason`, and may set `priority`, `assigneeId`, or an initial internal `note`. Customers cannot submit those staff fields. Ticket updates accept `version`, `reason`, and at least one of `status`, `priority`, `assigneeId`, or `note`. Notes contain 1–4,000 characters. Statuses are `open`, `in-progress`, `waiting-on-customer`, and `resolved`; priorities are `low`, `normal`, `high`, and `urgent`.

Content accepts `title` (1–160), plain-text `body` (1–20,000), `category` (`announcement`, `banner`, `guide`, `promotion`), optional `publishAt`/`expiresAt`, and `reason`. Timestamps use ISO format with a timezone and are normalized to UTC. Expiry must follow publication. Draft edits also require `version`; publish/archive accept only `version` and `reason`. A past expiration cannot be published. Staff content responses include `effectiveStatus` to distinguish scheduled, currently published, and expired records while retaining the persisted lifecycle.

## Setup and migration

Use the existing [account operations runbook](account-operations.md) for configured origins, signing secrets, email setup, owner bootstrap, backups, and PostgreSQL deployment. With the intended environment loaded, run the existing migration command:

```powershell
node --env-file-if-exists=.env.local scripts/accounts.mjs migrate
```

The additive, rerunnable account migration creates `adminOperation`, `adminOperationNote`, their indexes, and `adminMarketControl`, then records `2026-09-28-admin-operations-v1`. Existing customers and account data are not replaced. Local development supports persistent SQLite. Hosted/production accounts require PostgreSQL and an explicit migration; running tests does not migrate a deployed database.

Support and public notices need the account database and configured account runtime, but no new external delivery service. EV distribution controls additionally need the existing reachable local EV provider to inspect new source/event inventory. They remain scoped to that bridge, which is unavailable on Vercel. Provider setup and failure behavior are documented separately.

## Verification and remaining work

`node --test test/admin-operations.test.mjs` passes eight focused database tests covering actual SQLite writes and reopening, customer ownership, internal-note privacy, capability/MFA checks, invalid assignments and payloads, concurrent version conflicts, audit rollback, effective scheduled publication/expiry/archive, and bounded pagination. The fixtures contain test users in isolated databases; they are not production accounts or a deployment proof. Authenticated HTTP/session/origin/recent-proof checks are covered separately by the connected-route integration tests, and browser controls require their own UI verification.

This implementation does not establish deployed PostgreSQL availability, live provider connectivity, real email delivery, or production approval. Still absent are staff refunds/credits and affiliate payouts; deterministic grading and CLV backfills; outbound support replies/notifications; automatic diagnostics-to-bet linkage; offer eligibility and geographic targeting; CMS rich text and asset management; provider collection/parsing administration; engine policy deployment; infrastructure retry/rollback; independent server approval workflows; and full operational/business analytics. These services must not report success merely because a ticket or request was stored.

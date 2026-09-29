# Admin capability audit

The repository has a real account backend, protected staff account APIs, persisted support reports, scheduled plain-text content publication, and scoped EV distribution controls. `/admin/operations` and `/support` use these connected services. The 21-section workspace remains a separate browser-local sandbox. Many other requested services and administrative APIs still do not exist. See the [connected operations inventory](admin-connected-operations.md) for exact effects and deployment boundaries.

The initial audit inspected source, tests, `.env.example`, and documented configuration shapes. Follow-up implementation tests used an isolated in-memory account database and local mail transport. No private environment files or customer databases were read, and no live providers were contacted. “Implemented” below means an actual server code path exists, not that a production connection has been verified.

## Existing staff API contract

Evidence: [`handleAdmin`, `requireStaff`, and request guards](../lib/accounts/http.mjs); [authenticated administrative reads](../lib/accounts/admin-read.mjs); [`requireSession` and `requireRecent`](../lib/accounts/auth.mjs); [current staff UI](../public/admin-accounts.js).

All staff calls require an active, verified account, its real session, a persisted staff role, and a completed authenticator challenge. Mutations also require the exact configured request origin, JSON, a password reauthentication within five minutes, and a reason of 8–500 characters. The browser never chooses the actor. Mutation effects and audit records commit in a database transaction.

| Method and endpoint | Implemented behavior |
| --- | --- |
| `GET /api/admin/accounts?q=...&page=1&pageSize=25` | Case-insensitive ID/name/email search; bounded pagination with `hasMore`. Returns safe public fields and server-derived `allowedActions` for each target. Plan/linked-account search and last-activity sorting remain absent. |
| `GET /api/admin/overview` | Real database counts for users, active/suspended users, active sessions, subscriptions, and active grants; real actor/permissions and safe mail/billing configuration flags. No invented revenue or provider-health metric. |
| `GET /api/admin/accounts/{id}` | Safe user and session metadata, grants, subscription summary, per-kind stored collection counts, and recent sanitized audit. Does not select private bets, notes, filters or other saved contents; collection counts are 0/1 stored documents, not invented item totals. Lists are bounded and report truncation. |
| `GET /api/admin/audit?userId=...&page=1&pageSize=25` | Bounded, newest-first event listing with optional target-user filter. Detail is restricted to known scalar fields with sensitive patterns redacted; credentials and nested payloads are omitted. |
| `POST /api/account/reauthenticate` | Checks the signed-in staff member's password and records recent proof on that session. This is a prerequisite, not a customer-password operation. |
| `POST /api/admin/accounts/{id}/action` | Accepts one of the six real mutations below; derives the actor from the authenticated session. Returns `{status:true}` after commit. |
| `GET /api/admin/capabilities` | Returns the actual staff identity and persisted permissions, including for Data Operator and Content roles without account-inspection access. |
| `GET/POST /api/admin/support`; `GET/PATCH /api/admin/support/{id}` | Persisted tickets bound to existing customer identities, status/priority/assignment, immutable internal notes, optimistic versions, and transactional audit. Requires `support`. Customer-owned create/list/detail routes are under `/api/account/support`. |
| `GET/POST /api/admin/content`; `GET/PATCH /api/admin/content/{id}`; `POST /{id}/publish` and `/archive` | Real draft storage and explicit publication lifecycle. The public `/api/content` read filters publication times and expiry; `/support` renders effective notices. Requires `content`; published items cannot be edited in place. |
| `GET/POST /api/admin/market-controls` | Inventories the connected local EV bridge and persists versioned source/event suppression. Quote/match reads apply those rules. Requires `data`; collection and unrelated feed families are unchanged. |

| `action` | Permission | Persistent effect / additional values |
| --- | --- | --- |
| `suspend` | `suspend` | Sets account status to `suspended` and deletes that user's sessions. |
| `restore` | `suspend` | Sets status to `active`. Suspension/restoration refuses deletion-pending accounts. |
| `revoke-sessions` | `suspend` | Deletes that user's sessions. |
| `grant-access` | `grant` | Inserts an `accessGrant`; requires `plan` and `expiresAt` in the future, within 366 days. Does not charge, refund, discount, or change Stripe subscriptions. |
| `revoke-grants` | `grant` | Revokes all active manual grants for the target. Independently paid subscriptions are unchanged. |
| `set-role` | `roles` | Sets a supported non-owner role and revokes sessions. New staff must already have verified email and enabled MFA. |

Every target must exist. Callers cannot mutate themselves or any owner; only owners can mutate other staff. The first owner is bootstrapped through the privileged [`scripts/accounts.mjs`](../scripts/accounts.mjs) command after email and MFA verification, not through HTTP.

Real roles are `customer`, `owner`, `admin`, `support`, `data-operator`, and `content`. Owner has `inspect/suspend/grant/roles/data/content/support`; admin lacks `roles`; support has `inspect/support`; data operator has `data`; content has `content`. Account inspection requires `inspect`, support workflows require `support`, publication requires `content`, and EV controls require `data`. All staff can read their own capability context. Sandbox personas such as `Developer` do not map to real roles.

Real plans are `free`, `premium`, `premium_plus`, and `pro`, defined in [`entitlements.mjs`](../lib/accounts/entitlements.mjs). Sandbox `Starter` and `Founder` are not production plans.

## Real adjacent services, with limits

| Service | Implemented | Not provided by that implementation |
| --- | --- | --- |
| Account lifecycle | Better Auth email/password sessions, verification, recovery, authenticator MFA, own-session controls, profile/preferences, versioned personal data, recent-proof account export, and deletion requests. | Staff impersonation, arbitrary password setting, staff access to another customer's private saved data, deletion fulfillment, or owner transfer API. |
| Billing | [`billing.mjs`](../lib/accounts/billing.mjs) implements allowlisted Stripe checkout, customer-owned portal, signed webhook reconciliation, paid entitlements, manual grants, and refund/dispute-aware access. Public plan availability is `GET /api/account/billing/plans`; own summary is in `GET /api/account`; checkout/portal use `POST /api/account/billing/{checkout,portal}`. | Admin subscription listing, issuing refunds/credits, creating prices/plans/promo codes, affiliates, commissions, payouts, or billing report exports. Recognizing a refund webhook is not a refund command. |
| Transactional mail | [`mail.mjs`](../lib/accounts/mail.mjs) sends account lifecycle templates through an encrypted, retried Resend outbox. [`trials.mjs`](../lib/accounts/trials.mjs) creates finite-grant notices. `GET/POST /api/cron/accounts` requires `CRON_SECRET`; privileged CLI also supports `mail-drain`. | Admin delivery queue UI/API, arbitrary service messages, betting-alert evaluation/delivery, push, or Discord. Saved alert preferences are data, not a delivery engine. |
| Audit | Server account, auth, billing, and admin events persist in `accountAudit`; authenticated staff can read sanitized bounded events. A customer can read their own recent activity/export. | Immutable external audit retention and two-person change approval workflows. Existing staff mutations apply immediately after authorization. |
| Support and content | [`admin-operations.mjs`](../lib/accounts/admin-operations.mjs) persists real customer reports, staff triage/notes, private content drafts, explicit publication/archive, and effective schedule/expiry reads. | Outbound support messages, automated diagnosis/grading, rich-text assets, promotion eligibility/region logic, independent approvals, or a background worker claim. |
| EV upstream | [`ev-api-proxy.mjs`](../lib/ev-api-proxy.mjs) exposes health/status/quotes/matches reads, quote upload, and match deletion through a configured LAN provider. [Persisted distribution controls](admin-market-controls.md) suppress sources/events in the bridge's served quotes/matches. Writes require real staff `data` permission, MFA, recent proof, and same-origin checks. | Collection pause/configuration, parser rollback, normalized identity mapping, automatic price-quality rules, or engine rule publication. The bundled [`api_server.py`](../integrations/ev_tool/api_server.py) persists uploads and deletes match quotes, but `POST /scrape` returns **501: not implemented**. The proxy is unavailable on Vercel. |

## Coverage of all 21 requested areas

This matrix describes exposed administrative capability. Existing customer research, odds calculations, or stored personal bets do not establish a server administrative control for that subsystem. The account route inventory above and [`server.mjs`](../server.mjs) are the routing evidence; the [sandbox catalog](../public/admin-catalog.js) is synthetic, not another backend.

| Area | Real capability available now | Backend still needed |
| --- | --- | --- |
| Overview | Actual account/session/subscription/grant counts; analytics has a limited health endpoint. | Revenue, tool usage, coverage/freshness, incidents, pending jobs/disputes. |
| Users | ID/name/email search, safe account detail, grants/subscriptions/session metadata; suspend/restore, revoke sessions, finite grants. | Plan/linked-account search, feature-specific grants, staff export/deletion fulfillment, controlled access to private saved contents. |
| Plans, billing & affiliates | Stripe integration and grants described above. | Administrative billing APIs, mutable plan/limit policy, discounts/credits/refunds, affiliate attribution and payouts. |
| Sources | LAN EV provider health/status/import plus persisted source distribution suppression/restoration applied to actual bridge quote responses. | Source credential/configuration registry, scheduler/collection pause, coverage/latency history, parser rollback; controls for other feed families. |
| Events & markets | LAN match inventory; reversible, versioned event distribution suppression/restoration with audit. Existing destructive quote deletion remains separate. | Merge/mapping workflows, normalized identities, snapshots, broad market/selection controls beyond the local bridge. |
| Odds quality | Raw quote reads/upload validation, manually scoped event suppression, and persisted incorrect-line support reports. | Automatic quality rules, per-line quarantine, raw snapshot linkage, calculation exclusion explanations and automated resolution. |
| +EV, devig & fair lines | Existing consumer calculations/feed. | Versioned server rule/model configuration, reproducible old/new preview, controlled publication and rollback. |
| Arb, middles & Smart Money | Existing consumer tools and entitlements. | Server qualification/fee/liquidity/signal configuration and suppression records. |
| Fantasy & parlays | Existing consumer tools and entitlements. | Persisted payout/settlement/correlation policies and connected slip-integration controls. |
| Bet links & locations | Existing customer link behavior. | Template/region registry, link verification jobs, report/resolution queue and publication. |
| Bet tracker & grading | Session-owned versioned bet storage. | Staff bet lookup, results evidence, deterministic grading/regrade/backfill jobs and financial recalculation. |
| CLV & performance | Existing consumer performance calculations. | Closing-price snapshots/policies, administrative reconciliation and controlled recalculation jobs. |
| Insiders & wallets | No account/admin service found. | Wallet registry, ingestion/identity matching, positions/settlement, backtests and signal controls. |
| Lineup Dropper | No administrative service found. | Source ingestion, player matching, projection versioning, announcement processing and alert controls. |
| Notifications | Transactional account mail/outbox and finite-grant notices. | Odds-alert workers, delivery administration, push/Discord adapters, service-status broadcasts and template management. |
| Promotions & content | Persisted plain-text drafts, explicit publication/archive, timed public visibility/expiry, and `/support` notice consumption. | Offer eligibility/region/device targeting, rich-text/asset CMS, featured-tool configuration, and promotion validation. |
| Customer support | Customer-owned reports, staff creation/triage, priority, valid staff assignment, immutable internal notes, reasons/audit, optimistic versions, bounded lists, and customer-visible status. | Verified bet/market/snapshot diagnostics, response templates, public conversation replies, attachments and outbound notifications. |
| System health | Account cron/mail drain; limited analytics health. | Metrics/logs/traces, safe job retry/backfill, deployment/rollback adapters, feature flags, maintenance, backup status/restore controls. |
| Admins & permissions | Real staff roles, enforced MFA, owner role assignment, suspension and session revocation. | Dedicated staff listings/details, granular editable permissions, independent approvals, privileged account lifecycle UI. |
| Security & audit | Session/MFA enforcement, persisted sanitized staff audit API, encrypted sensitive auth/outbox storage, request limits. | Incident management, retention/deletion administration, login-abuse review, credential manager and supported key-rotation procedure. |
| Reports & analytics | Customer account JSON export and exports of currently shown real support/content records. | Administrative aggregations, time series, conversion/churn/affiliate metrics, bulk reporting, and real operational CSV reports. |

## Configuration readiness

Only configuration requirements were inspected. Actual values and connection status remain unverified; blank examples are not evidence that a deployed secret is absent.

| Component | Required configuration / readiness evidence |
| --- | --- |
| Accounts | `BETTER_AUTH_URL`, at least 32-character `BETTER_AUTH_SECRET`, migrated account tables. [`runtime.mjs`](../lib/accounts/runtime.mjs) returns unavailable when missing or initialization fails; it caches initialization until process restart. |
| Storage | `DATABASE_URL` for hosted/production PostgreSQL; `ACCOUNT_DB_PATH` supports local SQLite only. Production startup does not automatically migrate. |
| Account email | `RESEND_API_KEY` and `EMAIL_FROM`, verified sender, working outbox drain. Registration/recovery must not report delivered mail from configured flags alone. |
| Policy activation | `POLICY_APPROVED_VERSION` matching the code's reviewed policy version. Do not infer approval from its example. |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, approved `STRIPE_PRICE_*` IDs, provider portal/webhook setup. A `configured` response confirms configuration checks, not a successful paid journey. |
| Trial/outbox schedule | `CRON_SECRET` plus an actual scheduled caller for `/api/cron/accounts`. |
| EV provider | `EV_TOOL_API_URL` and `EV_TOOL_API_KEY`, reachable loopback/private-network API. Upload/delete are unavailable without it; scraping remains unimplemented even when connected. |

See [`.env.example`](../.env.example) and the [account operations runbook](account-operations.md) for approved setup commands. Do not place credentials into admin forms or browser state.

## Integration recommendation

1. Keep `/admin-sandbox` isolated and labeled as a demonstration. Build the live full-panel shell under protected `/admin` routes without importing `admin-store.js`, `createAdminSeed`, `ADMIN_ROLES`, or `sportslab-admin-sandbox-v1`. Never import sandbox records into account tables or submit a sandbox persona as API identity.
2. Use the implemented staff-context/capability endpoint and connected operations routes. Data operators/content staff can enter their workflows without account `inspect` access. Keep independently enforcing persisted role, MFA, recent proof, and service readiness in each action handler.
3. First expose the six genuine account mutations and account search through the full-panel layout, reusing the existing session-aware API client and password reauthentication. Use real target IDs, production plan/role values, current server limits, and explicit action-specific confirmation. Refresh from the server after commit; do not announce success after updating local state.
4. Use the implemented account-detail, grant/subscription metadata, staff audit, and overview endpoints for related tables. Show unavailable/loading/error states instead of fallback synthetic metrics. Account search is paginated; use overview counts for actual totals and do not infer revenue from plan previews.
5. For each remaining area, implement the durable domain schema, validated action API, underlying worker/provider integration, observable result, audit event and recovery behavior together. A persisted request alone is not a completed refund, scrape, regrade, publication or retry. Hide or disable execution until the corresponding backend capability is ready, stating the missing service.
6. If sensitive changes require a second approver, implement persisted server approvals bound to distinct real user IDs, permission checks at review/execution, target-version checks and idempotent execution. The browser role-switch approval mechanism cannot authorize real operations.
7. Extend tests through the real server and database for every newly exposed action: unauthenticated/unauthorized/MFA/reauth/origin denials, valid effects, immutable actor attribution, stale/replayed requests and provider failures. Validate deployed adapters separately from local contract tests before claiming an external operation works.

## Evidence and verification boundary

[`admin-live-api.test.mjs`](../test/admin-live-api.test.mjs) passes five integration tests covering the new reads, unauthenticated/customer/non-MFA denial, actual database counts, case-insensitive pagination, metadata privacy, sanitized audit, all six real mutations, persistence, reasons and actor attribution. The existing [`account-auth.test.mjs`](../test/account-auth.test.mjs) and [`account-operations.test.mjs`](../test/account-operations.test.mjs) also pass 21 regression tests. [`account-billing.test.mjs`](../test/account-billing.test.mjs) was inspected: it uses the real Stripe signature implementation with an injected provider adapter and does not make live charges. These results do not verify the still-missing operational services or a deployed provider connection.

The connected operations implementation additionally has eight focused tests in [`admin-operations.test.mjs`](../test/admin-operations.test.mjs) for real SQLite writes/reopening, customer isolation, internal-note privacy, mutation/audit rollback, concurrent versions, effective publication windows, and bounded pagination. [Market distribution tests and limitations](admin-market-controls.md) are separate. These tests use isolated databases and injected provider fixtures; production PostgreSQL, deployment migration, and provider reachability remain separate verification tasks.

The live UI uses the server's 8–500-character reason contract and persisted role/plan IDs. The additive operations migration, support permission, public content route, and distribution proxy hook extend the earlier read-only implementation. They do not turn sandbox records into production data or complete the remaining operational services.

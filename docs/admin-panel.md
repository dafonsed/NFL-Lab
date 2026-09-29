# SportsLab admin sandbox

For implemented database-backed administration, use `/admin/accounts` and `/admin/operations`. See [connected operations](admin-connected-operations.md), [capability audit](admin-capability-audit.md), and [browser verification](admin-browser-verification.md). The sandbox described below remains a sample workflow preview; its actions never call those production APIs.

The admin panel at `/admin-sandbox` is a separate operational workspace with 21 sections. It uses synthetic records and local browser storage. It is suitable for reviewing workflows and UI before connecting production services. This sandbox does not call admin APIs or access actual customer accounts or billing records. The separate `/admin` route remains reserved for the account system and its staff access controls.

## Run locally

From the repository root, run `npm start`, then open `http://127.0.0.1:3100/admin-sandbox`. The normal server port can be changed with `PORT`. Use `AUTO_SYNC=0` to run the sandbox without the existing sports data refresh on startup. Each section also has a direct URL, such as `/admin-sandbox/users` or `/admin-sandbox/security`.

The sandbox stores its edits in the current browser. Refreshing the page preserves those edits; a different browser or cleared site storage starts with the synthetic dataset. The workspace provides a reset action for returning to sample records. Do not enter credentials, customer information, or other private production data in sandbox fields.

If saved data cannot be read, the store preserves it and leaves sample records read-only until an explicit reset. Failed writes do not apply the requested change. If another tab has changed the saved workspace, reload before saving again.

## Available workflows

Tables provide search, filters, record inspection, and CSV exports. Record actions update local state, capture a reason where required, and add audit entries. Sensitive actions go through a simulated approval queue. The role selector demonstrates different page and action permissions. Roles, approvals, sessions, and audit history are client-side simulations; they are not authentication, authorization, or tamper-resistant records.

Calculation examples, comparison snapshots, diagnostics, and historical metrics are stored sample evidence. Editing configuration does not rerun an odds engine or regenerate those snapshots. External operations are represented by request or draft records, including refunds, payouts, regrades, backfills, tests, publication, credential rotation, and job replay. A support-review action records local review status; it does not impersonate a customer.

To review the approval flow, make a sensitive change such as editing a billing record and enter a reason. The record stays unchanged while the request is pending. Switch to a different reviewer persona with approval access, approve or reject the request with a reason, then inspect the record and audit history. Requests become stale if their target record changes before approval, and must be rejected and resubmitted.

| Section | Route | Sandbox capability |
| --- | --- | --- |
| Admin home | `/admin-sandbox/overview` | Synthetic user, subscription, revenue, tool, feed, and incident overview. |
| Users | `/admin-sandbox/users` | Inspect sample accounts, access, plans, activity, and account operations. |
| Plans, billing & affiliates | `/admin-sandbox/billing` | Inspect sample plans, subscriptions, failed payments, offers, and affiliate operations. |
| Sportsbooks & data sources | `/admin-sandbox/sources` | Inspect source freshness and coverage; simulate pause, resume, and configuration changes. |
| Events & markets | `/admin-sandbox/events` | Review event and market mappings and simulate visibility or mapping changes. |
| Odds quality | `/admin-sandbox/quality` | Inspect suspicious odds, quarantine sample lines, and resolve quality reports. |
| +EV & fair lines | `/admin-sandbox/ev` | Inspect rule configuration, sample calculations and version comparisons; request rule changes. |
| Arbitrage, middles & Smart Money | `/admin-sandbox/arbitrage` | Inspect qualification rules, stake calculations, and signal controls. |
| Fantasy & parlays | `/admin-sandbox/fantasy` | Review sample app payout rules, slip combinations, and integration status. |
| Bet links & locations | `/admin-sandbox/links` | Inspect sample link templates, regions, device coverage, and broken-link reports. |
| Bet tracker & grading | `/admin-sandbox/grading` | Inspect sample bets and grading disputes; edit local results and draft regrade or backfill requests. |
| CLV & performance | `/admin-sandbox/clv` | Review closing-price rules, missing prices, and recalculation workflows. |
| Insiders & wallets | `/admin-sandbox/wallets` | Inspect sample wallets, signals, positions, and tracking controls. |
| Lineup Dropper | `/admin-sandbox/lineups` | Review sample announcements, source delays, matching, and affected markets. |
| Notifications | `/admin-sandbox/notifications` | Inspect sample delivery queues, alert rules, templates, and pause controls. |
| Promotions & content | `/admin-sandbox/content` | Review sample promotions, eligibility, publication status, and content edits. |
| Customer support | `/admin-sandbox/support` | Triage synthetic reports, assign work, change priority or status, and add internal notes. |
| System health | `/admin-sandbox/system` | Inspect synthetic services and jobs; draft replay, rollback, flag, and incident changes. |
| Admins & permissions | `/admin-sandbox/admins` | Explore role permissions, simulated administrator records, sessions, and approval requests. |
| Security & audit | `/admin-sandbox/security` | Inspect local action history, simulated security controls, and incident records. |
| Reports & analytics | `/admin-sandbox/reports` | Review synthetic business and operational metrics and export local records as CSV. |

## External integrations

External connection indicators describe sandbox data, not measured production health. The panel does not connect to payment processors, affiliate payout services, sportsbook providers, notification delivery, wallet services, deployment platforms, or production databases. Local actions do not charge, refund, pay, send a notification, pause an actual source, replay a real job, publish customer content, or change a real account.

The sandbox does not implement actual MFA enrollment, secure secret storage or rotation, production session revocation, or user impersonation. Any displayed authentication, impersonation, key, or provider workflow is explanatory or simulated. Provider keys must remain outside the browser. `noindex` metadata, a separate layout, and hidden customer navigation are discoverability choices, not access controls.

## Before a production integration

1. Add server-side administrator authentication with separate accounts, enforced MFA, session expiration, and revocation. Bind permissions to the authenticated server identity; do not trust the browser role selector.
2. Build authenticated APIs with validated inputs, page and action authorization, safe state transitions, concurrency checks, and explicit test/production separation.
3. Replace local records with durable storage and enforce approval requirements on the server. Record immutable audit events with actor, reason, timestamp, and before/after values; support independent approvers for sensitive changes.
4. Connect each approved provider through server-side adapters. Use a secret manager, scoped credentials, signed billing webhooks, retry policies, idempotency keys, rate limits, and reconciliation.
5. Establish validated source snapshots and results, engine versioning, controlled grading and CLV recalculations, backfill limits, monitoring, rollback, backup, and restore procedures.
6. Implement customer-data retention, deletion and export controls, secure support access, and audited, restricted impersonation if needed. Add notification delivery and content publishing only behind explicit production authorization.
7. Verify production roles, approval boundaries, provider failures, audit integrity, and end-to-end workflows against staging services before rollout.

## Verification

Run `node --test test/admin-store.test.mjs test/admin-routes.test.mjs test/site-layout.test.mjs` to verify every section route, the standalone shell, asset delivery, cache and indexing headers, and unknown-route rejection. The browser workflows and local state layer have separate verification. The route tests do not establish production security or provider connectivity.

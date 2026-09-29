# Admin sandbox control audit

This review covers the browser-local `/admin-sandbox` workspace, its catalog, and its state store. It does not establish that a production provider is connected or that the separate staff account UI is fully operational. See [the backend capability audit](admin-capability-audit.md) for the actual account APIs and the backend work still needed across the 21 requested areas.

## Verified catalog contract

The catalog contains 21 areas, 85 synthetic records, 148 editable field definitions, and 71 action definitions. Twenty-three actions represent requests only. The fixture review found no missing required values, invalid select options, or numeric-bound violations.

Editable email addresses use email validation. Event fallback addresses use HTTP(S) URL validation; link templates with substitution placeholders remain text. Collection intervals, reference-book counts, slip sizes, missing-price counts, and notification limits are whole numbers. Money/liquidity values and percentages retain decimal support with explicit bounds. The store must validate these constraints independently of browser inputs.

Request-only actions carry `requestOnly: true`. Their `targetStatus` describes the request, not the account, ticket, feed, or job lifecycle. The store records `requestStatus` and `lastRequestAction` separately. Request statuses are excluded from the editable lifecycle selector. Sensitive requests still require a second permitted simulated persona before the request is recorded. Approval does not execute a provider operation.

Billing credit and refund requests apply only to Subscription records; payout requests apply only to Affiliate records. Credential-rotation requests apply only to Credential rotation records. Both the UI and store must enforce record applicability. Hiding a button alone is insufficient.

## Defects found during review

| Priority | Reproduction and impact | Source evidence / expected correction |
| --- | --- | --- |
| P2 | Filter the table, then export: the original download included all rows and ignored the visible order. | `admin.js`: `selectedRows`, `exportRecords`; `admin-store.js`: `exportCsv`. Export the selected IDs in their visible order; full-dataset reports should remain explicitly separate. |
| P2 | Sort source latency ascending: the original order was `—`, `1,840 ms`, `142 ms`, `186 ms`, `218 ms`. | `admin.js`: `selectedRows` used string comparison even for formatted measurements. Normalize durations/numbers and sort missing values consistently. |
| P2 | Activate a column header by keyboard: rebuilding the table removes the focused sort button. Saving a modal also removes its original focus target. | `admin.js`: `updateTable`, sort click handler, submit handler, dialog close handler. Restore focus to the replacement control or a stable page target. |
| P2 | Open an edit form, type changes, then press Ctrl/Cmd+K: the original global-search handler replaces the open dialog and discards form values. | `admin.js`: keyboard handler, `searchDialog`, `showDialog`. Do not replace an active editing workflow without preserving or explicitly discarding its draft. |
| P2 | Request an export for active `USR-1042`: the original active-account count fell from 2 to 1. Draft a resolution notification for resolved `SUP-802`: open-ticket count rose from 4 to 5. | Catalog request actions plus `admin-store.js`: `proposedRecord` previously overwrote `status`. Separate request state from lifecycle state. |
| P2 | Original state validation accepted `not an email`, `not a URL`, expiration before publication, and a forward-test start before its backtest start. | Catalog field types and store validation. Validate email/URL types, whole-number counts, and merged cross-field date constraints on create, edit, and approval. |
| P2 | All billing records originally offered all financial request types, including payout on a Plan and refund on an Affiliate. | `admin.js`: inspector action list; catalog actions; store mutation authorization. Enforce `appliesTo` by record and reject no-op lifecycle transitions. |
| P2 | Previously saved request labels can be invalid lifecycle choices after request state is separated. A select with no matching option can silently choose the first option. | `admin-store.js`: loaded-state validation; `admin.js`: `fieldsHtml`. Migrate recoverable legacy request state or make invalid persisted data explicitly read-only until reset; do not silently replace status. |

The table records the issues discovered and the repair contract. It is not a claim that every browser scenario was exercised. Catalog checks and isolated in-memory mutation probes were run during this review. UI keyboard, focus, download, responsive, and server-connected behavior require their own verification after all changes land.

## What a successful sandbox action establishes

| Control | Observable local result | Does not establish |
| --- | --- | --- |
| Create/edit | Validated record saved in this browser, or a pending sensitive proposal; activity includes reason and before/after values. | A customer account, sportsbook configuration, CMS document, or production database changed. |
| Local lifecycle action | Applicable sample status changed with a reason and audit event. | An actual account was suspended, a live feed paused, an alert stopped, or a line quarantined in a customer tool. |
| Request action | Separate request metadata and activity saved; sensitive requests pass simulated review. | A refund, payout, deletion, export job, parser rollback, merge, regrade, recalculation, test, message, publication, job replay, maintenance change, revocation, key rotation, or report refresh ran. |
| Approval | Another permitted sandbox persona applies or rejects the precise local proposal; stale records are rejected. | Independent real identities approved a production operation, or that a provider operation completed. |
| Export CSV / audit JSON | A browser download contains the intended local dataset with safe CSV escaping. | Provider reconciliation, a real billing report, or immutable audit retention. |
| Role selector | UI and local mutation permissions preview the selected persona. | Server authentication, MFA, production authorization, or a tamper-resistant security boundary. |
| Metrics, evidence, preview | Stored synthetic values can be inspected. | Live ingestion, fresh odds, current revenue, replayed calculations, or measured provider availability. |

The sandbox has no execution worker that consumes these local requests. Request records must not be described as completed operations. Existing static calculations, diagnostics, and timestamps remain sample evidence after editing their associated configuration.

## Regression checklist

Run `node --test test/admin-store.test.mjs test/admin-control-matrix.test.mjs test/admin-routes.test.mjs` for the store, catalog-action matrix, and route contract. A passing unit matrix proves local contracts under its fixtures; it does not prove external connectivity or browser interaction.

In a browser, verify search and status filtering together, ascending/descending sort, filtered export contents and order, empty-table export, global-search navigation, direct links and Back/Forward, modal close/cancel, keyboard focus after sort and save, mobile navigation focus containment, persona visibility and denied actions, applicable-action filtering, pending/approved/rejected/stale proposals, request lifecycle preservation, reload persistence, storage failure, and explicit reset. Test production account actions independently against the authenticated server and a test database, using the server's real roles, identifiers, limits, and response state.

# SportsLab account system implementation and verification report

A subsequent owner-approved pricing update renames the displayed plans without changing account authorization or existing billing identifiers. See [pricing-plans.md](pricing-plans.md) for the current names and monthly amounts; the report below preserves the implementation's earlier terminology.

Review date: September 28, 2026 UTC. This report covers the existing Node application, the account implementation added in this task, locally executed verification, and the external connections still needed for production. It does not claim the site is already operating production accounts or accepting real payments.

## 1. What existed before

The application is a Node.js 22+ ES-module HTTP server with plain browser JavaScript, static/server-rendered HTML, sports-provider data, private Vercel Blob prediction history, and an existing Vercel deployment configuration. It is not a new starter application and was not replaced with one.

The original registration/login pages only validated forms locally. There were no persisted users, identities, sessions, recovery records, authenticators, real subscription records, email provider, checkout, billing webhooks, or server account authorization. `/admin` rendered a synthetic browser-selected-role sandbox. Analytics APIs and the EV proxy did not authenticate site users. Personal bets, notes, filters, watchlists, and preferences shared unowned browser-storage keys. Existing prediction-cron routes did already authenticate a service bearer token.

The inspected local environment contained analytics/deployment variable names, including Blob, Vercel, cron, and LAN EV-provider configuration. It did not contain the account database, signing secret, transactional email, or Stripe credentials required below. No secret values are reproduced here. No external existing customer system was accessible; an external system, if one exists, must be inventoried and mapped explicitly before migration.

Detailed initial route/storage findings are in [account-initial-audit.md](account-initial-audit.md). Old `sites-*` static exports and synthetic admin fixtures are not production account authority.

## 2. Registration

`public/register.html`, `public/auth.js`, `public/account-client.js`, and the account styles now submit to `POST /api/auth/sign-up/email` through the existing application. The interface has labeled display-name/email/password fields, password-manager autocomplete, visibility controls, validation, loading/error states, and a clear inbox/sign-in/recovery next step.

The server normalizes email case and whitespace while preserving dots and tags; it does not apply Gmail-style alias merging. Better Auth's credential provider and unique identities prevent duplicate account ownership. Required Terms/Privacy acceptance records the server timestamp and policy version; optional marketing consent is recorded separately. Roles, account status, MFA timestamps, and consent timestamps cannot be supplied as privileged client fields. Production registration requires the approved policy version.

Passwords require 15–128 characters and reject a limited local common-password list. Password hashing is provided by Better Auth; no custom password cryptography or plaintext password storage was introduced. IP/email limiters and generic existing-address responses reduce abuse and account enumeration. The blocklist is intentionally described accurately: it is a small local check, not an integrated full breached-password database.

No date of birth, identity documents, or sportsbook wagering verification was added. The product remains an analytics application.

## 3. Email verification

Registration and `POST /api/auth/send-verification-email` enqueue the real verification template. `GET /api/auth/verify-email` combines Better Auth's signed, expiring token verification with a database one-use receipt bound to the immutable user ID. Verification links expire after one hour. Replayed, invalid, stale-address, suspended-account, and expired links do not establish account access; the UI offers a new-link route.

Verification never signs the user in automatically. Any provider-created email-change session is revoked and its cookie is removed from the response. Existing sessions are revoked on verification of an email change. Every protected account/tool request requires a verified email, and the Account page displays verification state. The public homepage, education, calculators, and explicit example EV workspace remain public.

Templates and outbox processing were executed with a local delivery adapter and the verification message was rendered at mobile width. External Resend delivery, domain authentication, spam placement, bounce handling, and inbox arrival remain unverified.

## 4. Sign-in

`/login` posts to `POST /api/auth/sign-in/email`. Better Auth validates the credentials and optional MFA challenge. The “Keep me signed in” choice is passed to the library's supported remember-me behavior. Signed-in navigation/refresh retrieves server session state; an account cannot create access by setting a browser premium flag.

Safe same-origin return paths preserve a requested protected destination. External/protocol-relative/backslash redirects are rejected. Password failures are generic. IP and normalized-email buckets use database-backed atomic increments; untrusted forwarding headers are discarded, with the configured Vercel ingress header used only in that hosting environment. Suspended or deletion-pending users cannot establish usable sessions, and existing sessions are rejected/revoked on subsequent checks.

## 5. Recovery and password changes

`/forgot-password` calls `POST /api/auth/request-password-reset` and always presents a generic request result. `/reset-password` submits the single-use token and new password to `POST /api/auth/reset-password`. Recovery links expire after 30 minutes. Successful reset revokes existing sessions and queues a password-changed notice. Old and expired links are tested; a password reset does not disable MFA.

Account password changes use recent password reauthentication, Better Auth's credential verification, and revocation of other sessions. Staff never view or manually set a customer's password. MFA recovery uses one-time library-managed recovery codes. Loss of the authenticator and all codes requires the documented controlled operator recovery procedure; there is no insecure support bypass.

## 6. Sessions and devices

Better Auth owns session creation, validation, expiration and renewal. Cookies are HTTP-only, SameSite=Lax, and Secure on HTTPS. Cookie caching is disabled so current database status, role, MFA state, and revocations remain authoritative. Session bearer lookup values are hashed; the library-supported encrypted representation supports operations that need the token without storing it in plaintext.

The Account interface lists active sessions/device user agents and supports current-device logout, selected-session revocation, and all-device logout. Session IDs are exposed for revocation instead of bearer tokens. Sensitive settings, export, deletion, billing and staff changes require reauthentication within five minutes; invalid/future timestamps fail closed. Mutation endpoints verify origin and accept JSON; provider webhooks and service cron have their own distinct authentication.

## 7. MFA and optional identities

Customers can enroll an authenticator, verify a TOTP code, obtain encrypted-at-rest recovery codes, and use a one-time recovery code during login. Enrollment/replacement/removal and regeneration require recent proof. Sessions predating MFA enrollment cannot remain authenticated without MFA. The wrapper marks a session as MFA-verified only after the provider verifies a real code.

All staff roles require enabled MFA and a session that completed the challenge. Customers cannot become staff by editing a request field. Staff cannot disable their authenticator through the customer flow. Better Auth's account lockout and application challenge limits apply.

Passkeys, Google/Apple sign-in, OAuth linking, and Discord integration were not connected; their buttons are not presented as working integrations. Automatic account linking is disabled. A future provider integration must establish its own verified identity-linking and duplicate-account migration process.

## 8. Account area and personal data

`public/account.html` and `public/account.js` provide profile name, verified email, email/password changes, MFA/recovery-code controls, active sessions, odds format, notification/marketing preferences, saved-data migration controls, billing/access state, personal bet export, full account export, deletion requests, and recent security/account activity. `public/admin-accounts.html` and its script provide the separate staff account interface.

`public/account-sync.js` connects the existing product modules to owner-scoped server storage. Existing bet/annotation, notes, watchlist, saved-filter and preference consumers wait for account hydration. The server derives ownership from the authenticated user, not URL/body user IDs. Optimistic versions reject concurrent overwrites; `X-Account-User` detects stale-tab account switching. Failed loads do not overwrite server data with empty defaults, and unsaved drafts can be recovered/exported.

Old browser records are preserved and are never silently attributed to whoever signs in next. Import requires an explicit ownership confirmation, excludes synthetic demo/admin data, preserves existing cloud keys and originals, and retains conflicts for review. Anonymous examples use ephemeral state instead of reading another person's old storage. Pending local drafts are ordinary browser application data, not session credentials; offline browser storage is not remotely erased by server deletion.

Notification/alert preferences are persisted. There is no active customer odds-alert dispatcher or connected Discord delivery service, and the UI discloses that limitation.

## 9. Plans, checkout, subscriptions and feature access

The original marketing page showed illustrative monthly previews: Premium 19.99, Premium+ 29.99, and Pro 79.99, with an illustrative annual multiplier. The synthetic admin sandbox separately used Free/Starter/Pro/Founder examples and contradictory prices. None were production price authority. No production prices were invented or created.

The current API/landing catalog was corrected to avoid advertising unavailable paid features:

| Access | Implemented mapping and purchase state |
| --- | --- |
| Free verified account | Account area, personal bet tracker, saved personal data/filters |
| Premium | Free features plus player research, trends, prediction models, and simulations |
| Premium+ | Historical name/amount preserved; checkout disabled in both the API result and the server checkout handler because no distinct authorized offering exists. A configured Price ID cannot bypass this restriction. Existing explicitly mapped records retain research access without promising extra tools. |
| Pro | Premium research plus the complete existing EV/odds workspace, entered line movement, EV indicators/shared quote feed, arbitrage, Smart Money, manual/example fantasy tools, boosts and middles |
| Staff access grant | An audited, reasoned, finite grant of a defined plan, separate from provider payment records |

The existing EV tabs use URL fragments and a shared complete quote response. Fragments do not reach the server, and the same raw data supports multiple calculations; therefore the complete `/ev` live shell and `/api/ev/*` reads require Pro. Lower-tier odds-screen/line-movement claims were removed, and unimplemented automated alerts are not advertised as paid entitlements. The explicit `/ev?demo=1` example shell remains public while its live APIs stay gated. Reopening Premium+ for sale requires actual working features and their server authorization, not just enabling a price or changing copy.

`public/landing-pricing.js` now reads the real plan API. Purchasable amounts come only from active configured recurring Stripe Prices. Historical amounts remain clearly labeled previews when the provider/interval is unavailable. The historical annual preview is not advertised as a live discount. The Account UI shows the plan's unavailable reason.

`lib/accounts/billing.mjs` implements server-selected Price IDs, verified-email checkout, reuse/expiration of pending sessions, canonical subscription checks preventing duplicate checkout, and a customer portal derived only from the current user's customer mapping. The success redirect alone never grants access.

The signed raw-body webhook validates signature age and live/test environment, serializes each customer, retrieves canonical subscriptions/current invoice payments, and atomically commits subscription state, event receipt, audit and notification. Duplicate/concurrent deliveries are idempotent; stale event payloads cannot restore canceled access. Unmapped customer IDs or metadata cannot claim another user's account. Unknown prices fail closed.

Access expires per request, independent of cron. Paid status requires active/trialing status, a future period/trial boundary, and a paid current invoice or active trial. Failed/unpaid/paused/incomplete/canceled/expired periods lose paid access. Scheduled period-end cancellation retains access until the boundary. Full current-invoice refunds/credit notes and disputed current payments remove paid access; partial/older-invoice refunds do not automatically erase a separately paid current period. Provider test-mode and production behavior still require a real connected integration test.

There is no imported Founder lifetime entitlement, automated self-service trial offer, or working Insiders integration.

## 10. Staff accounts, roles and audit

The production staff surface is `/admin/accounts`; `/admin/login` leads through normal sign-in with a staff destination. Authorization checks server roles and MFA, not the old sandbox's browser-selected role.

| Role | Account-related permission |
| --- | --- |
| Owner | Inspect, suspend/restore, revoke sessions, grant/revoke access, manage supported staff roles, data/content permission |
| Admin | Inspect, suspend/restore, revoke sessions, grant/revoke access, data/content permission; cannot assign roles or modify owners |
| Support | Inspect accounts only |
| Data Operator | Authorized provider data operations; no customer administration authority |
| Content | Content permission foundation; no customer administration authority |
| Customer | No staff permission |

Account search returns selected profile/status fields. Privileged changes require MFA, recent reauthentication, a reason, and a persisted audit entry. Self/owner changes are protected. Grants do not rewrite Stripe payment records. Suspension, role changes and explicit session revocation remove affected sessions. No support impersonation was introduced.

`scripts/accounts.mjs bootstrap-owner EMAIL` is an explicit privileged-console operation. It requires an already active, email-verified account with a verified authenticator, locks the initial ownership decision, refuses a second owner, records the operation and revokes sessions. There is no automatic first-user promotion, web bootstrap route, account creation, or password setting in that command.

## 11. Transactional communications

`lib/accounts/mail.mjs` contains actual HTML/text templates and outbox triggers for verification/resend, reset, password changed, old-address email changed, new sign-in, subscription activated/changed/canceled/payment failed, and trial started/ending/expired. Verification/recovery links use the configured account origin. Sensitive queued payloads are encrypted and cleared after successful delivery. The Resend request uses a durable idempotency key; failed attempts back off and remain retryable.

`lib/accounts/trials.mjs` queues finite-grant lifecycle notices with durable receipts, audit and outbox writes in one transaction. It handles concurrent sweeps, partial batch progress and failures without duplicate notices. Ending notices become due within 24 hours; expiry notifications are suppressed when other paid/granted access remains. New admin grants can enqueue their start notice immediately. Stripe trial lifecycle notices come from verified provider events.

On Vercel, request completion schedules an outbox delivery attempt with `waitUntil`. Local requests do not automatically drain mail: run the `mail-drain` CLI or an explicitly configured process job. Protected `/api/cron/accounts` and the CLI provide retries and grant sweeps. The configured Vercel account cron is daily; delivery timing is limited by the actual invocation schedule, and per-request access expiration does not depend on mail timing. The scheduler has not been exercised on a deployed production account service.

Transactional consent is separate from optional marketing consent. No marketing campaign sender was added.

## 12. User experience and rendered checks

The existing SportsLab typography, dark palette, navigation and plain-JavaScript architecture were reused. Registration, sign-in, recovery, MFA and Account/staff settings include labels, keyboard-operable controls, field-level/helpful statuses, focusable security dialogs, loading states and actionable failure paths. Passwords are sent in JSON bodies, not URLs. Client-visible errors omit provider/database exception text.

Browser verification drives real HTTP endpoints, cookie sessions, password hashing, verification/reset links from a local delivery adapter, authenticator/recovery challenges, Account changes and staff actions. Screenshots include desktop/mobile registration, Account settings, recovery, staff account management and the rendered verification message. The browser result artifact records no horizontal overflow on the tested mobile views and no uncaught page errors.

This is local Chromium verification, not an assertion of testing every mobile operating system, assistive technology, browser version or external inbox client.

## 13. Database, migrations and preserved records

`lib/accounts/database.mjs` provides PostgreSQL and development-only SQLite. Better Auth migrations supply user, credential identity, session, verification, MFA and provider limiter models. Application migrations add profile, personal data, consent, audit, single-use email-link receipt, limiter, encrypted email outbox, deletion request, billing-customer, subscription, billing-event, finite grant and trial-notice tables. Unique provider/account identity and owner/category constraints prevent ambiguous ownership; account-owned rows use foreign keys.

Migrations are explicit and additive. The final `2026-09-28-accounts-v1-ready` marker is written only after all account/billing/trial migrations and identity uniqueness succeed; startup refuses an incomplete schema. A failed initialization closes its newly opened database. The original migration marker remains available as the serialized bootstrap lock.

The actual CLI migration was executed successfully against a fresh local in-memory database. Durable hosted PostgreSQL, pool/TLS behavior, backup restore and production migration were not exercised because no database service was connected. Operator instructions cover backup consistency, preserving encryption keys, code rollback without schema deletion, and reconciliation after restores. See [account-operations.md](account-operations.md).

## 14. Security review and fixes

The focused review and tests addressed account enumeration, registration/reset abuse, credential stuffing, MFA/recovery replay, email-token replay and stale address binding, unsafe redirects/origins, session revocation, client-controlled roles, cross-user data and portal ownership, missing paid-route checks, global EV-provider writes, webhook forgery/order/duplication, plaintext bearer storage, and excessive error disclosure.

Review findings corrected during implementation included: invalid reauthentication timestamps passing a naive age comparison; raw authorization-layer server errors; missing old-address notices when an email-change link is opened without a session; startup database cleanup on failure; premature migration-readiness marking; and transactional hooks/outbox calls needing the provider's active database transaction. Legacy anonymous-route tests were updated to use real test account sessions rather than disabling authorization.

All account/provider routes are allowlisted. Unknown APIs fail closed. EV writes require Data Operator authority, MFA, current session and recent reauthentication. Existing prediction crons and the new account cron use the service secret instead of customer cookies. OAuth linking and unsafe impersonation are absent rather than assumed secure.

This was a scoped implementation review with security-critical tests, not a formal repository-wide security scan, independent penetration test, compliance certification or guarantee against every vulnerability. The original application has other analytics/rendering code outside this account review. Password breach-list coverage, production monitoring/retention, real service configuration and deployment verification remain operational work or explicit limitations.

## 15. Test evidence and actual integration limits

The implementation uses real Better Auth handlers, hashing/TOTP/recovery logic, SQLite constraints and transactions, and actual HTTP/cookie flows in local tests. Stripe tests use the real SDK's signature generation/verification and a local canonical-provider adapter. Email tests encrypt and drain the actual outbox into a local transport. These are meaningful local integration tests; they do not establish delivery or payments over an external production network.

| Required journey or boundary | Evidence |
| --- | --- |
| Register → verify once → login → permitted account use; duplicate address/consent | `test/account-auth.test.mjs`, `test/account-browser.mjs` |
| Login → logout → login; selected/all-session revocation; encrypted bearer storage | `test/account-auth.test.mjs` |
| Generic forgot-password → single-use reset → old sessions revoked; expiry | `test/account-auth.test.mjs`, browser recovery flow |
| Recent reauthentication → email change → new-address verification → session revocation/old-address notice | `test/account-auth.test.mjs` |
| Actual authenticator enrollment → challenge → one-time recovery code/replay rejection | `test/account-auth.test.mjs`, browser MFA flow |
| Free paid-API denial; customer/admin-without-MFA denial; suspended-session denial | `test/account-auth.test.mjs`; existing production-server route tests use the test-only real-account fixture |
| Verified paid event → Pro; duplicate/out-of-order/canceled/expired/payment-failed/refunded access | `test/account-billing.test.mjs` |
| Price/customer/portal ownership; configured Premium+ remains unpurchasable | `test/account-billing.test.mjs` |
| Other users' bets/filters unavailable; stale-tab identity/version conflicts | `test/account-auth.test.mjs`, `test/account-sync.test.mjs` |
| Explicit legacy import, shared-device isolation, draft/conflict recovery and failed hydration | `test/account-sync.test.mjs` |
| Explicit first owner/MFA policy, concurrent bootstrap, grant-mail receipts/rollback/batching | `test/account-operations.test.mjs` |
| Client origin/redirect/error handling; unavailable billing UI | `test/account-ui.test.mjs`, browser flow |
| Responsive registration/recovery/Account/admin and mobile email template | `reports/account-browser-results.json` and associated screenshots |

Reproducible commands:

```powershell
node --test test/account-auth.test.mjs test/account-billing.test.mjs test/account-operations.test.mjs test/account-sync.test.mjs test/account-ui.test.mjs
node test/account-browser.mjs
node test/account-browser-pricing.mjs
npm test
npm run check
```

The browser command requires an available Playwright/Chromium runtime; `PLAYWRIGHT_MODULE` can identify the installed runtime used by the fixture. No production credentials are needed for the disposable test database or local email/Stripe adapters.

Verification artifacts are `reports/account-tests.txt`, `reports/account-integration-tests.txt`, `reports/account-full-tests.txt`, `reports/account-check.txt`, `reports/account-browser-results.json`, and `reports/account-pricing-browser-results.json`. The final account aggregate records **53 tests passed, zero failed**. The final existing-server integration run records **4 tests passed**, covering deployment, bet-import routes and simulation routes with real account sessions. `npm run check` passed.

The main browser run records **21 checks passed**, including staff and mobile flows. A separate final targeted run records **19 checks passed**, covering monthly/annual pricing, unconfigured and unavailable billing states, disabled Premium+ purchase, mobile overflow, suspended sign-in through actual password validation, and accessible names/descriptions for all three security/admin dialogs. Both browser runs recorded zero uncaught JavaScript errors. The 21-check run was not repeated after these final accessibility changes. Billing and operations tests were rerun after the catalog correction and passed.

A subsequent concurrent admin edit temporarily imported `admin-operations.mjs` before that file existed. After its implementation landed, the account HTTP module imported successfully and the combined account/server regression run passed **57 of 57 tests** (`reports/account-post-integration-tests.txt`). The new admin module, HTTP handler and server also passed syntax checks. The broader admin expansion is being verified by its separate active chat; these results do not claim coverage of all those new controls.

The latest saved full-repository run, executed by the concurrent mobile audit and independently checked here in `reports/mobile-full-tests.txt`, records **1,889 tests passed, zero failed**, in 18.5 seconds. It supersedes this task's earlier 1,810-test run with two EV fixture/formatting failures and the temporary missing-admin-module failure during concurrent editing. Further edits after that run require their own relevant verification.

## 16. Production blockers, remaining limits and file map

The account foundation is implemented and locally exercised. Production activation still requires these exact inputs/actions:

1. **Durable account database:** connect a production PostgreSQL service through `DATABASE_URL`; confirm provider TLS/pooling, run the migration, and restore-test backups. PostgreSQL was not tested live.
2. **Account origin and key:** configure the real HTTPS `BETTER_AUTH_URL` and a durable random `BETTER_AUTH_SECRET`; retain the key version with encrypted database backups. Do not generate throwaway production keys on each boot.
3. **Transactional delivery:** connect `RESEND_API_KEY` and `EMAIL_FROM` at a verified sending domain; complete DNS/domain requirements and verify actual verification/reset/security/billing messages reach inboxes.
4. **Payments:** connect matching-environment `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, approved `STRIPE_PRICE_PREMIUM_MONTHLY/ANNUAL` and/or `STRIPE_PRICE_PRO_MONTHLY/ANNUAL`; configure the portal and signed `/api/billing/webhook`; run real test-mode checkout/renewal/cancel/failure/refund/replay journeys. Premium+ variables are reserved mappings, not an override of its disabled checkout.
5. **Policies:** review/publish the Terms and Privacy drafts for the actual business/operator/retention practices, then set `POLICY_APPROVED_VERSION=2026-09-28` only when that version is approved.
6. **Service jobs and operator:** configure `CRON_SECRET`, verify deployed account-cron/outbox processing, and bootstrap the explicit verified-MFA owner from the privileged CLI. No owner was silently created in the real environment.
7. **Release validation:** deploy the active Node app, verify production secure cookies/session persistence/mobile journeys, and measure abuse controls and mail/webhook monitoring. Recheck changes made after the recorded passing repository run before release.

The following are deliberately still unavailable or manual: passkeys; Google/Apple OAuth; Discord linking/delivery; customer odds-alert dispatch; Insiders; a distinct Premium+ offering; external Founder lifetime migration; automatic deletion fulfillment; and automatic recovery when all MFA/recovery methods are lost. Privacy requests record and disable access, but an authorized operator must complete provider/data deletion and retention review as documented. No real Stripe charge, production email delivery, external backup, production deployment, or hosted database connection is claimed by this task.

| Area | Main implementation paths |
| --- | --- |
| Runtime/server integration | `server.mjs`, `lib/accounts/runtime.mjs`, `lib/accounts/http.mjs`, `vercel.json`, `Start-App.cmd`, package manifest/lockfile |
| Auth, secrets and database | `lib/accounts/auth.mjs`, `lib/accounts/secure-adapter.mjs`, `lib/accounts/database.mjs` |
| Billing/access | `lib/accounts/billing.mjs`, `lib/accounts/entitlements.mjs`, `public/landing-pricing.js` |
| Email/trials/operations | `lib/accounts/mail.mjs`, `lib/accounts/trials.mjs`, `scripts/accounts.mjs`, `.env.example` |
| Customer UI | `public/register.html`, `public/login.html`, `public/recovery.html`, `public/auth.js`, `public/recovery.js`, `public/account.html`, `public/account.js`, `public/account-client.js`, account styles |
| Staff UI | `public/admin-accounts.html`, `public/admin-accounts.js` |
| Policy drafts | `public/account-terms.html`, `public/account-privacy.html` |
| Existing product data integration | `public/account-sync.js`, tracker/bet utilities, research notes, saved filters/watchlists, odds/preference consumers and shared navigation |
| Tests and evidence | Account test files listed above, `test/helpers/account-fixture.mjs`, `reports/account-*` artifacts |
| Audit and operating instructions | `docs/account-initial-audit.md`, `docs/account-operations.md`, this report |

References used for the security/payment decisions: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [NIST SP 800-63B-4 authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/), [Stripe webhooks](https://docs.stripe.com/webhooks), and [Stripe invoice payments](https://docs.stripe.com/api/invoice-payment/list). The implementation also used the installed Better Auth/Stripe versions' source and type definitions to verify provider behavior.

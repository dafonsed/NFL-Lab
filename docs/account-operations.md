# Account operations and release checklist

Current plan display names and owner-approved monthly amounts are mapped in [pricing-plans.md](pricing-plans.md). That subsequent pricing update supersedes the display names below while preserving the documented legacy plan IDs, Stripe environment keys and authorization behavior.

The active application is the Node HTTP server in `server.mjs`. The `sites-*` folders are old static previews and cannot run these accounts. Account records use PostgreSQL in hosted environments and SQLite only for local development. Sports-provider Blob storage is not an account database.

This runbook describes implemented commands and operational steps. It does not establish that production database, email, payments, cron, or backup services have been connected or tested. The initial repository had no connected account, email, or billing provider. See `docs/account-initial-audit.md` for the original state and browser-data migration boundary.

## Configuration

Copy `.env.example` to an untracked file for local use, or configure server-only deployment secrets. Never place these values in public JavaScript, screenshots, analytics, source control, or support tickets. Keep preview/test and production environments separate.

| Variable | Required use |
| --- | --- |
| `BETTER_AUTH_URL` | Exact application origin, such as `https://your-domain.example`. Hosted accounts require HTTPS. Local browser and server configuration must both use either `127.0.0.1` or `localhost`. |
| `BETTER_AUTH_SECRET` | At least 32 characters of cryptographically random secret material managed by the operator. Also protects encrypted MFA secrets, session tokens, and pending transactional email. |
| `DATABASE_URL` | Durable PostgreSQL connection for hosted/production accounts. Use the database provider's approved TLS and connection pooling settings. Never use a temporary serverless SQLite file. |
| `ACCOUNT_DB_PATH` | Optional local SQLite path, default `data/accounts.sqlite`. Ignored when PostgreSQL is configured. |
| `RESEND_API_KEY` | Transactional email provider credential. |
| `EMAIL_FROM` | Sender at a domain verified with Resend, including required domain/DNS verification. |
| `POLICY_APPROVED_VERSION` | Set to `2026-09-28` only after reviewing and publishing the matching Terms and Privacy Policy. The shipped policies are operational drafts; this value is an operator assertion, not a substitute for review. |
| `STRIPE_SECRET_KEY` | Correct environment's Stripe secret key. Checkout and billing portal use the server-side SDK. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this environment's `/api/billing/webhook` endpoint. The Stripe API key is not a webhook signing secret. |
| `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_ANNUAL` | Approved recurring Premium Price IDs. Leave unoffered intervals blank. |
| `STRIPE_PRICE_PREMIUM_PLUS_MONTHLY`, `STRIPE_PRICE_PREMIUM_PLUS_ANNUAL` | Reserved Premium+ reconciliation mapping. New Premium+ checkout remains disabled because its product scope is not distinct in this repository. Do not offer this tier until its working features and authorization are defined. |
| `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL` | Approved recurring Pro Price IDs. |
| `CRON_SECRET` | Strong service credential for the existing prediction crons and `/api/cron/accounts`. |
| `PUBLIC_SITE_URL` | Existing marketing canonical origin; align it with the deployed site. Account links use `BETTER_AUTH_URL`. |
| `BLOB_READ_WRITE_TOKEN`, `EV_TOOL_API_URL`, `EV_TOOL_API_KEY` | Existing analytics services, independent of customer authentication. The EV upstream is still LAN-only and unavailable on Vercel. |

Registration, verification, password reset, and password/email changes report unavailable when transactional email is not configured. Billing reports unavailable until Stripe secrets are configured; each purchasable amount comes from a configured, active Stripe Price. Existing landing prices were illustrative and do not authorize creating production prices. No Google, Apple, Discord, or passkey connection is configured; there are no pretend connection buttons.

## Migrate and start

Run from the repository root with the intended environment explicitly loaded:

```powershell
npm ci
node --env-file-if-exists=.env.local scripts/accounts.mjs migrate
node --env-file-if-exists=.env.local server.mjs
```

In production, inject the deployment's secrets rather than uploading a local environment file. Run the migration once from a trusted release console before routing traffic to the new deployment. Startup does not silently migrate production databases.

The command uses Better Auth's supported migrations and additive application migrations. It creates user, credential identity, session, verification, authenticator, limiter, profile, consent, personal-data, audit, one-use email-link, encrypted outbox, deletion-request, billing-customer, subscription, webhook-event, finite-access-grant, and trial-notice tables. Provider/account identity uniqueness is enforced. It does not import synthetic admin users or infer customers from emails, invoices, browser storage, or sample data.

No existing server accounts were found in the repository. If an external customer system exists, first inventory it and prepare an explicit provider/user-ID and subscription-customer mapping. Do not import identities by email match alone. Do not discard existing customers or issue new subscriptions during migration. Existing browser bets, notes, watchlists, filters, and preferences are preserved until their owner explicitly imports them in Account settings.

Before a production migration, make and restore-test an encrypted provider snapshot, including account tables and the corresponding secret version. For local SQLite, stop account writers and take a consistent SQLite backup including WAL handling; copying only the main file during live writes is unsafe. Store backups outside the deployment bundle and control operator access.

Roll back code without dropping the additive schema or replacing the database with an old snapshot. A restore can discard registrations, password changes, revocations, billing events, and deletion requests received after the snapshot; stop writes and reconcile those records before allowing traffic. Keep webhook delivery/retries and the outbox recoverable. A restored canceled subscription must not regain access because its cancellation event receipt was lost.

Do not replace `BETTER_AUTH_SECRET` casually. It encrypts persisted information as well as signing sessions. A planned rotation needs a provider-supported key migration/re-encryption strategy, session invalidation, recoverable email delivery, and MFA recovery testing. Changing only the environment variable can strand existing records.

## Bootstrap the first owner

There is no first-user-becomes-admin behavior and no HTTP bootstrap endpoint.

1. Register the intended owner as an ordinary customer and verify the email through actual delivery.
2. Sign in, reauthenticate, enable an authenticator, verify its first code, and store the recovery codes securely.
3. From a privileged deployment console with administrator authority over the intended database, run:

```powershell
node --env-file-if-exists=.env.local scripts/accounts.mjs bootstrap-owner owner@your-domain.example
```

The command requires an existing active account, verified email, enabled MFA, and a verified authenticator record. It serializes concurrent bootstrap attempts, refuses to add another owner after one exists, writes an audit event, and revokes the promoted user's sessions. Sign in again and complete MFA to use `/admin/accounts`. The CLI never creates an account, reads a password, or sets a password.

Treat CLI/DB access as privileged deployment authority. Ordinary application users must not receive these credentials or a shell that can run this command. The owner's in-product controls may assign Admin, Support, Data Operator, and Content roles; server permissions remain authoritative. All staff require MFA. Support can inspect customers but cannot set passwords, grant access, or modify roles.

Owner transfer or loss of all owner MFA/recovery codes is a controlled operator recovery, not an automated support bypass. Confirm authority using the organization's established offline recovery procedure, enroll and verify the replacement person's authenticator, record an immutable audit reason, atomically transfer the owner role, and revoke affected sessions. Preserve at least one verified owner. This release deliberately has no unauthenticated owner-reset or support-impersonation route.

## Billing setup and verification

Configure the Stripe customer portal in the same Stripe environment and restrict portal products/prices to the approved offering. Enable Stripe's “limit customers to one subscription” setting as an additional safeguard. The server already reuses open checkout sessions, locks customer mutations, checks canonical subscriptions before new checkout, and derives the portal customer exclusively from the authenticated user.

Create the signed endpoint at `BETTER_AUTH_URL/api/billing/webhook`. Use the API version supported by the installed Stripe SDK and subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.subscription.trial_will_end
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.marked_uncollectible
charge.refunded
refund.created
refund.updated
credit_note.created
credit_note.voided
charge.dispute.created
charge.dispute.closed
```

Checkout uses card payments. A success redirect does not grant access. The signed webhook retrieves current Stripe subscriptions and their current invoice payments under a database customer lock. Customer IDs must already belong to the server-created mapping; event metadata and email addresses cannot claim accounts. Subscription state, event receipt, audit, and queued email commit atomically, so a failure can safely retry. Unexpected price IDs fail closed. Events from the wrong live/test environment are rejected.

Access requires active/trialing status, a future billing/trial boundary, and a paid current invoice (or an active trial). `past_due`, unpaid, paused, incomplete, canceled, expired, and fully refunded current periods lose paid access. Cancellation scheduled for the period end preserves access until that boundary. Partial refunds retain service. Full refunds/credit notes of the current invoice and disputed current payments remove paid access; a subsequent valid paid period can restore it. A refund of an older invoice does not cancel a separately paid current period. Review dispute resolution with the provider before restoring any disputed entitlement.

| Plan/access | Server feature mapping |
| --- | --- |
| Free verified account | Account management, personal bet tracker, saved filters/data |
| Premium | Free features plus research, trends, models and simulations |
| Premium+ | Historical preview retained; not offered for checkout, including when a Price ID is configured. Existing explicitly mapped records retain research access; no distinct extra features are advertised. |
| Pro | Premium research features plus the complete shared EV workspace: odds screen, entered line movement, EV indicators/feed, arbitrage, smart-money, manual/example fantasy tools, boosts and middles |
| Staff grant | One of the above plans, with a reason, actor, and finite expiry; no edits to Stripe payment records |

The existing `/ev` workspace selects tools using URL fragments and shares the complete quote payload. Its live shell/API require Pro until the data service offers genuinely separate responses; client-selected tabs cannot authorize raw data. The former Premium odds-screen/alert claims and Premium+ extra-feature claims were removed from the current catalog and pricing UI because they were not reachable under that policy. Historical illustrative price amounts remain unchanged, and real offered prices come from Stripe. `/ev?demo=1` is a public example shell while live APIs remain protected. Unknown APIs fail closed. EV provider writes/scraping/deletion additionally require a recently reauthenticated staff account with Data Operator permission and MFA.

Founder and self-service trial products were not established by actual billing records. Synthetic admin fixture names do not create production plans. Insiders and external alert/Discord delivery are not implemented paid integrations. Stored notification/alert preferences do not establish a running odds-monitor or delivery service.

Before production, verify a real test-mode signup → delivered verification → login → checkout → signed event → paid tool journey, portal upgrades/downgrades/cancellation, failed payment, refund, delayed and duplicate events, and test-mode separation. Local tests verify logic and real SDK signatures against a local provider adapter; they do not prove Stripe network setup or live charges.

## Transactional mail and access-trial notices

The outbox stores encrypted payloads until successful delivery and then clears their payload. Resend receives a stable idempotency key. Failed sends retry with bounded backoff. Watch outbox backlog, attempt count, provider delivery/bounce results, cron failures, and subscription-webhook failures without logging message links or bearer values.

`/api/cron/accounts` requires `Authorization: Bearer <CRON_SECRET>`. The account cron sweeps finite grants and drains queued mail. A grant-start notice is generated once, an ending notice becomes due within 24 hours, and expiry is evaluated against the clock even if no webhook arrives. Receipts, mail, and audit commit together. Expired-grant mail is suppressed when another paid/granted entitlement remains. Revoked grants are not advertised as active trials. Stripe trials use verified provider lifecycle events, including `trial_will_end`.

Run the same safe drain manually from an authorized console:

```powershell
node --env-file-if-exists=.env.local scripts/accounts.mjs mail-drain
```

Schedule account cron often enough for the notification timing promised to customers. A once-daily schedule offers at most daily grant/expiry processing. Vercel requests use `waitUntil` for a delivery attempt; local requests require the CLI drain or an explicitly configured process job. Request-triggered delivery on Vercel does not replace a durable retry schedule. The server enforces access expiry per request even when email is delayed. Repeated runs do not send duplicate trial notices.

## Privacy requests and destructive operations

The account export requires recent reauthentication and returns only the session owner's records. The deletion-request route requires the literal confirmation `DELETE`, checks known renewal state, marks the account deletion-pending, and revokes its sessions. This is a recorded request requiring operator fulfillment; it is not an assertion that all production data has already been erased.

For fulfillment, use an authorized privacy/operator process:

1. Resolve the immutable user ID from the recorded request. Require the operator to confirm that exact ID against the request and backup/export record; never delete by a broad email/search match.
2. Revoke remaining sessions and grants, and verify canonical Stripe state. Complete cancellation of every recurring or incomplete subscription before removing billing ownership records. A locally cached cancellation or scheduled cancellation alone is insufficient proof that no future charge can occur.
3. Apply the approved retention policy to financial records, audit events, consent, backups, and abuse records. Retain only the justified records and document their retention/deletion dates. Do not silently promise immediate erasure of required financial records.
4. In a reviewed database transaction, delete the specified user's personal data, profile, credentials/identities, MFA records, verification/recovery records, links, sessions, grants, notice receipts, and account row, or anonymize retained records according to the approved policy. Check real foreign-key behavior first. Clean recipient-bearing pending email and any provider customer metadata as appropriate, without affecting another customer or an uncanceled subscription.
5. Keep a minimal audit/tombstone of fulfillment where the approved policy permits it. Ensure a backup restore reapplies completed deletions before reopening access. Handle provider-held data and browser drafts separately; server deletion cannot remotely erase a browser that is offline.

No bulk-delete or arbitrary-password-setting CLI is shipped. Do not use ad hoc email-based SQL, disable MFA for an unverified caller, or treat a support impersonation cookie as recovery. Deletion fulfillment and owner transfer remain privileged, documented manual operations.

## Verification commands and remaining external work

```powershell
node --test test/account-billing.test.mjs test/account-operations.test.mjs
node --check scripts/accounts.mjs
```

The account tests cover actual database constraints, signature verification, replay handling, entitlement expiry, tenant ownership, and transactional outbox behavior. Run the full account/browser journeys recorded in the task's final report before enabling production registration.

External release requirements remain: durable PostgreSQL and restore-tested backups; a stable production signing/encryption secret; HTTPS origin; approved policies; Resend verified sender and successful real delivery; Stripe test/live keys and approved Price IDs; configured portal; verified signed webhook delivery; and a working protected cron schedule. These are service connections/configuration steps, not credentials fabricated by this implementation.

Provider references: [Stripe webhook retries, signatures and ordering](https://docs.stripe.com/webhooks), [Stripe single-subscription checkout](https://docs.stripe.com/payments/checkout/limit-subscriptions), [Stripe invoice payments](https://docs.stripe.com/api/invoice-payment/list).

# Account system: initial repository audit

This records the state inspected before the account implementation in this task. It is not a claim that the original previews were production accounts. Review date: September 28, 2026 UTC.

## Existing application and deployment

- The application is a Node.js 22+ ES module HTTP server (`server.mjs`) with plain JavaScript browser modules and server-generated/static HTML. There is no Next.js, React, ORM, account database, or authentication library in the original package manifest.
- `vercel.json` deploys `server.mjs`, includes public assets and model artifacts, and schedules two prediction-capture cron routes. Local startup listens on loopback port 3100 and periodically refreshes sports data.
- Sports/model state uses provider files and private Vercel Blob for prediction history. This is not an account database. Serverless temporary storage is not suitable for durable account records.
- `.vercel/project.json` links the existing `nfl-lab` project. The local environment file contains these variable **names**: `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN`, `CRON_SECRET`, `EV_TOOL_API_URL`, `EV_TOOL_API_KEY`. Values were not included in this audit. No account database, authentication, transactional email, or Stripe credentials were configured there at inspection.
- The repository also contains multiple `sites-*` copies of past exported previews. They are not the active Node server. Production account changes must deploy the active application rather than an old static export.

## Routes and controls before implementation

| Surface | Initial behavior | Missing boundary or flow |
| --- | --- | --- |
| `/register`, `/register.html` | HTML form and client validation; `public/auth.js` explicitly says registration is unavailable and sends nothing | No account creation, consent record, email delivery, duplicate handling, or abuse limits |
| `/login`, `/login.html` | Password visibility and client validation only; no session request | No credential verification, cookies, session lifecycle, suspended-account handling, or redirects |
| Recovery / verification / logout | No working server routes | All recovery, email proof, and session revocation functionality |
| `/admin` and `/admin/*` | Publicly rendered **synthetic** sandbox, with sample users/billing and browser-selected role in `public/admin-store.js` | No protected real staff access, persisted roles, MFA, or trustworthy audit log. Sandbox rules must never authorize production actions |
| Analytics APIs (`/api/board`, `/api/nfl/research`, `/api/mlb/*`, `/api/sports/*`, `/api/*/live`, `/api/simulation/*`, `/api/bets/*`, performance/paper) | Public sports queries; no account ownership or plan checks | No paid entitlement enforcement; expensive calls available without an authenticated account |
| `/api/ev/*` | Proxy injects a server-held upstream API key; local-network endpoint allowlist; unavailable on Vercel | Local callers could invoke quote writes/scraping/deletion without a customer/staff session. A service API key does not authenticate the site user |
| `/api/cron/predictions`, `/api/cron/mlb-predictions` | Constant-time comparison with configured `CRON_SECRET` bearer token | Existing service boundary works as a separate machine credential; it must remain separate from customer sessions |
| Checkout / customer portal / webhooks | None | No billing provider, authoritative customer mapping, signature verification, duplicate-event ledger, or entitlement updates |
| Email / OAuth / Discord | None | No transactional templates/delivery, social account linking, or connected Discord accounts |

There are no existing production users, sessions, verification records, subscription models, or role models in this repository to migrate. This does **not** establish that no external customer system exists; no such service was connected. Do not infer accounts from synthetic admin samples.

## Plans actually represented

The public pricing preview names **Premium**, **Premium+**, and **Pro**, with illustrative monthly amounts of 19.99, 29.99, and 79.99 and a frontend annual-display multiplier. The landing page explicitly says subscriptions, trials, and checkout are inactive. The admin sandbox separately names Free, Starter, Pro, and Founder with synthetic billing amounts and seven-day trial examples. These two previews disagree and are not production price authority.

Configure checkout against actual provider price IDs and amounts verified from the billing service. Founder exists only in the synthetic sandbox and is not imported as a real plan or lifetime entitlement. Staff grants and trials must reference an implemented plan with an explicit finite expiration. Do not create a production recurring price or bill a customer based on either preview.

## Existing customer-owned browser data

Before this task, every browser on the same origin shared the following unowned keys. There was no stable user ID attached to them and no cross-device persistence:

| Category | Storage keys / code owners |
| --- | --- |
| Personal bets | `nfl-lab.personal-bets.v1` in `public/bet-utils.js`; `sportslab-ev-workbench-v1` legacy EV bets; `sportslab-bet-annotations-v1` comparison annotations |
| Research notes | `nfl-notes`, `mlb-lab-notes`, `sports-lab-notes-<sport>` in research, sport, and home modules |
| Saved players | `nfl-saved`, `mlb-lab-watchlist`, `sports-lab-saved-<sport>`, `sports-lab-trends-watchlist-<sport>` |
| Saved filters | `sports-lab-filter-presets:<sport>:<section>` in `public/workspace-ui.js` |
| Display / product preferences | `nfl-auto`, `sports-lab-display`, `sports-lab-dev-mode`, `sportslab-sportsbook-state-v1`, `sportslab-ev-display-v1`, `sportslab-ev-sharp-min`, `sportslab-docs-theme` |
| Observed research quotes | `sports-lab-line-observations-v1` in `public/player-research.js` |
| Product fixtures | `sportslab-ev-permanent-demo-v1` and `sportslab-ev-permanent-demo-bets-v1`; these mix predefined examples into a showcase and are not automatically imported as genuine customer records |
| Admin fixture | `sportslab-admin-sandbox-v1`; never import into an account or use as authorization |

Alerts and Discord delivery were illustrative metadata in the admin sandbox, not actual user-owned background delivery jobs. The existing EV-to-bet migration preserves original records and tracks import receipts; it should run only inside the correct owner's store after ownership is established.

## Implemented browser-data migration boundary

`public/account-sync.js` provides the Storage-like adapter now imported by the actual tracker, notes, watchlists, filters, research, and preference consumers. Product modules await account initialization before reading saved values.

1. Check the server session and load each account data category. If a category cannot load, refuse writes to it rather than replacing existing records with empty defaults.
2. Read/write only the session owner's versioned cloud records. Preserve the current product data shapes under `value.storage` so existing bet validation and migration continue to work. Preserve any sibling fields maintained by the Account UI.
3. Each request includes `X-Account-User`, an expected-identity binding. The server still chooses ownership from its session and rejects a mismatch. This prevents an old tab's queued edits from being written into a newly signed-in account during an account-switch race.
4. Namespace pending drafts by verified account ID. The adapter never automatically reads or uploads unowned legacy keys. Anonymous demos use memory for the current page; previously saved browser records remain untouched.
5. Account settings offer a separate import with explicit confirmation that this device's old records belong to the signed-in person. Existing cloud keys win; originals remain intact. Shared-device ownership cannot be inferred and is never assumed.
6. Use optimistic versions to reject concurrent overwrites. Keep pending drafts, show an actionable sync notice, and offer a pending-data download. Replacing local pending edits with the saved cloud version requires explicit confirmation.
7. The signed-in bet tracker reads personal account bets. The anonymous EV showcase can still display example bets. Demo and admin fixture keys are excluded from import.

Browser drafts are application data in origin storage, not authentication credentials or an authorization mechanism. They remain visible to a person with direct access to that browser's storage, as any unsent local draft would. Logout/session checks prevent the app from presenting or uploading another account's drafts, but shared devices should clear site data when transferring possession. Production session cookies and server checks remain authoritative.

## Security guidance consulted

- [NIST SP 800-63B-4, authenticator requirements](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/): password-only authentication requires a minimum of 15 characters; accept long passphrases, use a common/compromised-password blocklist and rate limits, and support password managers. Do not add arbitrary character-composition rules or routine forced expiration.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): generic failure responses, login throttling, recent reauthentication for sensitive actions, and session renewal after authentication changes.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): deny by default, enforce access on every request, and scope data to the authorized owner on the server.
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): generic request responses, expiring single-use reset tokens, request throttling, password-change notification, and appropriate session invalidation.

Automated browser-store tests cover explicit import, account-switch races, cross-account draft isolation, conflict preservation, recovery of pending drafts, failed hydration, and anonymous-demo behavior. This audit alone does not establish production email deliverability, payment processing, database durability, or mobile rendering; those require separately recorded integration checks.

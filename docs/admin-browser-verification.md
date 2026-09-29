# Connected admin browser verification

Verified against the actual application server with an isolated in-memory account database and genuine password/authenticator sign-in. Run `node test/helpers/admin-browser-fixture.mjs` to obtain a loopback launch page with disposable credentials. No production accounts, provider credentials, outbound messages, or payment operations were used. The EV inventory is an injected three-quote fixture; proxy filtering is tested independently against mocked upstream responses.

## Browser results

- Completed password sign-in and the real MFA challenge before entering `/admin`.
- Searched a real fixture customer and suspended the account. The server returned the suspended status; the customer sessions were absent in inspected records. Restored the account and verified both events and reasons in the audit history.
- Granted a finite Pro access period, inspected its persisted expiry and reason, then revoked it. Revoked another fixture user's sessions and changed that MFA-verified user's role to Support. All six account mutation controls completed through the UI.
- Submitted a report at `/support`, opened the persisted ticket in `/admin/operations`, marked it resolved, and added an internal note. The customer view showed the resolved status and original report, without the internal note.
- Created a notice draft, published it, and verified its body appeared at `/support`. Archived it and verified the public view returned “No current service notices.”
- Suppressed a fixture source, observed the stored “Suppressed” state, restored distribution, and observed “Allowed.” SQLite/proxy tests separately verify excluded quotes, event counts, newly arriving quotes, restoration, and failure behavior. Browser inventory alone is not evidence of live provider connectivity.
- Verified the actual operations view at 1280×900 and 390×844, including a mobile action dialog. No horizontal body overflow was observed; no browser console errors were recorded.
- Confirmed sandbox duration sorting produces 142, 186, 218, 1,840 milliseconds, followed by a missing value, and retains header focus. Ctrl+K preserved an unfinished edit and requested finishing/canceling it first.

The password proof helper reuses a successful confirmation for four minutes in the current page; every server mutation still enforces its own five-minute proof, current session, role, MFA, origin, and input validation. No password is cached. Moving between pages requires a fresh client confirmation.

## Evidence

- [Customer report and published notice](../reports/admin-connected-customer-proof.png)
- [Persisted distribution suppression](../reports/admin-connected-operations.png)
- [Operations mobile viewport](../reports/admin-connected-operations-mobile.png)
- [Final connected operations view](../reports/admin-connected-final.png)
- [Connected backend regression results](../reports/admin-connected-tests.txt)
- [Operations HTTP checks](../reports/admin-http-operation-tests.txt)
- [Sandbox contract matrix](../reports/admin-control-matrix.json)

## Limits

The full repository test run completed with 1,912 passing tests and two failures in `test/site-layout.test.mjs` (EV stylesheet ordering at lines 95 and 226). These are outside the admin workflows; see [the full test output](../reports/admin-full-regression.txt). The repository syntax check passed. The focused connected-account/operations suites cover 51 tests, separately from the synthetic sandbox matrix.

These checks verify implemented code and isolated fixtures. They do not establish production deployment, PostgreSQL migration, account/email configuration, live provider reachability, payment execution, grading workers, outbound alert delivery, or server-side two-person approvals. `/admin-sandbox` remains sample-only. See [the complete capability audit](admin-capability-audit.md) and [connected operations setup](admin-connected-operations.md) before production setup.

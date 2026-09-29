# EV distribution controls

The real staff endpoint `/api/admin/market-controls` manages persisted source suppression and event quarantine for the normalized **local EV API bridge**. Its scope is `ev-local-api`. These controls use actual provider inventory and the account database, not the sandbox catalog.

Suppression removes matching quotes from successful `/api/ev/quotes` responses. `/api/ev/matches` is rebuilt from the same filtered quote inventory, so source suppression updates quote counts and removes matches with no remaining visible quotes. Restoration makes matching provider quotes available again. The upstream quote file is unchanged; no scraper, sportsbook connection, or collection job is stopped.

## Staff API

Both methods require an authenticated, verified staff account with the persisted `data` permission and completed authenticator verification. POST additionally requires the configured same origin, JSON, and recent password reauthentication. The HTTP layer derives the actor from the session.

- `GET /api/admin/market-controls` returns `scope`, `sources`, `events`, persisted `controls`, `inventoryUnavailable`, and `observedQuotes`. Each inventory item includes its `kind`, `key`, `label`, exact `selector`, `quoteCount`, `blocked`, `version`, and whether it was `observed` in the current provider snapshot.
- `POST /api/admin/market-controls` accepts `{ "kind": "source" | "event", "key": "inventory-key", "blocked": true | false, "expectedVersion": 0, "reason": "8–500 characters" }`. Use the version returned by GET; zero means no persisted rule exists. It returns the committed `control`, `effect: "distribution-suppression"`, and `upstreamChanged: false`.

Source keys normalize the provider's `book` string by Unicode normalization, whitespace normalization, and lowercase. Event keys use the bundled provider's existing match identity: the first 16 hexadecimal characters of SHA-256 over the exact UTF-8 `sport + "|" + event` strings. They do not identify unrelated ESPN/research events. Because the upstream match identity has no separate start-time component, a later quote with the same sport and event text matches the persisted rule until it is restored.

Unknown inventory keys are rejected. Stale versions and unchanged states return conflict responses. A mutation and its account audit event commit together; an audit failure rolls back the mutation. Audit events record the real actor, selector key, reason, previous blocked state, new state, and version. These operations use direct authenticated execution; they do not implement independent two-person approvals.

## Provider failures and freshness

If quote inventory is unavailable, GET returns the stored rules with `inventoryUnavailable: true`, `inventoryError`, `observedQuotes: null`, and `observed: false`. It does not manufacture sources or events. Existing persisted controls can still be restored. A new control requires a valid current provider inventory.

The quote proxy reads controls directly from the database after fetching each upstream snapshot, immediately before serving. There is no process cache of rules or filtered responses. Responses use `Cache-Control: no-store`. If the control database is unavailable or corrupt, or the upstream snapshot is incomplete, no unfiltered odds are returned; the controlled quote endpoint responds with an unavailable error.

An already open browser retains its prior saved quote snapshot until its next successful API sync. That sync replaces all old `local-api` quotes and removes their no-longer-retained history, including suppressed quotes. The controls do not push instant invalidations to open browsers. If a sync fails, existing consumer behavior retains the earlier snapshot. Manually entered prices, permanent demo prices, ESPN live/research boards, and other feed families are outside this control's scope.

## Persistence and verification

The additive account migration creates `adminMarketControl`. Run the documented account migration procedure before deploying the new endpoint against an existing database. The rule's scope, kind, and key form its primary key; optimistic versions protect against stale writes.

`node --test test/admin-market-controls.test.mjs` verifies real SQLite persistence and reopening, source and event filtering, match reconstruction, newly arriving quotes, restoration, stale/concurrent writes, transactional audit rollback, provider failure, invalid inventory, corrupt rules, and the actual proxy response path. Its provider is injected test data; these tests do not establish that a deployed EV provider is reachable. The authenticated HTTP contract is exercised separately in `test/admin-live-api.test.mjs`.

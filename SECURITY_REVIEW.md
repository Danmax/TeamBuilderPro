# Team Builder security review

Reviewed November 9, 2026. Scope: current repository, installed dependency advisories, authentication and room permissions, realtime input handling, DJ uploads/media/deletion, settings persistence, browser credential handling, tracked-file secret patterns, and read-only checks of the hosted app and MySQL account. Attack reproductions used isolated local test servers. No attacks were run against production. No production application, database-grant, or firewall changes were made in this review.

## Confirmed application vulnerabilities fixed

Severity below is an assessment of application impact, not a formally assigned CVSS score.

| Severity | Finding and impact | Fix and verification |
| --- | --- | --- |
| High | **Unauthenticated realtime process crash.** Supplying a non-function acknowledgement argument to a Socket.IO event threw an uncaught exception. A local reproduction terminated the server with exit code 1. Hostile coercion objects were another exception path. | Added a common realtime handler boundary that rejects invalid argument counts/types and catches malformed-input exceptions. Room-key validation now requires a string. Regression checks verify malformed acknowledgements, keys, and identities leave the server healthy. |
| High | **Host impersonation on reconnect.** An already joined guest could call `room:join` with their valid actor token and the host's display name. The reconnect branch skipped name uniqueness checks, while host authorization relied on the name. | Enforce name uniqueness before either reconnect or join. Regression verifies the guest keeps their original name and cannot delete the room. |
| High | **Cross-room DJ file deletion.** A room host could forge a track's `storageKey` to name a different room's audio. Both the track-delete endpoint and room cleanup trusted that client-controlled filename. `basename` prevented traversal outside the directory but did not enforce room ownership. | Enforce the server-generated filename format and owning room prefix before deleting library entries. Verified another room's file survives both the delete endpoint and room cleanup. |
| Medium | **Community approval bypass.** Creating a private room and changing `roomType` to `community` skipped the approval required when creating a community room directly. | Apply approval checks when an existing room becomes a community room; retain the authenticated admin path. Regression verifies rejection of an unapproved conversion and acceptance of an admin conversion. |
| Medium | **Private DJ media exposed by direct URL.** The static media mount did not check room privacy and marked audio publicly cacheable for a year. Anyone possessing a private track URL could fetch it. | Serve media through a room-authorized route with `private, no-store`. The player includes room access only on the app's own media URLs. Verified unauthorized access is denied, authenticated HTTP Range requests still return 206, and credentials are not attached to external/lookalike hosts. Previously cached public copies cannot be recalled by this code change. |

The first four exploit regression tests failed against the pre-fix application and passed after remediation. The media access test verifies the replacement for the previously unauthenticated static mount.

## Dependency update

The initial npm audit reported **three moderate package entries** (`qs`, Express, and body-parser) deriving from **one underlying qs advisory**, not three independent vulnerabilities. Updated the direct dependency and override from `qs` 6.16.0 to 6.17.1, with the lockfile updated and dependency install scripts disabled. The final `npm audit --json` reports **0 known advisories across the installed dependency tree**.

The upstream issue requires comma-format `qs.stringify` on attacker-influenced objects. No application call to that serialization path was found, so installed-package exposure was confirmed, but an exploitable app route for this particular dependency issue was not established. See the [maintainer advisory GHSA-6pq8-jhm2-2vcw](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw).

## Additional hardening completed

- Added production WebSocket Origin checks for the request host and explicitly configured `ALLOWED_ORIGINS`. Same-origin and non-browser clients remain supported; existing room/actor credentials are still required. Development retains its local split-server behavior. Socket.IO's CORS option alone does not restrict WebSocket connections; see its [official CORS documentation](https://socket.io/docs/v4/handling-cors/).
- Require both a loopback hostname and a loopback peer address for the development admin-password fallback. A forged Host header alone no longer meets the local-request check.
- New user-identity and room-access tokens use the existing cryptographic token generator when the browser supports `crypto.getRandomValues`; existing identities/tokens remain valid. The legacy-browser fallback still uses the existing random helper and should be removed if legacy browser support is dropped.
- Removed partial admin-token characters from startup logs for normal-length secrets.
- Reject malformed upload filename encoding with a 400 response.

## Remaining priorities

1. **Restrict database exposure and privileges.** Read-only checks confirm the MySQL account permits wildcard remote hosts, can drop schema objects, and the server does not require secure transport globally. The reviewed client connection is encrypted and verifies TLS identity. Limit allowed remote source addresses, require TLS for the account where hosting permits it, and separate schema migration privileges from the runtime user. Do not remove CREATE permissions until the current startup schema initializer is replaced or separated.
2. **Add durable abuse quotas.** Realtime event limiting is per socket and resets on reconnect. Room creation and anonymous settings identities have no global storage or connection quota. Existing per-request and per-room limits help, but repeated connections/identities can accumulate memory or disk usage. Add reverse-proxy-aware connection/creation budgets and retention limits for anonymous settings. No load or exhaustion test was run against production.
3. **Reduce browser credential exposure.** Admin tokens remain in localStorage, and CSP allows inline scripts. No working stored-XSS exploit was established in this review, but any future same-origin script injection could steal those tokens. Move to short-lived admin sessions with HttpOnly cookies and appropriate CSRF checks; extract inline scripts or use CSP nonces/hashes. Existing database preference sync excludes admin/room credentials and AI API keys.
4. **Move remaining games toward server validation.** Shared-state mutation guards specifically protect Family Face-Off, Checkers, Memory, Chinese Checkers, and Spin the Wheel. Other activities still accept guest-authored activity state. This can enable cheating or overwriting another player's answers/results; assess and migrate games individually. This is separate from the host-permission fixes above.
5. **Replace media query credentials with scoped tickets.** Private audio currently carries the existing room bearer token in a same-origin media request query because HTMLAudioElement cannot attach custom headers. Keep query strings out of access-log exports and analytics, and prefer short-lived, track-scoped playback tickets in a subsequent change. Room state never receives the authenticated playback URL.

Database grants, browser authentication architecture, production quotas, and the remaining games were not changed as part of these focused fixes.

## Checks and limits

- Full application suite: **88 tests passed**, including six security regression tests; one additional frontend credential-forwarding test passed separately (**89 total passing test cases**).
- Final npm audit: **0 reported advisories**. This is not a guarantee that application logic or dependencies have no unknown vulnerabilities.
- Tracked current files: no matches for the checked OpenAI/AWS/GitHub/private-key secret patterns; `.env` is untracked. This was not a complete Git-history secret scan.
- SQL adapters use bound parameters for settings keys and JSON values; remote MySQL uses verified TLS. No SQL injection was confirmed in the inspected adapters.
- Read-only production checks: HTTPS homepage serves CSP and HSTS; `.env` returned 403, `package.json` and `.runtime-data/room-meta.json` returned 404. The public config endpoint reports database storage connected at review time. These checks do not establish that all new fixes are deployed.
- No production deployment or push was performed by this review. The fixes require the updated backend and frontend together; configure `ALLOWED_ORIGINS` for any intended split-origin production frontend.

Primary regression coverage: `test/server.integration.test.js`, `test/dj-media-security.test.js`. Main code changes: `server.js`, `assets/js/activities/dj-booth.js`, `assets/js/storage-api.js`, `assets/js/domain-managers.js`, `package.json`, and `package-lock.json`.

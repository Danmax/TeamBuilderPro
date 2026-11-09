# Team Builder database review

Reviewed November 9, 2026 using read-only SQL, Hostinger configuration metadata, the live public configuration API, and the local persistence code. No tables, data, grants, environment variables, or deployed application files were changed during this review.

## Main finding

The database is reachable but empty, and the deployed app is not using it yet. The earlier connection check established that the credentials work; it did not initialize the schema or migrate application data.

| Item | Observed state |
| --- | --- |
| Database | `u130206374_TeamBuilder` |
| Account | `u130206374_TeamBuildAdmin` |
| Remote endpoint | `srv2104.hstgr.io:3306` |
| Server | MariaDB `11.8.9-MariaDB-log` |
| Connection | Verified TLS 1.3, `TLS_AES_256_GCM_SHA384` |
| Database encoding | `utf8mb4` / `utf8mb4_unicode_ci` |
| Tables / views | 0 / 0 |
| Indexes / constraints | 0 / 0; no schema exists to assess yet |
| Stored routines / triggers | 0 / 0 |
| Production database status | `/api/config` reports `storage.configDatabaseConnected: false` |
| Hosted database environment | No `DB_*` or `DATABASE_URL` keys configured; the hosting API masks variable values |

## Findings, in priority order

1. **Blocking — production has no database connection configuration.** The live website has the existing admin/model environment keys but no database variables, and the public status confirms disconnected storage. Deploy the MySQL-capable build and configure its database environment. On Hostinger, the deployed application uses `127.0.0.1:3306`; the remote hostname is for development connections from outside Hostinger. Preserve all existing environment variables when applying settings.

2. **High — most application data is outside SQL.** The current adapter stores only global configuration and reusable question collections. Rooms, ongoing games, room access tokens, feedback, host-access requests, and player profiles have separate file/browser storage. Connecting MySQL alone will not move those datasets or make profiles portable between devices. Confirm that runtime files survive deployments and back them up before any migration.

3. **High — remote database access and privileges are broader than runtime needs.** The Team Builder remote-access rule is `%` (any host). The server reports `require_secure_transport=OFF`, and this account's grants do not explicitly require TLS. The account also has schema-changing privileges such as `DROP`, `ALTER`, `CREATE`, routines, triggers, and events. Our tested connection is encrypted and verifies the server identity, but the account does not enforce that requirement for other clients. Prefer a narrowly scoped runtime user and separate migration credentials. Restrict remote access to the development hosts that need it, and require TLS for remote access if the hosting controls support account-level enforcement. Do not remove the current development route before a replacement is verified.

4. **High — failed SQL saves can still report success.** `persistConfigToDatabase()` catches write failures and only logs them; the admin save endpoint then returns `ok: true`. The pool-exists status flag also does not prove that subsequent writes are healthy. Because startup loads SQL after local files, an older database snapshot could overwrite a newer file fallback following an outage. This is a code-path risk, not an observed data-loss event. Surface storage failures, record a configuration revision/update time, and reconcile the newest successfully saved version explicitly. See `server.js` around `persistConfigToDatabase()` and the admin config route.

5. **Medium — bootstrap and schema changes are coupled to application startup.** `openConfigDatabase()` currently runs `CREATE TABLE IF NOT EXISTS app_config` and has no schema-version tracking. The current settings-table definition has a primary key and bound values, which is suitable for its single-key lookup. Move future schema changes into explicit, versioned migrations as the schema expands. See `lib/config-database.js`.

6. **Medium — SQL strict mode is not enabled in the observed connection.** The session mode is `IGNORE_SPACE,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`. Validate stricter SQL modes in staging before introducing typed tables, to catch invalid/truncated values instead of relying only on application validation.

## Where the app currently keeps data

| Data | Current location | Current MySQL adapter covers it? |
| --- | --- | --- |
| Global settings and question collections | Runtime feedback-state file, with optional `app_config` SQL storage | Yes, once configured and initialized |
| Rooms and active game state | `.runtime-data/shared-state.json` | No |
| Room/actor access tokens and private Memory state | `.runtime-data/room-meta.json` | No |
| Feedback and host-access requests | `.runtime-data/feedback-state.json` | No |
| Player profile, custom character, XP and statistics | Browser storage under `player-profile` | No |

The paths above are defaults; `DATA_DIR` can relocate server runtime files. The hosted environment currently has no `DATA_DIR` setting. No private application records or credentials were exported during the review.

## Suggested rollout

1. **Activate the existing settings adapter:** preserve current runtime files, deploy the compatible build, configure production credentials, initialize `app_config`, and verify an admin save followed by a restart/readback. Keep this separate from migrating rooms or player data.
2. **Make persistence failures explicit:** add revision-aware saves and health/error reporting before treating SQL as the source of truth.
3. **Define durable player identity:** decide how a player proves ownership across devices before moving profiles and custom characters out of browser storage.
4. **Add versioned tables:** `players`, `player_characters`, `rooms`, `room_members`, `game_sessions`, `game_results`, `feedback`, and `host_access_requests`, alongside `app_config` and question collections. Use foreign keys where records have stable owners, room-code uniqueness, membership uniqueness, and indexes for room status/activity and player/game history. Keep private game state separate from public room snapshots.
5. **Migrate in stages:** settings first, profiles/characters next, then rooms/game state. Validate row counts and game/profile behavior against the old store before switching each dataset.
6. **Verify recovery:** confirm backup scheduling and retention, test a restore into a separate database, and test disconnects, redeployment, and restart recovery. Backup configuration and restore success could not be confirmed through the available tools in this review.

## Limits

With no tables or records, there are no real queries, indexes, foreign keys, or data-integrity issues to benchmark in this database yet. The planned table names above are recommendations, not an existing schema or a completed migration. This review made no production changes.

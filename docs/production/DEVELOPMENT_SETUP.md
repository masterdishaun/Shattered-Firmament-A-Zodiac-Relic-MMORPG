# Development Setup

## Canonical repository

GitHub: https://github.com/masterdishaun/Shattered-Firmament-A-Zodiac-Relic-MMORPG

This repository is the source of truth. Use a local checkout as the working directory and commit/push meaningful changes here. Avoid maintaining a parallel project copy.

## Local paths

- Intended workspace: `D:\GitHub\Game Development`.
- Observed Godot 4.7.2 executable: `D:\GitHub\Game Development\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64.exe`.
- Expected repository checkout: `D:\GitHub\Game Development\Shattered-Firmament-A-Zodiac-Relic-MMORPG`. Verify it exists and points to the correct remote before use.

The Godot 4.7.2 executable reported `4.7.2.stable.official.ed1daf0bf`. It was invoked headlessly against the current minimal client project and exited successfully. The client has not yet been fully playtested or exported.

## Engine version

Use Godot 4.x; currently use installed 4.7.2 for initial development. Do not use Godot 3 LTS for this project unless an ADR approves a migration; the scaffold uses Godot 4 project settings and APIs.

## Toolchain

- Node.js supported LTS (pin version in toolchain metadata).
- Corepack + pnpm.
- TypeScript.
- PostgreSQL 15+ planned; initial SQL migration drafted, not applied to test database.
- Godot 4.7.2 for initial editor/headless checks.

## Commands

From the repository root:

- `corepack pnpm install`
- `corepack pnpm -r build`
- `corepack pnpm -r typecheck`
- `corepack pnpm -r test`
- `corepack pnpm -r lint`

Run Godot:

- `Godot_v4.7.2-stable_win64.exe --path client --editor`

## Status boundaries

Build/type-check/test/lint success applies only to the current scaffold. It does not establish a playable MMORPG, database integration, Colyseus admission, production performance or platform exports.

## Database migrations

- The workstation has PostgreSQL 17 installed. Integration tests use a disposable database; do not point test commands at a personal, shared or production database.
- Set `DATABASE_URL` to a development database before running `corepack pnpm --filter @shattered-firmament/server migrate`.
- The runner takes a PostgreSQL advisory lock, applies numbered SQL files transactionally, records a SHA-256 checksum, and refuses to silently reapply an edited migration.
- For integration tests, set `TEST_DATABASE_URL` to a dedicated database whose name ends in `_test`, then run `corepack pnpm --filter @shattered-firmament/server test`. The test suite verifies migration application, idempotent reruns and migration checksum drift. Without that variable, database integration tests are skipped locally.
- GitHub Actions provisions a fresh PostgreSQL 17 service and sets `TEST_DATABASE_URL` for every CI run.
- Never commit a real connection string, password, or production credential. The SQL migration remains an unreleased draft and can be revised until the first production release.

## Authentication configuration

- Copy `server/.env.example` to a local, untracked environment file and set `ACCESS_TOKEN_SECRET` to a cryptographically random value of at least 32 bytes. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Do not commit the resulting secret.
- The API fails closed for authentication routes when the database or a sufficiently long signing secret is not configured. Access tokens last 15 minutes; rotating refresh tokens last 30 days.
- Integration tests require `TEST_DATABASE_URL` pointing to a disposable database whose name ends in `_test`. The authentication suite creates an isolated schema and removes it after testing.

## API and game server ports

- HTTP API: `HOST` / `HTTP_PORT` (defaults `127.0.0.1:2567`).
- Colyseus WebSocket server: `GAME_HOST` / `GAME_PORT` (defaults `127.0.0.1:2568`); it starts only when `DATABASE_URL` is configured. Keep it behind the intended TLS/WebSocket edge in deployment.
- A join ticket is only usable once, expires after 60 seconds, and is consumed at room admission. A character with an active lease cannot be admitted into a second room connection until the lease is released or expires.

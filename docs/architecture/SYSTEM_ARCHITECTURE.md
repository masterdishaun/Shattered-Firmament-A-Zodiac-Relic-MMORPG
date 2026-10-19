# System Architecture Blueprint

## Baseline

- Godot 4.x client with GDScript; 2.5D isometric presentation, 3D characters/environments, fixed or semi-fixed camera.
- Node.js + TypeScript server.
- Colyseus authoritative room layer.
- PostgreSQL for accounts, characters, progression, inventory, professions, pets, quests, economy and transaction records.
- JSON Schema and TypeScript for shared contracts; Godot consumes schemas/fixtures or generated definitions, never imports TypeScript.
- Target 20 Hz authoritative simulation (50 ms tick).
- Monorepo: `client/`, `server/`, `shared/`, `docs/`, `infra/`, `tools/`.

## Trust boundary

Clients send intents (movement, skill target, interaction, trade proposal), not authoritative outcomes. Server validates movement speed/position, zone boundaries, line of sight, range, cooldowns, resources, targets, damage, inventory, XP, quest state, currency, loot and rewards. Client prediction is presentation-only and reconciles to server state.

Do not write to PostgreSQL every tick. Keep simulation state in memory; persist meaningful transactions, checkpoints and lifecycle changes.

## Authentication and room admission

1. HTTPS login, short-lived access credential and refresh-token rotation/revocation.
2. GET character list.
3. POST character selection; server validates ownership, status and faction/start region.
4. Issue short-lived single-use join ticket bound to account, character, destination, audience and protocol version.
5. Colyseus admission validates and atomically consumes ticket before exposing room state.
6. Send authoritative room-join/spawn state.

Reject expired/replayed tickets and cross-account access. Do not trust client-supplied faction or spawn. The ticket-consumption concurrency model must be integration-tested.

## Initial API surface

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `GET /v1/characters`
- `POST /v1/characters`
- `POST /v1/characters/{characterId}/select`
- `GET /health/live`
- `GET /health/ready`

Selection returns ticket, configured WSS endpoint and expiry. Browser WSS requires proxy Upgrade handling, idle timeouts, origin policy, rate limits and reconnect validation.

## Persistence domains

Initial schema domains: users, auth_sessions, characters, join_tickets, item_definitions, item_instances, pets, active_pets, account_professions, quest_progress, currency_wallets, currency_ledger, item_transactions and active_character_leases. The migration is a draft and has not yet been applied to a PostgreSQL instance. Further tables are needed for parties, boss schedules/spawns, loot rolls, market listings/orders, purchases/entitlements, audit trails, faction regions and content versions.

Invariants:

- Stable migration history.
- Case-insensitive unique account identity and character name.
- Ownership enforced at every boundary.
- Active pet must belong to the character summoning it.
- One-use tickets are atomically consumed.
- Currency/item transfers are transactional and idempotent.
- Reward claims protected against replay.
- Quest state server-authoritative; content version recorded.

## Real-time simulation and zones

- 20 Hz target; each tick has a bounded budget for movement, AI, combat and state changes.
- Interest management bounds entities delivered to a client.
- Snapshots/interpolation for remote entities; client prediction for local movement if appropriate.
- Zone metadata defines safe/contested/PvPvE rules, map revision, level bands and spawns.
- Safe-zone rules are checked server-side for attacker, target and zone transitions.
- Population capacity must be load-tested; tick rate is a target, not a verified performance claim.

## Content runtime

Faction, zone, quest, dungeon, boss, loot and reward definitions are data-driven, versioned, schema-validated and localisable. Completion and rewards are idempotent. Choice flags may affect dialogue and bounded regional outcomes; essential progression cannot be faction-exclusive.

## Economy integrity

Currency is recorded in an auditable ledger with a wallet projection updated in the same transaction. Market settlements, purchases, upgrades and loot grants need idempotency keys/replay protection. Premium receipts require platform verification; cosmetic entitlements must be separate from combat stats.

## Observability and operations

Track tick duration/overruns, room population, snapshot sizes, latency, reconnects, DB pool saturation, query duration, errors, currency/item flows, market concentration, loot distribution and boss outcomes. Encrypted backups and recurring restore drills are release requirements. Maintenance mode should consolidate regions without deleting progress.

## Required tests

Contract/schema tests; malformed-protocol tests; auth/ownership integration tests; ticket replay/expiry/concurrency tests; atomic trade/reward tests; migration/restore tests; safe-zone boundary tests; quest idempotency tests; boss reward anti-monopoly tests; performance/load tests and Godot export checks.

## Initial authentication and character API

- `POST /v1/auth/register` creates an account and session; `POST /v1/auth/login` accepts email or username plus password. Passwords use salted scrypt hashes; no plaintext password is stored.
- `POST /v1/auth/refresh` rotates refresh tokens. Only SHA-256 hashes of opaque refresh tokens are persisted. Replayed/revoked refresh tokens are rejected. Access tokens are HS256-signed, 15-minute bearer tokens and are checked against the active database session on protected requests.
- `POST /v1/auth/logout` revokes the active session; `GET /v1/auth/me` returns the authenticated account. Set `ACCESS_TOKEN_SECRET` to a cryptographically random secret of at least 32 bytes; auth routes fail closed if it is absent or too short.
- `GET /v1/characters` lists only the authenticated account's active characters. `POST /v1/characters` validates the archetype/faction and assigns the faction start map: Sovereign Sect ? `white_jade_bastion`, Ashen Syndicate ? `cinderwake`, Astral Concord ? `luminous_veil`.
- `POST /v1/characters/{characterId}/select` verifies ownership, updates last-played time and issues a random, 60-second join ticket. Only the SHA-256 ticket hash is stored, with account/character/destination/audience/protocol binding. Atomic ticket consumption at Colyseus admission is not implemented yet; these tickets must not be treated as consumed or usable by a game room until that integration exists.

This is an initial implementation slice. Production hardening still requires distributed rate limiting, email verification and account recovery, password reset, security monitoring, secret rotation policy, refresh-token family replay handling, and load/security testing.

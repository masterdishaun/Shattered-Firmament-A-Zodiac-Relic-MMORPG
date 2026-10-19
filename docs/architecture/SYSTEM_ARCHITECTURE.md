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
- `POST /v1/characters/{characterId}/select` verifies ownership, updates last-played time and issues a random, 60-second join ticket. Only the SHA-256 ticket hash is stored, with account/character/destination/audience/protocol binding. Ticket consumption at Colyseus admission is atomic and integration-tested. The server locks the ticket, validates its bound account/session/character and context, acquires the character lease, and marks it consumed in one transaction.

This is an initial implementation slice. Production hardening still requires distributed rate limiting, email verification and account recovery, password reset, security monitoring, secret rotation policy, refresh-token family replay handling, and load/security testing.

## Colyseus room admission

- When `DATABASE_URL` is configured, the process also starts the Colyseus WebSocket server on `GAME_HOST:GAME_PORT` (default `127.0.0.1:2568`); the HTTP API remains on `HOST:HTTP_PORT` (default `127.0.0.1:2567`).
- Clients request a ticket through the authenticated character-selection API, then request the `world` room with `joinTicket` in the Colyseus join options. The room accepts no client-provided account or character identity.
- `consumeJoinTicket` locks the ticket row, checks expiry, prior consumption, account/session status, character ownership, destination, audience and protocol version, then atomically acquires the character lease and marks the ticket consumed. Any failed step rolls back both changes. Replays are rejected.
- A character lease prevents concurrent room admission even from the same account session. The room renews leases while connected; revoked/expired sessions stop renewing. Graceful leave releases the lease; unexpected disconnects leave a 60-second expiry window.
- The current room sends the canonical `S2C_RoomJoinSuccess` envelope and maintains a 20 Hz server tick counter. Movement, combat, state replication, reconnection recovery, multi-process presence and load-tested capacity are not implemented; this is an admission/handshake foundation, not a playable MMORPG world.

## Godot client vertical slice

The current main scene generates a primitive 3D/isometric-style blockout at runtime: three faction-themed start platforms, a fixed orthographic camera, local WASD character movement with collision, a HUD and E-key relic inspection. Keys 1/2/3 preview the three faction starts. No third-party art is included. The HUD includes an HTTP account/character panel and the vendored Colyseus GDScript client; the end-to-end smoke test registers, selects a faction-bound character, consumes a one-time ticket and receives the room welcome message. Client prediction, authoritative movement, snapshots/replication, animation and export verification remain open.

## Godot Colyseus client integration

The official Colyseus native Godot SDK 0.18.7 was rejected after the Godot 4.7.2 headless editor exited with Windows access violation 0xC0000005 during shutdown. The repository instead vendors the MIT-licensed pure-GDScript client in client/addons/colyseus, pinned to upstream commit f17b084414a65e88b822cebdaa285cf9e1b80556; see its UPSTREAM.md for local patches and compatibility limits.

The end-to-end test verified the current client against the project's Colyseus 0.16.x server: HTTP matchmaking, WebSocket room admission, atomic one-time ticket consumption and receipt of S2C_RoomJoinSuccess. Schema state serialization is not used; the room sends explicit JSON snapshots. Reconnect recovery and multi-process deployment remain open.

## Authoritative movement and snapshots

- The world room runs a fixed 20 Hz simulation. Clients send C2S_MoveIntent messages containing only a monotonically increasing sequence and axisX/axisY values in [-1, 1]. Client-provided position, speed and delta time are not accepted.
- The server validates message shape, sequence ordering, finite/bounded axes and input rate; normalizes diagonal movement, clamps positions to the blockout bounds (x [-32, 32], y [-12, 12]), and derives facing server-side.
- Every simulation tick, the room broadcasts S2C_WorldSnapshot with server tick/time and the current player positions, facing, movement sequence and health. Godot interpolates its local avatar toward the authoritative snapshots and stops local movement simulation while connected.
- Character positions are checkpointed to PostgreSQL every five seconds and persisted again on room exit. The end-to-end test verifies movement changes on server snapshots and that the position is restored from PostgreSQL after disconnect.
- This is an initial single-room movement slice, not the complete world simulation. The first two-client Godot smoke test verifies that a second authenticated character appears in server snapshots, moves on the first client, renders as a named remote avatar, and disappears on logout. Per-zone collision and transitions, faction PvP boundaries, client prediction/reconciliation, combat, movement anti-cheat telemetry and load tests remain open.

## Authoritative blockout zones (Phase 12)

server/src/zones.ts owns the initial runtime geometry and zone policy. Each player is simulated against the bounds and collision footprints for their server-held mapId. The client sends a target map ID only; the server validates the source/target pair, faction start region and current gate coordinates, then assigns the destination and spawn. The same room currently hosts these blockout zones, but each client's world snapshots are filtered to the recipient's map. Position persistence stores the active map as well as coordinates.

Wayfarer Crossroads is protected (safeZone=true, pvpEnabled=false); Ashen Frontier is explicitly contested (safeZone=false, pvpEnabled=true). These flags are policy inputs for the future combat service, not evidence that combat/PvP has shipped. Zone geometry is provisional blockout data and must be reconciled against final collision meshes and validated by interactive playtests before release.

## Client movement prediction and reconciliation (Phase 13)

The Godot client advances its local avatar on a fixed 20 Hz prediction step using the same provisional speed and diagonal normalization as the server. Each move intent carries a monotonically increasing sequence. The server echoes the latest accepted sequence in that character's world snapshot; the client removes acknowledged inputs, resets its simulation position to the authoritative snapshot, and replays the still-unacknowledged intents. Small corrections preserve visual continuity through a decaying render offset; large corrections snap to server authority. The unacknowledged queue is bounded and cleared on disconnect. This is a responsiveness layer, not client authority: server bounds, collisions, faction restrictions and zone transitions remain decisive. Collision prediction is deliberately conservative/incomplete and server snapshots correct client-side drift.

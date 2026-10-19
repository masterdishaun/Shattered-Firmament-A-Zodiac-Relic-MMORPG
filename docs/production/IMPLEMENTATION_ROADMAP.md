# Implementation Roadmap and Release Gates

## Phase 0 — Repository and documentation control

- Establish this repository as source of truth.
- Publish charter, gameplay baseline, story bible, faction quest catalogue, economy spec, architecture and ADRs.
- Define documentation, content, issue, branch and review conventions.
  **Exit:** canonical decisions discoverable from README; contradictions reconciled.

## Phase 1 — Workspace/toolchain genesis

- pnpm workspace with `shared/` and `server/`; Godot project under `client/`.
- Formatting, lint, type check, unit tests and CI.
- Development environment and secret-free environment examples.
  **Exit:** clean install/build/typecheck/test/lint and truthful CI results.

## Phase 2 — Shared contracts and content schema

- Schemas for factions, quests, items, characters, progression, zones, dungeon/boss definitions, inventory, loot, trade and rewards.
- Validate content; detect duplicate IDs, missing prerequisites, cycles, invalid ranges and faction-exclusive essential progression.
  **Exit:** content validation and contract tests pass.

## Phase 3 — Persistence

- Review PostgreSQL migration, add migration runner and test-database workflow.
- Ownership, session, join ticket, currency/item ledger, quest, profession and inventory invariants.
- Idempotent transactions, rollback, backup/restore.
  **Exit:** real PostgreSQL integration tests prove constraints and recovery.

## Phase 4 — Authentication/character flow

- HTTPS auth, refresh-token rotation/revocation.
- Character create/list/select and designated faction spawn resolution.
- Short-lived one-time join ticket bound to account, character, destination, audience and protocol version.
  **Exit:** ownership, replay, expiry, concurrency, rate-limit and audit tests pass.

## Phase 5 — Authoritative real-time foundation

- Colyseus room admission, lifecycle and reconnects; target 20 Hz loop.
- Server-owned movement, collision, safe-zone rules and snapshots.
- Interest management and performance instrumentation.
  **Exit:** adversarial input tests and initial load benchmark pass.

## Phase 6 — Isometric vertical slice

- One isometric blockout, controllable 3D character, camera and collisions.
- Faction selection and at least one start flow.
- One quest chain, enemy encounter, server-authoritative XP/inventory and solo dungeon.
- Godot web/native export validation.
  **Exit:** playable end-to-end slice and performance profile.

## Phase 7 — Three faction starts and narrative runtime

- Three distinct starting regions, introductory dungeons, mentors and faction quest chains.
- Data-driven dialogue/quest choices, versioning, localisation and telemetry.
  **Exit:** no broken prerequisites; faction access tests pass; essential progression remains shared.

## Phase 8 — Economy and content systems

- Professions, currency ledger, crafting, marketplace, personal loot and bad-luck protection.
- Party dungeons and difficulty scaling.
  **Exit:** economy simulation and replay/duplication exploit tests pass.

## Phase 9 — PvP, bosses and scale

- Always-on designated PvP zones, contested objectives and safe-zone transitions.
- Scheduled world bosses and fair reward contribution.
  **Exit:** safe-zone exploit, reward-fairness and concurrency/load tests pass.

## Phase 10 — Closed test and launch readiness

- Progression/economy research, PvP/class/gear balance and stress tests.
- Privacy/security review, crash analytics, backups/restore drills, maintenance mode and sunset policy.
  **Exit:** explicit sign-off; unresolved critical security, data-loss or performance issues block launch.

## Status reporting

Every report distinguishes implemented, locally tested, integration-tested, load-tested, Godot-export-tested, deployed and production-verified. Never collapse these into a generic “done”.

## Progress log — 2026-10-19

- Added `.github/workflows/ci.yml` to run frozen pnpm installation, build, typecheck, tests and lint on pushes and pull requests targeting `main`, with a manual dispatch option. The first GitHub-hosted workflow result is pending until this change is pushed and Actions completes.
- Verified on the workstation after a frozen install: `pnpm build`, `pnpm typecheck`, `pnpm test` (4 tests), `pnpm lint`, and Godot 4.7.2 headless editor initialisation all exited successfully.
- Fixed stale canonical-document paths in `AGENTS.md` and formatted existing TypeScript/JSON files with Prettier.
- A disposable PostgreSQL 17 cluster was created locally for migration integration tests and removed after testing. The installed workstation PostgreSQL service was not accessed. CI now provisions a fresh PostgreSQL 17 test service.
- Phase 1 exit criteria passed on 2026-10-19. GitHub Actions run for the workspace CI workflow completed successfully: https://github.com/masterdishaun/Shattered-Firmament-A-Zodiac-Relic-MMORPG/actions/runs/39277218695. Phase 2 content contracts and graph invariants are in progress.

## Progress log — Phase 2 content contracts

- Added schemas for character archetypes, items, zones, dungeons, encounters, reward tables and the progression baseline; existing faction and quest schemas remain in use.
- Added example content for three faction starts and opening dungeons, encounters/rewards, initial archetypes/items, and the provisional level-100 progression model.
- Expanded automated content checks to detect duplicate IDs, missing quest prerequisites, prerequisite cycles, invalid faction-start/PvP rules, missing zone/reward/item references, invalid ranges and progression milestone drift.
- Local shared-content suite now has 9 passing tests; API suite has 2 passing tests. Full build, typecheck, tests, lint and Godot 4.7.2 headless editor initialisation were rerun successfully before commit.
- Phase 2 is in progress, not complete. Inventory/trade runtime schemas, skills/effects, localization/version loading and content-loader integration remain open.

## Progress log ? Phase 3 persistence foundation

- Added a numbered migration runner with a PostgreSQL advisory lock, transactional migration application, migration ledger, SHA-256 checksums and edited-migration drift detection. The CLI was executed against a disposable PostgreSQL 17 cluster: the first run applied 0001_initial.sql and the second run safely skipped it.
- Removed the transaction wrapper from the unreleased initial SQL draft so the runner can commit schema changes and the migration ledger record atomically.
- Added integration tests for initial schema creation, idempotent reruns and checksum drift; executed against a disposable PostgreSQL 17 cluster on the workstation: 2 migration tests passed.
- Added PostgreSQL 17 service and TEST_DATABASE_URL to GitHub Actions. CI must pass on the resulting commit before this phase is considered verified.

## Progress log ? Phase 2 completion candidate and persistence integrity

- Added inventory item-instance and trade-offer JSON Schemas plus sample direct and marketplace listings. Validation now rejects invalid UUID shapes, quantities, upgrade levels, prices, buyer/listing combinations and invalid timestamps.
- Expanded PostgreSQL integration coverage to test case-insensitive account uniqueness, valid faction constraints, item definition references, positive inventory quantity, pet ownership isolation, join-ticket and active-lease composite account ownership, non-negative wallet balances, ledger idempotency, migration drift and failed-migration rollback.
- Ran the full test suite against a disposable PostgreSQL 17 cluster: shared content 10/10, API and persistence 9/9. Build, TypeScript checks and lint pass. Temporary test cluster was shut down and removed.
- This completes the content-contract and initial database-integrity slice. Authentication and character-selection endpoints are the next implementation milestone.

## Progress log ? Phase 4 authentication and character entry

- Added salted scrypt password hashing, HS256-signed 15-minute access tokens, 30-day opaque refresh tokens stored only as SHA-256 hashes, session-backed authorization, refresh rotation, logout revocation and generic login failures.
- Added account registration, login by email or username, refresh, logout and current-account routes. Registration persists the account and initial session in one transaction.
- Added character list/create/select routes. Character creation validates archetype/faction and selects the matching protected faction start map. Selection verifies ownership and issues a 60-second join ticket with only its hash persisted.
- Added security-primitive and PostgreSQL-backed API tests covering password hashes, signed-token tampering/expiry, account registration, duplicate accounts, login failure, refresh replay, logout revocation, faction start map selection, ticket hash storage and cross-account character selection.
- Join-ticket consumption at Colyseus room admission, distributed rate limiting, email verification/recovery, refresh-family replay response and production security/load review remain outstanding.

## Progress log ? Phase 5 Colyseus admission foundation

- Bound each join ticket to its originating auth session in the unreleased initial schema; the composite foreign key prevents tickets mixing a user, session and character from different accounts.
- Implemented atomic join-ticket consumption with row locking, expiry/replay checks, account/session/character status checks, destination/audience/protocol binding, and transactional character-lease acquisition.
- Added a Colyseus `world` room that requires a join ticket, sends `S2C_RoomJoinSuccess`, tracks a 20 Hz server tick counter and renews character leases only while the auth session remains active. API and game servers use separate configurable ports.
- Integration tests now cover one-time ticket consumption, audience mismatch without consumption, concurrent character lease conflicts, and lease renewal stopping after logout. A standalone Colyseus start/shutdown smoke test passed against a disposable PostgreSQL 17 cluster.
- Remaining: movement/combat simulation, authoritative room state and snapshots, reconnection flow, rate limiting, production TLS/proxy deployment checks and real client connection testing.

## Progress log - Phase 6 Godot vertical-slice blockout

- Replaced the title-only main scene with a generated 3D/isometric-style blockout using Godot 4.7.2-compatible primitives and materials.
- Added three distinct faction start platforms and landmarks, local camera-relative WASD movement, collision, orthographic follow camera, HUD, faction-start preview keys and E-key relic interactions with faction-specific narrative snippets.
- Headless Godot 4.7.2 scene startup completed without script/parse errors after fixing two invalid material property accesses. This validates scene startup only; no interactive GUI playtest, visual review or export test has been completed.
- Remaining: GUI playtest, polish of zone visuals/collisions, character animation, client-server connection, authoritative movement and state replication.

## Progress log - Phase 7 client networking compatibility gate

- Evaluated official Colyseus native Godot SDK 0.18.7, pinned to the upstream release. The archive was checksum-verified before extraction.
- With the extension installed, the existing local prototype smoke passed, but Godot 4.7.2 headless editor shutdown exited with Windows access violation `0xC0000005`. This did not verify an actual network connection.
- Removed the uncommitted SDK binaries and installer rather than leave the workstation in an unstable editor state. No third-party SDK binaries were committed.
- Blocker: validate a compatible SDK build or another supported integration path before connecting the Godot client. API authentication, character selection and server-side Colyseus ticket admission are implemented and integration-tested independently.

## Progress log - Phase 8 Godot HTTP account panel

- Added an in-game online panel using Godot HTTPRequest for account registration/login, refresh rotation, logout, character creation/listing and join-ticket requests. Access/refresh tokens remain in memory; the UI does not persist credentials.
- Added a Godot API smoke test and ran it end-to-end against a temporary PostgreSQL 17 cluster plus the local API/game server: registration, refresh rotation, account lookup, faction-bound character creation, join-ticket issuance, logout and login-by-username all passed. The test database and server process were stopped and removed after the run.
- The online panel is intentionally honest about the remaining gap: it requests a server ticket and previews the character start locally but does not connect a WebSocket room until the Godot Colyseus SDK compatibility gate is resolved.

## Progress log - Phase 9 Godot-to-Colyseus room connection

- Rejected the official native Godot SDK beta after a repeatable editor-shutdown access violation. Vendored the MIT-licensed pure-GDScript client at upstream commit f17b084414a65e88b822cebdaa285cf9e1b80556 and documented the local fork patches.
- Adapted the client connection probe for the current Colyseus 0.16 transport, and removed logs that exposed reconnection tokens, session IDs, WebSocket URLs or complete room payloads.
- End-to-end verified with a disposable PostgreSQL 17 cluster and the local API/game server: register, refresh-token rotation, authenticated account lookup, faction-bound character creation, join-ticket request, WebSocket matchmaking, room admission, S2C_RoomJoinSuccess, logout and room disconnect all passed.
- Scope remains a room handshake only. Authoritative movement, input validation, state snapshots/replication, reconnect recovery and load testing remain open.

## Progress log - Phase 10 authoritative movement

- Added shared move-intent and world-snapshot contracts and JSON Schemas. Runtime movement validation rejects non-finite/out-of-range axes, non-monotonic sequences and extra client-authored speed/position fields.
- Added a fixed 20 Hz server simulation, normalized movement, server-derived facing, bounded world coordinates, per-client rate/invalid-input limits and S2C_WorldSnapshot broadcasts.
- Added five-second PostgreSQL position checkpoints and position persistence on room exit. Character creation now seeds server-owned positions at the three faction start pads.
- Godot sends only movement axes and sequence numbers while connected, stops local movement simulation, and interpolates the avatar toward authoritative snapshots.
- End-to-end test passed against disposable PostgreSQL 17 plus the local API/Colyseus server: account lifecycle, faction spawn, one-time ticket, room handshake, snapshot receipt, server-side movement, position persistence after disconnect, and logout. Server unit tests cover invalid inputs, speed normalization, bounds and safe time steps.
- Still open: remote player rendering, prediction/reconciliation, per-zone collision/transition checks, PvP/combat, reconnect recovery, and production load/security testing.

## Progress log - Phase 11 two-client world presence

- Added client-side remote-avatar rendering from authoritative world snapshots. Other characters are represented by faction-coloured capsule blockout models with name labels; their positions and facing interpolate toward server snapshots.
- Removed remote avatars when a character disappears from the snapshot or the local client leaves the world. The client SDK no longer prints every world snapshot, keeping movement traffic out of logs.
- Added client/tests/multiplayer_smoke.gd: two independent Godot clients register separate accounts, create characters in different faction start zones, join the world, observe each other, move one character via validated server inputs, verify the other client's snapshot, instantiate/check the remote avatar, and verify departure removes that avatar.
- The two-client smoke test passed against the local API/Colyseus server and a disposable PostgreSQL 17 cluster. The script reported GODOT_MULTIPLAYER_SMOKE=PASS; temporary database and server were shut down and removed.
- This verifies one-room multiplayer presence only. Separate zone rooms, collision/zone-transition enforcement, reconnect recovery, client prediction, combat/PvP and load testing remain open.

## Progress log - Phase 12 server-authoritative zones and collision

- Added server-owned blockout definitions for the three faction starts, protected Wayfarer Crossroads and contested Ashen Frontier. Zone definitions specify bounds, safe/PvP policy, gate positions and simple collision footprints for large start-zone landmarks.
- The 20 Hz movement simulation now clamps the character capsule inside its current map and resolves movement axis-by-axis against server-owned obstacle footprints; input cannot move a character across a map boundary.
- Added C2S_ZoneTransition: the client submits only a requested destination map ID. The server checks the authenticated character faction, current map, and gate position, then sets destination map and spawn coordinates itself. Invalid requests are rejected. Map IDs and coordinates from the client are never accepted as authoritative state.
- Snapshots are now scoped to the recipient's current map so players in different zones do not receive each other's character presence. Position checkpoints persist both coordinates and the authoritative active map. Admission validates persisted map/faction compatibility and walkable spawn coordinates, falling back to a server-owned spawn if stored state is invalid.
- Godot exposes a provisional T-key gate interaction for the blockout and applies the server-confirmed destination. Updated the two-client smoke test to verify zone isolation, transitions into the shared peace hub, and same-zone movement replication.
- Verification: full pnpm build/typecheck/test/lint passed; the server movement/zone suite has 24 passing tests. Godot 4.7.2 prototype smoke passed. A disposable PostgreSQL 17 cluster plus local API/Colyseus servers passed the two-client Godot E2E (GODOT_MULTIPLAYER_SMOKE=PASS); SQL verification confirmed both transitioned characters persisted zone.neutral-crossroads after logout. The disposable cluster and server were stopped and removed.
- PvP is currently zone metadata and a future combat authorization rule; combat and attacks are not implemented. This milestone does not claim attack-boundary testing, GUI playtesting, export validation, or production readiness.

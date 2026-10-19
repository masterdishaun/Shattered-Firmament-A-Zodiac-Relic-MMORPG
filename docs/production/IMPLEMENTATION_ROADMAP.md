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

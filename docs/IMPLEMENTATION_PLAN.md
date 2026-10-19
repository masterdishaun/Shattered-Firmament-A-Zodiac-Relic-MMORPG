# Shattered Firmament — Implementation Plan
**Version:** 0.3 · Active build plan

## Current status
A new project workspace exists at `C:\Users\masterdee\OneDrive - DishaunCodjoe\Projects\ShatteredFirmament`. No existing game repository was found in the connected GitHub repositories or inspected project directories, so a new workspace was established rather than modifying an unrelated project.

Completed in this initial pass:
- Story bible with central mystery, three morally nuanced factions, cast and five story arcs.
- Three faction starting arcs, four faction side quests per faction, and ten shared quest threads.
- Progression/economy design specification.
- pnpm workspace, shared TypeScript contracts, JSON Schemas and faction/quest fixtures.
- Initial quest catalogue of 25 metadata records with schema and faction-access tests.
- Minimal Godot 4.x GDScript client scene.
- Fastify liveness/readiness API scaffold and two health endpoint tests.
- Draft PostgreSQL migration for users, characters, sessions, join tickets, item definitions/instances, pets, account professions, quest progress, currency ledger/wallets, item transactions and active-character leases.
- Local build, type-check, tests and lint passed.

Not yet implemented or verified:
- PostgreSQL migration runner and execution against a real PostgreSQL instance.
- Authentication, refresh-token rotation and single-use join-ticket issue/consume flow.
- Character list/create/select endpoints.
- Colyseus transport/rooms and authoritative 20 Hz simulation.
- Movement, combat, skills, pets, inventory, quest progression, crafting, marketplace, loot and world-boss systems.
- Full in-game dialogue scripts, assets, maps, UI, Godot editor/export validation or deployment.

## Architecture baseline

- Client: Godot 4.x using GDScript, selected to preserve one codebase for intended web and native targets.
- Server: Node.js + TypeScript.
- Real-time layer: Colyseus authoritative rooms (pending).
- Simulation: 20 Hz target (50 ms tick).
- Database: PostgreSQL.
- Network: HTTPS authentication/character selection; short-lived single-use join tickets; WSS gameplay.
- Monorepo: `/server`, `/client`, `/shared`, `/docs`, `/infra`, `/tools`.
- Shared contracts: JSON Schema and TypeScript types. Godot consumes schemas/fixtures or generated definitions; it does not import TypeScript.
- Security: server owns movement validation, combat, drops, currency, progression, quest completion, item transfers and reward grants.
- No per-tick database writes; persistence is event/transaction driven.

## Implementation phases and gates

### Phase 0 — Design foundation (substantially complete)
- Story bible and faction identities.
- Three distinct starting zones and faction-specific questlines.
- Progression/economy specification.
**Gate:** review documents for internal consistency and flag open balance assumptions.

### Phase 1 — Repository genesis (initial scaffold complete)
- pnpm workspace, package layout and base TypeScript configuration.
- Minimal Godot project shell.
- Health endpoints and baseline tests.
**Gate:** keep install, build, type-check and tests green.

### Phase 2 — Shared contracts and content validation (in progress)
- JSON Schemas for factions and quests.
- Versioned quest metadata fixtures and initial catalog tests.
- Next: schemas for characters, inventory, economy, zones and dungeon results.
**Gate:** contract tests pass and client/server boundary is explicit.

### Phase 3 — Persistence foundation (migration drafted)
- Review and validate the initial PostgreSQL migration.
- Add a safe, immutable migration runner and apply migrations in a local test database.
- Add ownership, atomicity, idempotency and rollback integration tests.
**Gate:** integration tests prove ownership, atomicity, idempotency and rollback.

### Phase 4 — Authentication and character selection
- HTTPS authentication and refresh-token rotation/revocation.
- Character list/create/select endpoints.
- Short-lived single-use join ticket bound to account, character, destination, audience and protocol version.
**Gate:** ticket expiry/replay tests and ownership tests pass.

### Phase 5 — Authoritative world simulation
- Colyseus room lifecycle and admission.
- 20 Hz simulation with bounded work, interest management and snapshots.
- Authoritative movement, zones and safe-zone boundary checks.
- Reconnect and graceful room shutdown.
**Gate:** adversarial input, load and reconnect tests pass.

### Phase 6 — Vertical gameplay slice
- One faction start, one small region, one quest chain, one solo story dungeon.
- Server-authoritative EXP, cultivation, inventory and loot.
- Godot client connection, character entry and basic gameplay.
**Gate:** end-to-end playable slice; server/client contracts validated.

### Phase 7 — Faction and economy slice
- Three starting zones and faction-specific opening quests.
- Shared side quests and faction-state flags.
- Account-based professions, Silver ledger and a limited global marketplace.
**Gate:** economy simulation, exploit tests and faction access checks pass.

### Phase 8 — Group content and live operations
- Party dungeons, scaling rules, world-boss schedule and PvPvE objectives.
- Analytics, performance dashboards, backup/restore drills, rollback and maintenance-mode controls.
**Gate:** population/load targets and recovery procedures validated.

### Phase 9 — Closed testing and release gates
- Progression simulation and player tests.
- PvP fairness review and monetisation policy checks.
- Security review, privacy review, incident response and sunset plan.
**Gate:** explicit release sign-off; no unverified claims of readiness.

## Engineering rules

- Do not implement gameplay rules only in the client.
- No unreviewed mass edits or generated-file overwrites.
- Use immutable migration history and versioned content.
- Never log credentials, refresh tokens or full join tickets.
- Do not use AI-generated narrative as unreviewed live content; quest text and choices must pass continuity, accessibility and localisation review.
- Keep narrative content data-driven and localisable.
- Faction choice must not create permanent essential-progression lockouts.
- All economy and reward operations need idempotency and auditability.
- Do not claim tests passed unless they were executed and their results recorded.

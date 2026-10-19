# ADR 0004 — Canonical Repository Layout

- **Status:** Accepted
- **Date:** 2026-10-19

## Decision

Keep code, content and documentation in explicitly named roots:

- `client/`: Godot project, scenes, scripts, resources and importable assets.
- `server/`: API, Colyseus rooms, persistence, authoritative simulation and server tests.
- `shared/`: versioned JSON Schema, TypeScript protocol/content contracts, fixtures and validators.
- `docs/architecture/`: system and security architecture.
- `docs/design/`: gameplay, progression, economy, combat and monetisation.
- `docs/narrative/`: story canon, faction lore and quest catalogues.
- `docs/production/`: setup, roadmap, QA, deployment, incident and sunset plans.
- `docs/adr/`: numbered architecture decision records.
- `infra/`: CI, development services, deployment configuration (no secrets).
- `tools/`: content validation and balance simulators.

## Rules

Do not create duplicate canonical files at the repository root. If a document is moved, update all links in the same change. Keep tests next to packages or in their dedicated test directory. Build outputs, imports and dependencies stay ignored.

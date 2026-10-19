# Shattered Firmament: A Zodiac Relic MMORPG

> A cross-platform 2.5D isometric cultivation MMORPG about fractured celestial power, rival factions, Zodiac Guardians, relic hunting and the cost of deciding the world's future.

**This GitHub repository is the single source of truth.** All approved design, story canon, engineering plans, implementation and QA evidence must live here. Chat messages, local scratch folders and agent memory are not authoritative records.

## Presentation and platform

- **Perspective:** 2.5D isometric; 3D characters and environments under a fixed or semi-fixed camera.
- **Engine:** Godot 4.x. Godot 4.7.2 is installed at `D:\GitHub\Game Development\Godot_v4.7.2-stable_win64.exe\Godot_v4.7.2-stable_win64.exe`. Do not use Godot 3 for this scaffold unless an ADR approves migration.
- **Server:** Node.js + TypeScript, planned Colyseus authoritative rooms.
- **Database:** PostgreSQL.
- **Simulation target:** 20 Hz authoritative simulation.
- **Network:** HTTPS account/character flow, short-lived single-use join tickets, WSS gameplay.
- **Launch progression:** levels 1–100 and five cultivation realms.

_Battle of the Immortals_, _Jade Dynasty_, _Diablo_ and _Torchlight_ are inspiration only. Art, maps, scripts, characters, animations, UI and assets must be original or properly licensed. Do not copy proprietary assets or engine technology.

## Canonical decisions

- Sovereign Sect — Law — White Jade Bastion.
- Ashen Syndicate — Chaos — Cinderwake.
- Astral Concord — Balance — Luminous Veil.
- Faction choice gives a separate start, mentor, opening story, early dungeon and side quests; essential progression remains accessible to all factions.
- Balanced levelling; hybrid cultivation; vertical gear with bounded power growth.
- Hybrid player-driven economy, account-based professions, global marketplace and personal loot with selected bad-luck protection.
- Solo story dungeons, challenging group instances, raids and rotating world bosses.
- Always-on designated faction PvP, contested PvPvE objectives and protected peace zones.
- No paid-exclusive competitive power, punitive daily streaks, destructive upgrades or equipped-gear loss on PvP death.
- Cosmetic-first monetisation, generous catch-up and a planned maintenance/sunset policy.

## Canonical documentation

1. `docs/PROJECT_CHARTER.md`
2. `docs/design/GAMEPLAY_BASELINE.md`
3. `docs/design/PROGRESSION_ECONOMY_SPEC.md`
4. `docs/narrative/STORY_BIBLE.md`
5. `docs/narrative/FACTION_QUESTS.md`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. `docs/production/DEVELOPMENT_SETUP.md`
8. `docs/production/IMPLEMENTATION_ROADMAP.md`
9. `docs/adr/` — accepted architecture decisions.

## Structure

```text
client/     Godot project
server/     TypeScript API and authoritative simulation
shared/     Protocol types, JSON Schemas and content fixtures
docs/       Canonical narrative, gameplay, architecture and production docs
infra/      Local development, CI and deployment
tools/      Content validation and balance utilities
```

## Non-negotiable workflow

- This GitHub repository is authoritative. Every meaningful change must be committed here.
- Read `AGENTS.md` and relevant canonical docs before work.
- Use small reviewable changes; inspect diffs before edits; no unreviewed mass operations.
- Label estimates as provisional until simulations/playtests validate them.
- Do not claim tests passed unless executed; record commands and results.
- Never commit secrets, credentials, personal data or proprietary reference assets.
- Do not mark any phase complete until its exit criteria pass.

## Current status

Initial scaffold and documentation consolidation. The API health endpoints, shared schema/content tests and initial SQL migration draft exist. A GitHub Actions CI workflow now runs build, typecheck, tests and lint; its first hosted result is pending. Authentication, character persistence, migration execution, Colyseus rooms, authoritative movement/combat, actual world maps, complete dialogue, assets and Godot export verification remain outstanding. The SQL migration has not been run against PostgreSQL. Local build/typecheck/test/lint checks and Godot 4.7.2 headless editor initialisation passed; this does not mean the game is playable or production-ready.

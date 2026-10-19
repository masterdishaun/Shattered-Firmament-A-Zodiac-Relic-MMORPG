# Shattered Firmament: A Zodiac Relic MMORPG

> A cross-platform 2.5D isometric cultivation MMORPG about fractured celestial power, rival factions, Zodiac Guardians, relic hunting and the cost of deciding the world's future.

**This repository is the single source of truth for the project.** Design decisions, story canon, engineering plans, implementation and QA evidence must be documented here. Chat messages, local scratch folders and agent memory are not the authoritative project record.

## Presentation and platform

- **Camera:** fixed or semi-fixed isometric perspective, 2.5D presentation.
- **Graphics:** 3D characters and 3D environments composed for a readable 2D-style isometric camera, inspired by the presentation approach of *Battle of the Immortals*, *Diablo* and *Torchlight*.
- **Engine:** Godot 4.x; one client codebase intended for web and native platforms, subject to performance/export validation.
- **Server:** Node.js + TypeScript, with Colyseus for authoritative real-time rooms.
- **Database:** PostgreSQL.
- **Simulation target:** 20 Hz authoritative world simulation.
- **Networking:** HTTPS account/character flows; short-lived single-use join tickets; WSS gameplay.
- **Launch progression:** levels 1–100 and five cultivation realms.

Reference games are inspirational only. All art, lore, names, encounters, animation, UI and assets must be original or properly licensed; do not copy proprietary assets or engine technology.

## Canonical decisions

- Three factions with separate starts and distinct faction questlines:
  - Sovereign Sect — Law — White Jade Bastion.
  - Ashen Syndicate — Chaos — Cinderwake.
  - Astral Concord — Balance — Luminous Veil.
- Faction choice changes the starting region, mentor, opening storyline, early dungeon and side quests.
- Each faction has its own motivations and blind spots; no faction is simply good or evil.
- Balanced levelling, hybrid cultivation, vertical gear progression with bounded power growth.
- Hybrid player-driven economy, account-based professions, global marketplace, personal loot with selected bad-luck protection.
- Solo story dungeons, group difficulty tiers, raids and rotating scheduled world bosses.
- Always-on designated faction PvP zones, contested PvPvE objectives and protected peace zones.
- No equipped-gear loss on PvP death; no pay-to-win or paid-exclusive competitive power.
- No punitive daily attendance requirements; generous catch-up mechanics.
- Transparent upgrades with no destructive failure; planned maintenance mode and sunset policy.

## Repository structure

```text
.
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── docs/
│   ├── architecture/
│   ├── design/
│   ├── narrative/
│   ├── production/
│   └── adr/
├── client/        # Godot project
├── server/        # TypeScript API and authoritative simulation
├── shared/        # JSON Schema, protocol types and content contracts
├── infra/         # Local dev, CI and deployment configuration
└── tools/         # Validation, content and balance utilities
```

## Must-read documents

1. `docs/PROJECT_CHARTER.md`
2. `docs/design/GAMEPLAY_BASELINE.md`
3. `docs/narrative/STORY_BIBLE.md`
4. `docs/narrative/FACTION_QUESTS.md`
5. `docs/design/PROGRESSION_ECONOMY_SPEC.md`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. `docs/production/IMPLEMENTATION_ROADMAP.md`
8. `docs/adr/0001-2.5d-isometric-presentation.md`
9. `docs/adr/0002-repository-source-of-truth.md`

## Non-negotiable workflow

- This repository is authoritative. Every meaningful change must be committed here.
- Read `AGENTS.md` before work and update documentation when decisions change.
- Use small, reviewable changes; never overwrite or mass-delete files without inspection.
- Keep assumptions separate from validated values.
- Do not claim tests passed unless they were actually run; record commands and outcomes.
- No gameplay implementation may violate server authority, PvP safety rules, economy integrity or faction-access safeguards.
- Do not mark a project phase complete until its exit criteria pass.
- Never commit secrets, credentials or personal data.

## Current status

Repository genesis and documentation consolidation are underway. This repository began empty. The first commit establishes the organised source of truth. An initial local scaffold exists but must be reconciled deliberately; it is not already committed or production-ready.

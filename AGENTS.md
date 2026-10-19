# Agent Instructions — Shattered Firmament

## Authority and scope
Treat the canonical documents in `docs/` as the product-design source of truth. Before material design or architecture changes, read:
1. `README.md`
2. `docs/PROJECT_CHARTER.md`
3. `docs/design/GAMEPLAY_BASELINE.md`
4. `docs/narrative/STORY_BIBLE.md`
5. `docs/narrative/FACTION_QUESTS.md`
6. `docs/design/PROGRESSION_ECONOMY_SPEC.md`
7. `docs/architecture/SYSTEM_ARCHITECTURE.md`
8. `docs/production/IMPLEMENTATION_ROADMAP.md`
9. Relevant records under `docs/adr/`

## Non-negotiable product rules
- Godot 4.x client using GDScript; Node.js + TypeScript server; Colyseus authoritative real-time layer; PostgreSQL persistence.
- 20 Hz target simulation; no per-tick database writes.
- Client never authors authoritative position, damage, health, inventory, currency, EXP, quest completion or rewards.
- Faction choice changes starting region, characters, story and side quests.
- Essential progression cannot be permanently faction-exclusive, territory-locked or gated behind missed scheduled events.
- Factions must have admirable motives and dangerous blind spots; no simplistic good/evil faction.
- No paid-exclusive competitive power; no punitive daily streaks; transparent upgrades; no destructive upgrade failure; no equipped-gear loss on PvP death.
- Protected peace zones and always-on designated faction PvP zones.
- Use data-driven, versioned and localisable narrative content.
- Use Godot 4.7.2 for the current local baseline unless a new ADR changes the engine decision.

## Engineering rules
- Work in small, reviewable phases. Do not claim tests passed unless executed.
- Preserve existing files and inspect diffs before destructive changes.
- Use immutable PostgreSQL migrations and idempotent transactional rewards/trades.
- Validate quest content against JSON Schema and test faction-access invariants.
- Do not add secrets to the repository. Use `.env.example` only for placeholders.
- Do not silently change approved architecture or story canon; document proposed changes first.
- Keep generated build output out of linting and version control.
- Before calling a phase complete, run build, typecheck, tests and lint, and report actual results.
- Keep this file and all links aligned with the canonical repository layout whenever documents move.

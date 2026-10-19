# Shared Content Contracts

## Purpose

Shared content is authored as versioned JSON and validated against JSON Schema before loading. The TypeScript package exposes cross-language identifiers and protocol types, but Godot consumes JSON-compatible data rather than importing TypeScript.

## Current schemas

| Schema | Purpose |
| --- | --- |
| `faction-definition.schema.json` | Faction identity, philosophy, starting region and narrative blind spot |
| `quest-definition.schema.json` | Quest availability, level range, objectives, prerequisites, rewards and choice flags |
| `character-archetype.schema.json` | Playable role, base stats, faction availability and starter equipment/skills |
| `item-definition.schema.json` | Versioned item identity, rarity, binding, tradeability, stack limit and stats |
| `zone-definition.schema.json` | Level range, faction access, map revision and peace/PvP policy |
| `dungeon-definition.schema.json` | Dungeon mode, party range, zone, encounters, rewards and faction access |
| `encounter-definition.schema.json` | Encounter type, level range, tuning, zone, rewards and reward policy |
| `reward-table.schema.json` | Versioned reward entries, quantities, chances and tradeability |
| `progression-definition.schema.json` | Level cap, time-to-cap, cultivation breakthroughs and gear tiers |

## Canonical fixtures

Fixtures in `shared/fixtures/` are examples used by automated validation. They are not final balance values or a commitment that the referenced gameplay is implemented.

- `factions.json` — three canonical factions.
- `quest-catalog.json` — current 25-quest metadata catalogue.
- `character-archetypes.json` and `items.json` — initial archetype and item examples.
- `zones.json` — three protected faction starts, a neutral peace zone, a contested zone and a faction PvP zone.
- `dungeons.json`, `encounters.json` and `reward-tables.json` — three faction-opening dungeon examples.
- `progression.json` — provisional level-100 baseline, five cultivation breakthroughs and five equipment tiers.

## Cross-record invariants tested

- IDs are unique within each content collection.
- Quest level ranges are ordered, objective IDs are unique per quest, prerequisites exist, and the prerequisite graph has no cycles.
- A quest marked as essential progression cannot itself be faction-only. Faction opening arcs are alternatives, not one globally required quest.
- Every faction has a matching, unique starting region.
- Faction start and peace zones are safe and disallow PvP; faction PvP zones are explicitly unsafe and PvP-enabled.
- Character archetype starter equipment refers to known item definitions.
- Dungeon and encounter definitions refer to known zones and reward tables.
- Reward item references resolve to known item definitions; quantity ranges are ordered.
- Progression realm breakthroughs match the milestone list; gear ranges and growth ranges are ordered and bounded by level 100.

## Authority and security boundaries

Schemas validate data shape, not gameplay authority. The server must still validate ownership, faction membership, zone boundaries, encounter state, inventory capacity, reward eligibility, item binding, trade permissions and transaction idempotency at runtime. Never accept client-submitted damage, rewards, currency, inventory mutations or quest completion as authoritative.

## Known gaps

This phase does not yet define all runtime contracts. Inventory item-instance and trade-offer schemas, skills/effects, encounter spawn placement, localization keys, content-version migration, and runtime schema-loading integration remain future work. Sample encounter statistics and progression estimates are placeholders for later simulation and playtesting.

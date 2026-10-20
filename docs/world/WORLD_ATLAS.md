# Shattered Firmament World Atlas

**Status:** Canonical world-design baseline v1.0. Geography and content quantities below are planning targets, not shipped features or measured world sizes. Existing faction, story and gameplay canon takes precedence where explicitly established.

## 1. World pillars

1. **A continuous world, not a lobby of rooms.** Players travel across connected landscapes, roads, bridges, passes, coastlines and settlements. Client terrain sectors stream in and out without presenting a room transition for ordinary exploration.
2. **Three distinct beginnings, one shared history.** Every faction has a protected homeland, capital, mentor, opening quest arc, local wildlife, signature landmarks and introductory dungeon. Their discoveries converge on the same fractured Zodiac mystery.
3. **Geography communicates danger.** Architecture, vegetation, weather, enemy silhouettes, ambient sound, lighting and traversal teach players where they are and what they risk before a UI warning does.
4. **A world with reasons to return.** Quests, gathering, crafting, public events, elite patrols, hidden lore, world bosses, faction objectives and rotating encounters populate travel routes.
5. **One authoritative world state.** Godot is presentation and input. Server services own identity, position, collision, transitions, combat, NPC/encounter state, quest progress, loot and rewards.
6. **Cinematic stylised realism, PC first.** Use authored silhouettes, readable materials, layered atmospheric depth and restrained celestial effects. Optimise with profiling, level of detail, occlusion, instancing and streamed sectors; do not assume high-end hardware.

## 2. Canonical premise and faction anchors

The heavens fractured during an astral eclipse. Three factions interpret the crisis through different philosophies—Law, Chaos and Balance—and each uncovers evidence that a twelfth point was deliberately scratched from the Zodiac sigil. Their disagreement is not simply good versus evil: each faction protects people and has a consequential blind spot. Essential story progression ultimately remains accessible to all factions.

| Faction | Philosophy | Canonical homeland ID | Homeland identity | Opening questline |
| --- | --- | --- | --- | --- |
| Sovereign Sect | Law | `white_jade_bastion` | White Jade Bastion: terraced jade mountains, imperial wardworks, archives, reservoirs and sacred roads | `sovereign_the_ward_that_lied` — The Ward That Lied |
| Ashen Syndicate | Chaos | `cinderwake` | Cinderwake: ash valleys, extraction works, furnace districts, salvage camps and red-lit basalt ridges | `ashen_the_shard_that_sang` — The Shard That Sang |
| Astral Concord | Balance | `luminous_veil` | Luminous Veil: luminous rivers, memory forests, star observatories, misty lakes and ancient shrines | `concord_the_forest_that_remembered` — The Forest That Remembered |

These IDs are already used by existing content and server code. Preserve them; never rename IDs merely to improve display text.

## 3. Macro geography: the First Continent

The First Continent is the initial master-map planning unit. Its named regions below are proposed world-content IDs/names, not yet implemented maps. Connect them through plausible terrain and travel routes; the continent should not feel like three isolated islands.

### Homeland arc (levels 1–20)

**White Jade Bastion — Sovereign Sect.** A tiered mountain capital and its surrounding terraces. Landmark set: Jade Gate, Lower Terrace, Ward Engine, Quiet Reservoir, Ancestral Steps, Underterrace Archive entrance and a high-altitude sect sanctuary. The contrast between immaculate upper terraces and neglected lower districts supports the opening story. Starter enemies include ward constructs, mountain fauna and corrupted spirits.

**Cinderwake — Ashen Syndicate.** A working fortress-city built around salvage and heat extraction. Landmark set: Furnace Crown, Salvager's Market, Worker Warrens, Broken Lift, Ashen Causeway and Cinder Vault entrance. Safe settlement space should sit beside dangerous extraction routes, not be indistinguishable from them. Starter enemies include furnace husks, scavengers, ash beasts and unstable constructs.

**Luminous Veil — Astral Concord.** A river-and-forest settlement network connected by bridges, shrine paths and observatories. Landmark set: Moonwater Landing, Memorywood, River Shrine, Starfall Observatory, Veiled Causeway and Drowned Shrine entrance. Memory anomalies should be expressed in world geometry, sound and repeated environmental details rather than dialogue alone.

Each homeland contains: one main safe settlement/capital; two or more smaller hamlets, camps or sanctuaries; a training/mentor space; gathering loops; at least three discoverable landmarks; several enemy pockets with safe travel corridors; one elite encounter; faction side quests; and one introductory dungeon entrance. These are content-design targets to be implemented in slices, not claims that all are already present.

### Shared low-level convergence (levels 10–30)

**Wayfarer Crossroads** (`zone.neutral-crossroads`, existing ID) is the first neutral meeting point. Expand the blockout into a genuine road junction with a caravan yard, inn, public board, neutral traders, a guarded bridge and exits toward three regional routes. It is a protected peace zone. Its story introduces displaced communities and evidence that all three factions have been affected by the same celestial event.

**The Ashen Frontier** (`zone.ashen-frontier`, existing ID) is currently the first contested-zone blockout. Evolve it into a broad transition wilderness, not the whole endgame PvP map: ruined watchtowers, broken roads, monster nests, relic dig sites and visible faction patrol routes. Retain the current PvP policy only after explicit game-design review and communicate contested boundaries clearly.

### Midgame ring (levels 25–60)

1. **The Verdant Meridian** — ancient forest and overgrown pilgrimage roads; spirit-beast ecology, herbalism, hidden shrines and a settlement that refuses faction rule.
2. **The Sunken Provinces** — flooded lowlands, half-submerged cities, ferries and drowned archives; exploration, waterlogged ruins and the Drowned Covenant dungeon/raid chain.
3. **The Glasswind Steppe** — windswept grasslands, crystalline impact fields and caravan routes; mounted-travel candidate, roaming elites and trade-route public events.
4. **The Ironveil Range** — snow passes, mining enclaves, high-altitude monasteries and sealed observatories; weather exposure is initially atmospheric/gameplay-light, not a punitive survival system.
5. **The Hollow March** — scarred battlefield, abandoned forts and unstable rift pockets; faction objectives, elite hunts and carefully bounded PvP.

### Endgame ring (levels 55–100 and post-cap mastery)

1. **The Shattered Crown** — broken imperial plateau surrounding a major fracture in the firmament; world-boss routes and multi-step regional restoration.
2. **The Astral Scar** — anomalous terrain where gravity, sky and memory appear damaged; high-level exploration and layered public events.
3. **The Twelvefold Reach** — a late-game region tied to the erased Zodiac point, with shared story prerequisites and multiple approaches to the central mystery.
4. **The Celestial Threshold** — endgame hub/approach zone for raids, seasonal world events and the major story finale. Access requires narrative progression, not a purchasable shortcut.

Names and levels for the midgame/endgame ring are provisional until the narrative bible and level-100 progression plan are reconciled. Do not create every region at once; the first production slice should fully realise one homeland and the first shared route.

## 4. Settlement hierarchy and services

- **Faction capital:** high-density social hub; faction story, character services, crafting/profession stations, storage, market access, trainers, guild services and cosmetic/social spaces.
- **Regional city:** several quest chains, specialist crafting, regional market, transport links and a strong architectural identity.
- **Town/village:** local quest hub, repair/merchant services, gathering routes, local lore and a safe respawn option only where narrative/gameplay permits.
- **Outpost/camp:** limited vendor/repair or quest services, patrols and a clear risk gradient beyond its perimeter.
- **Ruin/shrine/landmark:** exploration, lore, puzzles, collectibles, rare gathering nodes or a one-time encounter; not every landmark needs a quest marker.
- **Dungeon portal/entrance:** physically visible and diegetic in the world, with a readable approach, NPC/party interaction and admission validation. The entry point remains in the overworld; the dungeon interior may be an instance.

Travel networks should support foot travel and discoverable shortcuts first. Fast travel is unlocked through exploration and faction services, has clear destinations and should not erase the value of the world. Teleports cannot bypass quest gates, faction restrictions or server-side admission checks.

## 5. Quest and narrative structure

### Opening arcs

Use the existing `docs/narrative/FACTION_QUESTS.md` as canonical for the three level 1–20 stories and introductory dungeons:

- Sovereign Sect: **The Ward That Lied**; evidence is hidden in the Underterrace Archive; introductory dungeon boss is the Census Warden.
- Ashen Syndicate: **The Shard That Sang**; illegal extraction and workers' memories lead to the Cinder Vault; introductory boss is the Furnace Saint.
- Astral Concord: **The Forest That Remembered**; memory anomalies lead to the Drowned Shrine; introductory boss is the Echo-Bound Guardian.

### Quest cadence

A region should mix: main story beats; short local stories; repeatable contracts with caps/rotation; exploration discoveries; profession/gathering requests; public events; elite/rare hunts; dungeon prerequisites; and optional choices. Avoid a corridor of mandatory kill quests. NPCs should react to the player's prior decisions where feasible, while core progression remains recoverable.

Every quest has stable ID/version, prerequisites, level/faction conditions, objective IDs, optional objectives, dialogue/localisation keys, choice flags, rewards, repeatability/catch-up policy, analytics events and automated tests. Server-side progress is idempotent and records the content version used to complete it.

### Dungeon and encounter placement

Each homeland has one introductory solo-capable dungeon, a later revisit or challenge variant, and optional outdoor elites. Shared regions add group dungeons and raids. A portal is not an excuse to instance an ordinary outdoor zone. Use instances for encounter isolation, boss resets, party composition, story variants and capacity control; use shared outdoor space for exploration, gathering, patrols and public world events.

## 6. Biome and visual language

| Biome | Silhouette/material language | Lighting/atmosphere | Gameplay identity |
| --- | --- | --- | --- |
| Jade highlands | stepped stone, pale jade, carved timber, banners, water channels | cool dawn, mist, warm lanterns | vertical paths, ward puzzles, construct patrols |
| Cinder valleys | basalt, iron, weathered timber, furnace glass, salvage | ember bounce, smoke layers, red dusk | hazardous works, ambushes, resource routes |
| Luminous riverlands | wet stone, silver wood, hanging bridges, translucent mineral | cyan/blue twilight, reflected starlight | tracking, memory anomalies, spirit encounters |
| Verdant Meridian | layered canopy, giant roots, mossy ruins, shrine gates | sun shafts, humid haze | navigation, gathering, hidden passages |
| Sunken Provinces | drowned masonry, reeds, ferry piers, submerged statues | green-blue water light, low fog | vertical ruins, flooded paths, environmental puzzles |
| Glasswind Steppe | tall grass, crystalline shards, worn roads, caravan silhouettes | wide sky, dust and heat shimmer | long sightlines, caravans, roaming threats |
| Ironveil Range | snow stone, dark pines, exposed rock, prayer flags | hard snow light, storm fronts | passes, ambush pockets, distant vistas |
| Shattered Crown / Astral Scar | broken stone planes, floating fragments, fracture-glass, impossible ruins | controlled celestial distortion | high-level events, world bosses, traversal challenges |

Keep effects legible and restrained: strong silhouettes first, material variation second, VFX third. Avoid relying on expensive post-processing to make every area feel premium.

## 7. World scale and density targets

The design target is a large world whose distances are meaningful. Do not commit to a square-kilometre total until an in-engine traversal prototype establishes movement speed, camera framing, draw distance, memory budget and time-to-destination.

Measure and tune by player experience:

- Homeland capital to first quest hub: 30–90 seconds on foot.
- Starting settlement to first elite pocket: 1–3 minutes, with clear return routes.
- Homeland to shared crossroads: a short, readable journey with at least one discoverable landmark.
- Major cross-continent journey: several minutes on foot, shortened later by earned travel services.
- Every major route: visible destination cue, at least one encounter or discovery, and an alternative path or meaningful choice where geography permits.
- Every zone: safe/contested policy, recommended level range, spawn rules, enemy budget, gathering budget, landmark set, quest hooks, performance budget and streaming neighbours.

These timings are first-pass design targets, not measured results. Validate with playtests before locking world dimensions.

## 8. Content registry and ID rules

Keep stable IDs independent of display names and asset filenames. Proposed IDs should use lower-case kebab/snake conventions consistent with existing fixtures. Region IDs are not automatically Colyseus room IDs, process IDs, or client scene filenames.

For each region, eventually record: `id`, `displayName`, `regionId`, `zoneType`, recommended level range, faction access, safe/PvP policy, content revision, neighbours/transition anchors, spawn anchors, streaming bounds, terrain-sector references, landmark IDs, encounter spawn sets, quest IDs, gathering sets, dungeon entrance IDs, ambience profile, LOD profile and server authority policy. Extend schemas additively and validate existing fixture compatibility before changing runtime loaders.

## 9. First vertical slice definition

Build the **Sovereign Sect homeland → Wayfarer Crossroads → one Ashen Frontier route** first. It is complete only when the player can:

1. Log in, select/create a character and spawn at the authoritative homeland anchor.
2. Explore a visually authored capital edge and nearby wilderness with collision, readable landmarks and at least one quest chain.
3. Cross a region boundary without a room-style loading transition during normal traversal; terrain streams and unloads safely.
4. See other eligible players, enemies and world events according to server-side interest rules, with no cross-region information leaks.
5. Complete a quest and encounter, receive persistent server-authoritative progress/rewards, disconnect and return with state intact.
6. Reach the visible introductory dungeon entrance; only dungeon admission changes to an instance flow.
7. Run a repeatable performance test covering cold load, boundary crossing, crowded hub, combat and reconnect.

The current prototype's other two homeland pads remain useful for testing but are not considered completed faction zones until their geography, quests and art meet the same exit criteria.
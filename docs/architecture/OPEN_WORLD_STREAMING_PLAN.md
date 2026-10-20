# Open-World Streaming and World Runtime Plan

**Status:** Proposed implementation plan. This document extends `SYSTEM_ARCHITECTURE.md`; it does not claim that seamless streaming, production-scale sharding, or world persistence is already implemented. The Git repository remains the source of truth.

## 1. Accepted design direction

- **World experience:** continuous open world with streamed client terrain sectors; normal exploration does not expose Colyseus room transitions.
- **Visual target:** stylised realism with detailed, cinematic fantasy environments.
- **Platform:** PC first; keep input, rendering, asset budgets and UI adaptable for later platforms.
- **Client:** Godot 4.x, 2.5D/isometric camera and 3D characters/environment.
- **Server:** TypeScript API and authoritative Colyseus-based simulation, PostgreSQL persistence, shared versioned JSON content.
- **Instances:** retain isolated rooms for dungeons, raids, private story encounters and other content that benefits from separate encounter state. They are not the default container for ordinary overworld traversal.

## 2. Keep four concepts separate

1. **World region:** narrative/geographic identity, e.g. White Jade Bastion or the Glasswind Steppe.
2. **Terrain sector/chunk:** a client streaming unit, loaded by proximity and unloaded after a safe hysteresis window. It is an asset/scene unit, not an authentication or multiplayer room.
3. **Simulation/authority region:** server-owned space for movement bounds, collision, encounters, faction policy, NPC state, quest triggers and interest management. It may span many terrain sectors.
4. **Instance:** a separately addressed simulation for a dungeon, raid, solo story branch or capacity-isolated event.

Do not use a one-Colyseus-room-per-terrain-chunk architecture. That would create artificial seams, frequent reconnects and complex entity hand-offs. A client should be able to stream adjacent sectors while its authenticated world session remains stable. Server-side authority may migrate between region workers later, but that is a separate orchestration problem.

## 3. Target runtime architecture

### Godot client

- A persistent `WorldRoot` owns the player presentation, camera, HUD, network session, audio and world-streaming controller.
- A versioned world manifest maps region IDs to sector IDs, sector bounds, neighbouring sectors, resource paths, LOD groups, ambience, collision/nav data, landmarks and content revision.
- Terrain, foliage, static architecture and non-interactive dressing load as reusable scenes/resources. Prefer GLB/Blender source plus imported Godot resources; keep asset licensing/source metadata alongside each delivered asset.
- Load nearby sectors asynchronously; retain a safety ring around the player; unload only after the player and camera have left the sector plus hysteresis distance. Avoid frame stalls from synchronous full-scene instantiation.
- Use multimesh/instancing for repeated foliage and props, occlusion/visibility ranges, LOD, impostors where justified, baked lighting where appropriate, and budgeted particles/shaders. Profile real builds instead of optimising by intuition.
- Interactive objects use stable content IDs. The client can display interaction prompts, but the server decides whether an interaction is in range, available and valid.
- Terrain-sector loading never changes the character's authoritative `mapId` by itself and never grants a quest, loot, or gate transition.

### Server

- Keep account authentication, character selection, short-lived single-use join tickets and PostgreSQL ownership constraints as they are; evolve additively.
- Introduce a canonical world manifest/content registry shared conceptually across Godot and TypeScript. Server-owned data defines region bounds/neighbours, spawn anchors, collision/transition gates, PvP/safe policy, encounter sets, quest triggers and revision IDs. Visual terrain cannot redefine authority.
- Replace the current tiny rectangular `WORLD_ZONES` blockout with versioned region/zone data and a server-side spatial model. During migration, support old IDs as aliases or explicit migration mappings; never silently invalidate persisted character `active_map_id` values.
- Implement spatial interest management: clients receive players, enemies, NPCs and event changes only within the relevant spatial/map interest area, with enter/leave events and bounded snapshot payloads. Add cell-based indexing only after tests and profiles establish useful cell dimensions.
- Keep simulation state in memory at the authoritative tick rate and persist checkpoints/transactions rather than writing every entity every tick. Persist meaningful player positions, map/region, quest progress, encounter outcomes, inventory/economy transactions and content revision.
- Validate all movement, collisions, transitions, teleports, interactions, PvP rules, quest objectives, loot and rewards server-side. Client sector presence is never proof of permission.
- Keep a stable authenticated world session while crossing ordinary terrain sectors. Region-worker handoff, multi-process presence and authoritative simulation sharding are future scale milestones; do not claim them from a single Colyseus room.

### Instance services

A visible dungeon entrance invokes an authenticated interaction and server-side admission. The server checks ownership, quest prerequisites, party/solo mode, level/lockout rules, capacity and destination. It creates or allocates an instance and issues a short-lived, single-use ticket. Dungeon completion/rewards are persisted idempotently. Exiting returns the character to a validated world anchor. Keep the existing single-use ticket pattern and extend it rather than inventing a parallel trust model.

## 4. Proposed client scene/resource layout

This is a target structure; create directories/files incrementally as each slice is implemented.

```text
client/
  scenes/
    world/WorldRoot.tscn
    world/WorldHud.tscn
    world/sectors/<sector-id>.tscn
    world/landmarks/<landmark-id>.tscn
    instances/<instance-id>.tscn
  scripts/
    world/world_streamer.gd
    world/world_manifest.gd
    world/interaction_controller.gd
    world/sector_lifecycle.gd
  data/world/world-manifest.json
  assets/
    environment/source/
    environment/imported/
    characters/
    audio/
```

Do not mass-move or rename the existing `main.tscn`, `main.gd`, network panel, or character-selection UI as part of the first pass. First extract stable interfaces behind tests, then migrate to `WorldRoot` in a dedicated reviewed change. Preserve the current working login/character creation flow and the user's uncommitted local edits.

## 5. Content data and compatibility

- Keep `shared/schemas/zone-definition.schema.json` and current fixture contracts backward compatible while adding explicit fields such as `regionId`, `mapRevision`, `neighbourRegionIds`, `transitionAnchors`, `spawnAnchors`, `streamingProfileId`, `terrainSectorIds`, `landmarkIds`, `questIds`, `encounterSetIds` and `ambienceProfileId` as justified.
- Do not make Godot import TypeScript. Godot consumes JSON/manifest data; TypeScript validates the same stable IDs and authoritative policies.
- Add a content validator for duplicate IDs, missing region neighbours, asymmetric transitions where unintended, missing assets, invalid level bands, missing quest/encounter references, conflicting safe/PvP rules, invalid spawn anchors and manifest revision mismatches.
- Version content independently from client art builds. On incompatible content, fail clearly or use an explicit migration; never silently relocate characters to an arbitrary origin.
- Keep source assets and generated/imported assets distinguishable. Commit original project source and necessary runtime assets; do not commit tool caches or unlicensed reference images.

## 6. Implementation sequence and gates

### Stage 0 — Baseline and design freeze

Deliver: World Atlas, region graph, faction route maps, level bands, content ID registry, visual target and performance test plan.

Gate: every proposed region has purpose, neighbours, level band, faction access, travel time target, settlement/landmark list, encounter themes, quest hooks and server policy. Existing IDs/story canon are reconciled. No generated terrain is accepted as canon until reviewed against this atlas.

### Stage 1 — Traversal and streaming proof

Deliver: one test landscape with two or three adjacent sectors, one persistent player/camera/HUD, async sector loading/unloading, spawn anchors, collision continuity and visible route landmarks. Initially use simple original blockout art.

Gate: cross a sector boundary in both directions without a visible room transition, duplicate player, lost input, coordinate jump, collision hole or session re-authentication. Measure cold-load time, frame-time spikes, memory and sector churn on the target PC profile.

### Stage 2 — Server region/transition contract

Deliver: authoritative world-region manifest, validated gate/continuous boundary transition model, position persistence with region revision, spawn validation, interest enter/leave events and two-client tests.

Gate: forged map/position requests fail; legal boundary crossing preserves identity and world session; two clients remain correctly visible across sector boundaries; reconnect restores the right region; incompatible persisted region IDs are handled by explicit migration/fallback policy.

### Stage 3 — First authored homeland slice

Deliver: a small but polished White Jade Bastion district, adjacent wilderness, one hamlet/outpost, three or more landmarks, one enemy camp, gathering route, NPC interaction and an end-to-end opening quest chain. Integrate Flockbay/Summer output only after inspection and conversion to stable Godot resources.

Gate: visual review, navigation/collision walk, quest completion/relogin persistence, no placeholder credentials/secrets, stable frame-time and memory budget, original/licensed asset manifest, repeatable smoke test.

### Stage 4 — Homeland dungeon and shared route

Deliver: Underterrace Archive entrance and playable instance; route from the homeland to Wayfarer Crossroads and the first Ashen Frontier section; server-validated transitions and dungeon ticket flow.

Gate: normal traversal remains continuous; only instance admission changes simulation context; disconnect/reconnect, party/solo restrictions and rewards are tested; exit returns to the correct validated anchor.

### Stage 5 — Faction parity

Deliver: authored Cinderwake and Luminous Veil starts using the same tested region, quest and streaming contracts but with distinct layouts, encounters, NPCs and narrative beats.

Gate: all three openings meet the same quality checklist; faction access cannot be forged; all essential progression remains available through each faction's story route.

### Stage 6 — Shared continent expansion

Deliver: region-by-region additions in dependency order: Verdant Meridian, Sunken Provinces, Glasswind Steppe, Ironveil Range, Hollow March, then endgame regions. Each region ships with its own content manifest and performance gate.

Gate: a new region is not marked complete until it has art, collision, landmarks, travel links, quests/events, encounter placement, level band, server rules, persistence, telemetry and regression tests.

### Stage 7 — Scale and live-world operations

Deliver: load profiles, simulation/region worker topology, population caps and queues, failover/reconnect, world event scheduling, operational metrics and shard/region migration strategy.

Gate: defined concurrent-player target is load-tested on representative hardware/infrastructure; tick overruns, snapshot size, database saturation and reconnect failure stay within explicit budgets. Multi-process handoff must be tested before any claim of a seamless sharded production world.

## 7. Performance and QA budgets

Set measured budgets on the minimum supported PC rather than hard-coding an untested promise. Track:

- Frame time: p50/p95/p99, frame spikes while sectors load, and GPU/CPU bottlenecks.
- Memory: resident assets, texture pool, sector peak overlap during transition, and worst-case urban hub.
- Streaming: time to load visible terrain, pop-in distance, failed resource loads, repeated load/unload churn and collision readiness before entry.
- Network: authoritative tick duration/overruns, snapshot bytes/rate, entity count per client, RTT, reconnect success and cross-region handoff duration.
- Persistence: position/region checkpoints, quest/reward idempotency, stale content revisions and migration recovery.
- World quality: route readability, landmarks per travel interval, dead-end paths, collision/nav mismatches, enemy spawn safety and NPC accessibility.

Create automated tests for manifest schema, region graph consistency, server transition policy, invalid movement across boundaries, map/faction access, snapshot interest filtering, reconnect across boundaries, quest/reward replay, dungeon admission and world exit anchors. Add a manual PC playtest checklist for art, navigation, streaming and frame-time.

## 8. Flockbay and Summer Engine workflow

1. Generate one bounded deliverable at a time: a landscape sector, settlement block, landmark kit, NPC/prop set or a defined UI screen. Do not ask either tool to create the entire MMORPG at once.
2. Provide the relevant World Atlas excerpt, stable IDs, scale references, faction visual language, target Godot version, polygon/texture budgets, collision requirements, export format and a strict list of files the tool may change.
3. Require original/licensed output and a manifest of source files, textures, materials, licences and any generated dependencies. Prefer exportable assets/scenes over opaque hosted runtime dependencies.
4. Export to a staging folder outside live project scenes; inspect files, scale, pivots, materials, texture sizes, collisions, licences and naming. Run Godot import/editor checks before moving approved output into `client/assets` or `client/scenes/world`.
5. Use version control diffs and small commits. Never let an agent rewrite the main scene, world manifest, shared IDs, authentication flow or server contracts without an explicit review. Do not overwrite uncommitted user changes.
6. Treat visual generation and gameplay implementation as separate passes: art tools create geometry/materials/scene dressing; code defines authoritative interactions, quest states, encounter logic, persistence and multiplayer behaviour.

## 9. Current implementation gaps (explicit)

The current implementation is a working prototype foundation, not the target open world:

- `client/scripts/main.gd` creates a primitive runtime blockout and fixed camera; it is not a finished terrain/streaming framework.
- `server/src/zones.ts` defines five small rectangular blockout zones, and `server/src/world-room.ts` runs the current authoritative simulation in one Colyseus world room. This is not continent-scale spatial simulation or a production sharding system.
- The current transition contract uses discrete zone IDs/gate checks; continuous sector streaming and broad region-boundary movement do not exist yet.
- The client now has a 2D 7-by-7 sector-streaming proof integrated into the existing persistent main-scene player/root. It still uses placeholder terrain and a prototype manifest; authored continent terrain, production navmesh pipeline, complete NPC dialogue/quest runtime, spatial interest management and tested region-worker handoff remain future work.
- Existing authentication, character ownership, single-use join tickets, server-authoritative movement/combat/PvE and PostgreSQL persistence are valuable foundations to retain and extend.

The client-side Stage 1 streaming proof is implemented and smoke-tested. The next engineering task is **Stage 2: define and test the server region/transition contract**, including boundary validation and two-client continuity, before any worker handoff or continent-scale rollout. Do not begin with a wholesale backend rewrite or generate the entire continent before the server contract is proven.

## 10. Definition of done for a world region

A region can be called implemented only when all applicable items pass:

- [ ] Canonical ID and versioned content manifest validate.
- [ ] Neighbour links and boundary transitions are tested in both directions.
- [ ] Art/asset provenance and import checks are recorded.
- [ ] Terrain, collision and navigation agree; no unloaded/collision holes on routes.
- [ ] Spawn anchors, faction access and safe/PvP rules are server-authoritative.
- [ ] Landmark, quest, gathering, NPC and encounter content is implemented and testable.
- [ ] Character state, quest progress and rewards survive reconnect/restart as designed.
- [ ] Streaming/frame-time/memory/network tests pass on target PC profile.
- [ ] Manual art/navigation review is signed off; placeholders are explicitly labelled.

## Stage 1 prototype implementation (client-only)

A standalone proof is available at client/scenes/world/streaming_prototype.tscn, and the streamer is also integrated into the existing main-scene root via client/scripts/main.gd. It references the existing player rather than replacing it; authentication, character selection, Colyseus client and existing local changes are retained.

- client/data/world/streaming-proof-manifest.json declares a 7-by-7 grid of 32-unit sectors, a start anchor, streaming radius and unload radius.
- scripts/world/world_streamer.gd loads the reusable sector scene resource asynchronously, instantiates the nearby 3-by-3 sector ring, and releases sectors after they leave the unload radius.
- scripts/world/streaming_sector.gd creates original placeholder terrain, collision, route ribbons and visible sector markers. Adjacent floor collision boxes meet at the sector boundaries.
- scripts/world/streaming_prototype.gd owns the player, orthographic camera and HUD outside streamed sectors. The standalone test scene does not connect to the server. In the main client, the same streamer lives under the existing root and follows its existing player while the Colyseus connection remains managed by the existing network panel. Server-authoritative region handoff is not implemented yet.
- client/tests/world_streaming_smoke.gd checks the initial 3-by-3 sector grid, east/west/north/south traversal, unload/reload behaviour, sector seams/collision, and persistent root objects. The main prototype smoke test also checks integration with the existing player.

Run the smoke test with the project's Godot 4.7.2 console executable: godot --headless --path client --script res://tests/world_streaming_smoke.gd

This is a streaming-mechanics proof using simple generated blockout geometry, not authored final terrain. Before promoting it into the main client, validate collision seams interactively, profile cold-load/frame-time/memory on target PC hardware, and integrate the real network session behind the persistent root. Stage 2 remains required for server-side region/transition semantics and two-client continuity.

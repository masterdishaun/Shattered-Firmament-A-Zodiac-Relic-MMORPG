# Gameplay Baseline

## 1. Perspective and controls

The game uses a **2.5D isometric presentation**: 3D characters and environments rendered through a fixed or semi-fixed isometric camera. Art direction prioritises readable silhouettes, ground targeting, clear telegraphs, distinguishable effects and web/mobile performance. Camera projection, pitch/yaw, movement, character rotation, click-to-move versus direct input, controller support and zoom boundaries are to be validated in the first vertical slice.

## 2. Character progression

- Launch cap 100; balanced pacing.
- Provisional target 70–100 hours of varied active play to reach level 100; validate across player cohorts.
- Character progression includes XP/level, cultivation, equipment, skills, collections and companion bonds.
- Cultivation realms: Awakened Soul (1–20), Jade Meridian (21–40), Astral Core (41–60), Celestial Vessel (61–80), Firmament Ascendant (81–100).
- Breakthroughs at 20/40/60/80/100 are provisional milestones. Completed trials guarantee success; no destructive failure RNG.
- Post-cap mastery expands choices and collections but does not add unlimited combat power.

## 3. Combat and gear

- Vertical equipment tiers: Worn Relics, Jadeforged, Zodiac Bound, Astral Ascendant, Firmament Relics.
- Starting hypothesis: roughly 8–12% effective-power growth per tier for comparable builds. Validate per class/stat, not as a blind multiplier.
- Preserve selected older items through effects, set synergies, upgrades or niche builds.
- Server authoritatively validates range, line of sight, cooldowns, resources, targets, damage, control duration and rewards.
- Class roster, roles, skill count, targeting and combat formula remain to be designed.

## 4. World structure

- Faction capitals: protected.
- Neutral settlements, markets and crafting/social hubs: protected.
- Open wilderness: PvE unless explicitly designated otherwise.
- Always-on faction PvP zones: combat enabled with clear boundaries/warnings.
- Contested PvPvE territories: faction objectives, relic sites and selected boss encounters.
- Dungeons: instanced PvE by default, with explicitly declared PvPvE exceptions.
- World-boss arenas declare protected or contested rules individually.

No attacks cross safe-zone boundaries or hit characters during protected transitions. Losing territory cannot permanently block essential story, gear or progression.

## 5. Dungeons and world bosses

- Solo-friendly story dungeons.
- Normal/Hard/Challenge group tiers, authored mechanics and controlled party-size scaling; optional level sync.
- Starting sizing hypothesis: party dungeons 4–6; early raid tests 8–12.
- Minor bosses daily; major Zodiac bosses weekly; published windows rotate for timezone fairness.
- Personal contribution rewards plus faction-objective bonuses. No last-hit-only design or dominant-guild monopoly.
- Essential rewards always have alternative routes.

## 6. Economy

- Silver for routine gameplay transactions.
- Tradeable goods/materials and selected gear support player-driven value.
- Separate premium currency only for permitted cosmetics.
- Account-based profession unlocks/recipes; optional character specialisations.
- Global auction house plus direct trade.
- Personal loot with baseline rewards and selected bad-luck protection.
- Provisional marketplace fee 3–5%, subject to simulations.
- Transactions/reward claims are authoritative, atomic where required, idempotent and auditable.

## 7. Player-trust policies

No paid-exclusive competitive power; no punitive daily streaks; no destructive gear-upgrade failure; no equipped-gear/item loss on PvP death; generous catch-up without skipping all encounter learning; cosmetic-first monetisation.

## 8. Provisional values

Time-to-cap, gear power deltas, market fee, group sizes, drop rates, upgrade costs, boss windows and population limits are hypotheses until validated through simulation and closed playtests.
## First playable client blockout

The current Godot main scene is a local 3D/isometric-style prototype built entirely from primitive meshes and generated materials. It contains three visually distinct faction start areas, a controllable capsule character, a follow camera, collision-backed ground/platforms and nearby Zodiac relic interaction areas.

Controls:

- `W/A/S/D`: move relative to the isometric camera.
- `E`: inspect a nearby Zodiac relic and reveal a faction-specific narrative snippet.
- `1`, `2`, `3`: preview White Jade Bastion, Cinderwake or Luminous Veil starts. These are local prototype controls, not a persistent faction-change feature.

The scene is a blockout, not representative final art or a full game client. It has no network client, animation system, combat, quest persistence, inventory UI, pathfinding or production zone boundary enforcement. The server's 20 Hz tick counter and the client movement prototype are not yet connected.

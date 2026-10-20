# Open-World and Dungeon PvP Design Contract

Status: approved direction for production design; implementation remains staged and must not be represented as playable until its release gates pass.

## World-scale commitment

Shattered Firmament is a persistent, large-scale open-world MMORPG, not a sequence of disconnected instanced maps. The overworld is the primary shared world: large connected regions, traversable routes, settlements, faction territories, wilderness, gathering locations, roaming creatures, world events and bosses. Region streaming, spatial interest management and region-level server authority are implementation techniques to sustain scale; they must not turn ordinary exploration into frequent loading-screen instances. Short transitions are acceptable for technical seams, not as the default world design.

The game should grow by shipping coherent playable regions, not by creating a huge empty map. Each region needs traversal landmarks, meaningful encounter density, resource loops, quest hubs, social destinations, ambient life and at least one reason to revisit it at later progression stages.

## PvP rules: safe by default, opt-in risk

- A new character enters PvE-safe rules by default. PvE-only players can quest, gather and complete the normal story dungeon route without player attacks.
- War Mode is a deliberate opt-in before entering eligible content. The chosen state is visible in the UI and confirmed server-side; clients cannot switch into PvP during combat, while targeted, or to evade consequences.
- War Mode must be persisted for the dungeon run and enforced by the authoritative server for every player-targeting action. A client flag alone never enables or disables PvP.
- Proposed incentive: +20% to eligible XP and Silver from the qualifying run, with any exclusive cosmetic drops explicitly disclosed before entry. No bonus to ordinary safe PvE players. Final eligible rewards, exclusions, and stacking rules require economy simulation and playtesting before release.
- No War Mode bonus for quest turn-ins, low-level farming, repeated trivial kills, or rewards generated outside the opted-in activity. Apply anti-farming rules and cap the bonus to the defined activity.
- PvE and PvP coefficients are separate tuning parameters. Do not nerf PvE rotations solely to fix PvP outliers; evaluate PvP-specific scaling and crowd-control rules independently.
- Protect the dungeon entrance, party formation and initial safe floors from ambush. Provide clear warnings, an explicit opt-in and a clear point of no return before any shared contested area.

## Dungeon modes

### 1. Safe Story / Standard PvE

A dungeon run is an isolated, server-authoritative PvE instance with its own encounter state and reward ledger. It is the default for story, learning mechanics and baseline gear progression. War Mode is not silently enabled. Standard runs never share monsters, loot, encounter state or hostile player interactions with another run.

### 2. War Expedition / Deep-Zone Descent

The upper floors are safe and instanced. Before descent, the party receives a clear warning and chooses whether to continue. Beyond the marked point of no return, the expedition connects to a shared, persistent contested dungeon region. This region is a deliberate exception to instance isolation, not an accidental leak between ordinary runs. The shared lower region uses server-owned territory, encounter, loot-claim and player-combat state. War Mode is required for player-versus-player combat there; non-opted-in players must not be involuntarily exposed to PvP. Spawn exits and reconnects must never place a player inside an active ambush.

### 3. Faction Race (indirect PvP)

Each rival team receives its own identical PvE instance and independent boss/loot state. Competitive results are based on validated objective completion and clear time. Explicitly designed sabotage actions can send a bounded trap, hazard or elite reinforcement to the rival run; they must not arbitrarily delete progress or make the other instance unwinnable. Sabotage has visible telegraphs, counters, limits and auditable server events. Direct player damage between the isolated teams is impossible in this mode.

### 4. Tamed dungeon defences

Some deep-zone rooms contain control points or stations that allow a team to redirect or activate eligible dungeon AI against rival groups. Captures are server-validated, have ownership/contest rules, costs and cooldowns, and can be countered or reversed. AI cannot be commanded outside its allowed navigation/encounter boundaries. A team cannot permanently lock rivals out of required content or claim rewards without defeating the required encounters itself.

## Combat and reward integrity

- All movement, zone transitions, PvP eligibility, encounter health, boss defeat, objective completion, loot ownership and reward settlement are server-authoritative.
- PvP damage is rejected in safe zones and against non-opted-in targets. Both attacker and target must satisfy the mode and zone rules; faction relationship alone is not permission to attack.
- Dungeon run identity binds the character/party, dungeon content version, ruleset (safe or War Mode), and event history. A retry/reconnect resumes the same eligible run instead of generating a second reward opportunity.
- Boss defeat and reward claims are idempotent. Race times and sabotage outcomes use server timestamps and validated events, never client-reported completion times.
- High-risk loot must be explained before entry, including what is lost on defeat, what is protected, and what is recoverable. Avoid punishing players for disconnects or server failures.
- PvP and War Mode rewards are evaluated for farming, win-trading, alt abuse, party-size abuse, faction imbalance and exploitation before public launch.

## Production sequence

1. Complete and verify server-owned quest progression and dungeon encounter/reward persistence.
2. Establish the first full open-world vertical slice: one handcrafted region, traversal routes, NPC/quest hub, a small creature roster, gatherables, one world event and one safe dungeon.
3. Build the reusable art/content pipeline for terrain, modular architecture, character rigs, animation, weapons, armor/costumes, mounts, VFX, sound, items and localization.
4. Add safe-zone PvP enforcement and persisted War Mode state, then test with multiple clients.
5. Prototype the deep-zone shared boundary and faction-race mode separately; do not ship either before griefing, recovery and economy tests pass.
6. Scale world content using region streaming and spatial interest management; profile player density, server tick cost, network bandwidth and asset memory before increasing map size.

## Release acceptance criteria

- PvE-safe defaults are enforced server-side in every relevant combat route.
- War Mode opt-in is explicit, persisted, visible and cannot be toggled to escape combat.
- War bonuses apply only to eligible opted-in activity and cannot be multiplied through replay or farming.
- A normal dungeon is isolated; the deep shared region opens only at the declared boundary and applies its published rules.
- Race-mode sabotage cannot cross instances except through explicit bounded server events; direct PvP between race teams is impossible.
- Tamed AI commands respect allowed targets, range, cooldowns, counters and required-encounter integrity.
- Reconnect, duplicate messages, defeat, server restart and reward-service retry do not duplicate rewards or trap players in an unrecoverable state.
- Performance is measured at target concurrent-player and creature density before claiming open-world scale readiness.

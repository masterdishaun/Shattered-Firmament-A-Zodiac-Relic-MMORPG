# Shattered Firmament — Progression & Economy Specification

**Version:** 1.0 draft · Proposed baseline · Numerical values provisional

## 1. Design goals

- Balanced level 1–100 journey.
- Five cultivation realms with guaranteed breakthrough success after a completed trial.
- Vertical equipment progression with controlled power growth and selected older-item relevance.
- Player-driven economy with account-based professions and a global marketplace.
- Personal loot with baseline rewards, rare drops and selected bad-luck protection.
- Solo story dungeons, scalable party content and challenging group endgame.
- Daily minor world bosses and weekly major Zodiac encounters with rotating time windows.
- Designated always-on faction PvP, contested objectives and protected peace zones.
- Generous returning-player catch-up without mandatory daily chores.
- No paid-exclusive competitive power and no equipped-gear loss on PvP death.

## 2. Level progression

### Level bands

| Band   | Realm               | Narrative and gameplay focus                                          |
| ------ | ------------------- | --------------------------------------------------------------------- |
| 1–20   | Awakened Soul       | Faction start, basic combat, first relic, starter dungeon             |
| 21–40  | Jade Meridian       | Advanced abilities, professions, marketplace, party content           |
| 41–60  | Astral Core         | Build identity, Zodiac hunts, elite dungeons                          |
| 61–80  | Celestial Vessel    | Advanced group content, contested relics, specialised crafting        |
| 81–100 | Firmament Ascendant | Launch-era story climax, endgame dungeons and major Zodiac encounters |

### Provisional pacing target

Target 70–100 hours of varied active play for a first character to reach level 100. Validate across casual, regular and highly active play styles. This is not a guaranteed time-to-cap.

### EXP sources

- Main and side quests: reliable progression route.
- Dungeons: meaningful completion rewards.
- Open-world combat: viable, but repeated low-level farming is less efficient.
- Exploration and discoveries: meaningful supplemental EXP.
- Optional faction objectives: viable alternative, not mandatory for levelling.
- Crafting and gathering: contribution to progression, with safeguards against AFK exploits.

Avoid long dead zones in the curve. Use telemetry to identify levels where players stall, abandon quests or repeat the same activity excessively.

## 3. Cultivation

| Realm               | Level band | Purpose                   |
| ------------------- | ---------- | ------------------------- |
| Awakened Soul       | 1–20       | Basic spiritual control   |
| Jade Meridian       | 21–40      | Advanced ability unlocks  |
| Astral Core         | 41–60      | Build and Zodiac affinity |
| Celestial Vessel    | 61–80      | Advanced techniques       |
| Firmament Ascendant | 81–100     | Endgame mastery           |

Breakthrough milestone levels: 20, 40, 60, 80 and 100, subject to playtesting.

Each breakthrough requires:

1. Story or mastery milestone.
2. Materials obtainable from multiple activity types.
3. A cultivation trial appropriate to the realm.
4. Guaranteed success when the trial is completed.

No destructive RNG failure, gear destruction or mandatory timed attendance. Post-cap mastery offers bounded build options, collections, achievements and cosmetic recognition, not unlimited combat-stat growth.

## 4. Equipment

### Launch tiers

| Tier | Approx. level | Name             | Primary sources                                      |
| ---- | ------------: | ---------------- | ---------------------------------------------------- |
| I    |          1–20 | Worn Relics      | Quests, common drops, basic crafting                 |
| II   |         21–40 | Jadeforged       | Professions, dungeons, elite enemies                 |
| III  |         41–60 | Zodiac Bound     | Zodiac hunts, advanced crafting, dungeon bosses      |
| IV   |         61–80 | Astral Ascendant | Challenging dungeons, contested relics, major bosses |
| V    |        81–100 | Firmament Relics | High-tier instances, Zodiac raids, master crafting   |

Target approximately 8–12% effective-power growth per tier for comparable builds as a starting hypothesis. Validate through combat simulations and PvP tests; do not apply a single multiplier blindly to every stat or class.

### Equipment principles

- New tiers feel stronger without making all older items obsolete.
- Preserve selected older pieces through unique effects, set synergies, upgrade paths or niche builds.
- Crafting remains a viable route to competitive gear.
- Publish upgrade costs, odds and outcomes.
- No destructive failure; an unsuccessful attempt must not destroy the item or erase substantial progress.
- No paid-exclusive stats, combat skills, competitive pets or exclusive combat progression.
- Balance gear growth against PvP fairness.

## 5. Economy and currencies

### Silver

Primary routine currency. Sources include quests, monster rewards and selected vendor transactions. Sinks include service fees, repairs outside PvP, crafting fees, travel and other useful services.

### Tradeable goods

Materials, crafted goods and selected equipment create the player-driven economy. Prices arise from supply, demand, scarcity and crafting usefulness.

Premium currency is separate and used for approved cosmetic purchases. It must not provide exclusive competitive power.

### Economy controls

- Global auction house plus direct player-to-player trading.
- Transparent price history and clear fees.
- Provisional 3–5% marketplace transaction fee for simulation; not final.
- Account-wide profession unlocks and recipes; optional character specialisations add identity without repeating the entire grind.
- Currency creation and destruction tracked separately.
- Trade and reward transactions atomic, idempotent and auditable.
- Anti-duplication, bot detection and suspicious transfer monitoring.
- Multiple uses for gathered materials.
- No reactive hidden taxes or artificial scarcity that cannot be explained to players.

### Initial profession families

1. Weaponsmith — weapons.
2. Armoursmith — armour and defensive equipment.
3. Jade Artisan — relics, sockets and selected enhancement components.
4. Alchemist — consumables and combat preparations.
5. Gatherer — ores, herbs, wood and celestial resources.

Validate whether Gatherer should be a dedicated profession or a common account skill before locking the final profession model.

## 6. Loot

Eligible players receive personal rewards. The system should provide:

- Reliable baseline completion rewards.
- Individual rare-drop chances.
- Bad-luck protection for selected important progression items.
- Tradeable selected materials and bonus items.
- Eligibility based on meaningful participation, not only top damage or final hit.
- Server-authoritative reward generation and idempotent claims.
- Auditable drop tables and telemetry.

Test for both excessive drought and excessive item supply. Rare items should remain exciting but not require unreasonable repetition.

## 7. Dungeons

| Tier      | Intended experience                          | Reward profile                                                      |
| --------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Story     | Solo-friendly narrative and learning         | Reliable progression rewards                                        |
| Normal    | Accessible group play                        | Useful gear, materials and currency                                 |
| Hard      | Coordinated mechanics and build optimisation | Higher-tier crafting materials and improved rare-drop opportunities |
| Challenge | Demanding encounter mastery                  | Prestige, achievements, cosmetics and selected endgame rewards      |

Use authored difficulty tiers and controlled scaling. Scale for party size where appropriate; offer optional level sync. Do not globally scale every open-world enemy to each player. Preserve clear reward tiers and encounter mechanics rather than simply increasing enemy health.

Initial party size hypothesis: 4–6 players. Validate against combat readability, role design, queue times and server capacity.

## 8. World bosses

- Minor world bosses: daily.
- Major Zodiac encounters: weekly.
- Rare celestial events: rotating windows and occasional dynamic events.
- Publish schedules in advance; rotate spawn windows to reduce timezone unfairness.
- Reward meaningful personal contribution and faction objectives.
- Prevent dominant guilds from indefinitely monopolising access.
- Essential progression materials must have alternative routes.
- No gear loss on death.

Initial major raid group size: test 8–12 players. Performance targets must be validated under simulated peak population and real client/network conditions.

## 9. PvP and zones

- Always-on PvP in designated faction combat zones.
- Contested world objectives and PvPvE content.
- Protected capitals, markets, crafting halls and social spaces.
- No attacks across zone boundaries or through transitions.
- PvP deaths incur only respawn time and temporary battlefield/objective setbacks; no equipped-item loss, item loss or punitive PvP repair fees.
- No paid-exclusive competitive power.
- Losing a territory never permanently blocks essential quests, items or progression.

## 10. Catch-up and retention

- Accelerated EXP for older levels.
- Relevant older materials and content remain accessible.
- Clear route toward current endgame, without skipping all challenge learning.
- Weekly opportunities can accumulate; avoid essential daily streaks.
- Missed world bosses cannot permanently block essential progression.
- Track retention and friction by play style, not only aggregate averages.

## 11. Analytics and acceptance criteria

Track at minimum:

- Time-to-level by cohort and play style.
- Quest start, progress, abandon and completion.
- Cultivation attempt/completion and material sourcing.
- Item creation/destruction and currency flows.
- Market price movement and profession profitability.
- Loot distribution and bad-luck protection activations.
- Dungeon queue time, completion, failure and party composition.
- World-boss attendance, contribution and reward concentration.
- PvP outcomes by build, gear tier, experience and matchmaking context.
- Catch-up adoption and returning-player completion.

Provisional acceptance gates:

- No destructive cultivation or equipment-upgrade failure.
- No paid-exclusive competitive power.
- No essential quest or progression reward permanently locked behind faction control or a missed scheduled event.
- No PvP equipped-gear loss.
- Reward grants and trades are idempotent and auditable.
- Critical economic actions are atomic and server-authoritative.
- Performance tests pass at a declared load target before public launch.

## 12. Open questions for playtesting

- EXP curve and time-to-level by cohort.
- Whether 8–12% tier power growth produces acceptable combat and PvP outcomes.
- Exact profession count and cross-character specialisation model.
- Item binding rules and tradeable bonus categories.
- Bad-luck protection thresholds.
- Dungeon scaling boundaries and party sizes.
- World-boss concurrency and spawn windows.
- Marketplace fee, Silver sinks and inflation response.
- Catch-up rates and how they affect veteran progression.

No values should be considered production-final until simulation and closed playtests support them.

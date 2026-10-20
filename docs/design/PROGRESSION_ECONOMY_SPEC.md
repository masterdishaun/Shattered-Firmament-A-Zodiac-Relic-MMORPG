# Progression and Economy Specification

**Status:** Proposed v1.0; all numeric values provisional.

## Progression

- Launch cap 100; balanced pace.
- Provisional target: 70–100 active hours of varied play to cap, validated across casual/regular/high-activity cohorts.
- Level bands: 1–20 Awakening; 21–40 Ascension; 41–60 Starfall; 61–80 Celestial Conflict; 81–100 Firmament's Edge.
- EXP via story/side quests, monsters, dungeons, exploration, crafting/gathering and optional faction objectives. No single repeated camp should be the only viable route.
- Five cultivation realms: Awakened Soul (1–20), Jade Meridian (21–40), Astral Core (41–60), Celestial Vessel (61–80), Firmament Ascendant (81–100).
- Breakthroughs at 20/40/60/80/100 are provisional. Completed trials guarantee success; no destructive failure RNG. Materials have multiple acquisition routes.
- Post-cap mastery yields bounded build choices, collections, achievements and cosmetics—not unlimited stats.

## Equipment

| Tier             | Approx. level | Sources                                            |
| ---------------- | ------------: | -------------------------------------------------- |
| Worn Relics      |          1–20 | Quests, common drops, basic crafting               |
| Jadeforged       |         21–40 | Professions, dungeons, elite enemies               |
| Zodiac Bound     |         41–60 | Zodiac hunts, advanced crafting, bosses            |
| Astral Ascendant |         61–80 | Challenging dungeons, contested relics             |
| Firmament Relics |        81–100 | High-tier instances, Zodiac raids, master crafting |

Start testing with approximately 8–12% effective-power growth per tier for comparable builds, but validate per class/stat rather than applying a blind multiplier. Preserve selected older items through effects, set synergies, upgrades or niche builds. No destructive upgrades or gear-reset treadmill.

## Economy

- Silver: routine gameplay currency.
- Tradeable goods: materials, crafted goods and selected gear create player-driven value.
- Premium currency is separate and restricted to permitted cosmetics.
- Account-based profession unlocks/recipes; optional character specialisations.
- Global marketplace plus direct trade.
- Personal loot with baseline rewards and selected bad-luck protection.
- Starting profession families: Weaponsmith, Armoursmith, Jade Artisan, Alchemist and Gatherer; validate whether gathering is a profession or common skill.
- Test a predictable 3–5% market transaction fee; final rate depends on economic simulation.
- Track currency creation/destruction, prices, market concentration, profession profitability, item supply, bots and suspicious transfers.
- Transfers, purchases and rewards must be authoritative, atomic where necessary, idempotent and auditable.

## Personal loot

- Guaranteed baseline reward for meaningful participation.
- Individual rare-drop chances; bad-luck protection for selected progression drops.
- Selected materials and bonus drops are tradeable.
- Eligibility cannot depend only on final hit/highest damage.
- Test for drought and item oversupply.

## Dungeons

| Difficulty | Role                    | Reward direction                                               |
| ---------- | ----------------------- | -------------------------------------------------------------- |
| Story      | Solo-friendly narrative | Reliable progression rewards                                   |
| Normal     | Accessible group play   | Useful gear, materials, Silver                                 |
| Hard       | Coordinated mechanics   | Higher-tier materials, improved rare-drop opportunities        |
| Challenge  | Encounter mastery       | Prestige, achievements, cosmetics and selected endgame rewards |

Use authored tiers and controlled scaling. Scale party size when appropriate; allow optional level sync. Do not globally scale every open-world enemy to each player. Party size 4–6 is a starting hypothesis.

## World bosses

- Minor bosses daily; major Zodiac encounters weekly; rare celestial events periodically.
- Publish schedules and rotate spawn windows for timezone fairness.
- Combine personal contribution rewards and faction objectives.
- Anti-monopoly safeguards; no permanent progression lockout for missed spawns.
- Test 8–12 participants for early major-raid encounters.

## PvP and retention

- Always-on designated faction PvP zones; contested PvPvE objectives; capitals/markets/crafting/social spaces protected.
- No attacks across safe-zone boundaries or protected transitions.
- PvP death: respawn time and temporary battlefield/objective setbacks; no equipped gear/item loss or punitive PvP repair fees.
- No paid-exclusive competitive power.
- Generous older-level EXP/material catch-up; no daily streak penalties.
- Losing territory cannot block essential quests or gear.

## Analytics and tuning

Track time-to-level by cohort, quest abandonment, breakthrough completion, currency in/out, market prices, profession profit, item creation/destruction, loot distribution, dungeon queues/completion, boss reward concentration, PvP outcomes by gear/build/experience, catch-up usage and returning-player progress.

All rates, timings and percentage targets remain hypotheses until simulation and closed playtests.
## Test profile: experience curve (provisional)

The first balance profile uses a deterministic, level-based curve so simulations and tests can reproduce every level threshold. It is a starting hypothesis, not a final pacing promise; it must be validated against the 70–100 active-hour target using a mixed-activity simulation and closed playtests.

- Level cap: 100. XP is character-bound progression and is never tradeable, transferable, or purchasable for premium currency.
- XP required to advance from level `L` to `L + 1`, for `1 ≤ L < 100`: `XP_next(L) = 4,000 + 60 × L`.
- Total XP required to reach level `N`: `XP_total(N) = Σ XP_next(L)` for `L = 1` through `N - 1`. Level 1 starts at zero XP; XP beyond level 100 is not accumulated as combat power.
- This curve requires 693,000 total XP to reach level 100. The average implied pace is 6,930–9,900 XP per active hour over the 100-to-70-hour target window. This arithmetic is a calibration target, not proof that the content currently delivers that rate.

| Level band | XP required within band | Share of level-1-to-100 XP | Initial pacing hypothesis at 70–100 total hours |
| --- | ---: | ---: | ---: |
| 1–20 | 87,400 | 12.6% | 8.8–12.6 hours |
| 21–40 | 115,400 | 16.6% | 11.6–16.6 hours |
| 41–60 | 139,400 | 20.1% | 14.1–20.1 hours |
| 61–80 | 163,400 | 23.6% | 16.5–23.6 hours |
| 81–100 | 187,400 | 27.0% | 18.9–27.0 hours |
| **Total** | **693,000** | **100%** | **70–100 hours** |

XP comes from several viable activities. For an initial mixed-play simulation, target a portfolio rather than a single optimal farm: story/side quests 35–45% of earned XP; ordinary/elite PvE 20–30%; dungeons and bosses 15–25%; exploration, gathering/crafting and faction objectives 10–20%. The ranges overlap intentionally; simulated portfolios must be normalised to 100% and checked for viable alternatives. These are target shares, not implemented rewards.

### XP reward and anti-farm rules

| Activity | Initial XP test range | Eligibility rule |
| --- | ---: | --- |
| Level-appropriate standard enemy | 60–120 per eligible character | Server-recorded participation; no reward for a player who did not meaningfully participate. |
| Elite enemy | 250–500 per eligible character | Personal reward, independent of last hit. |
| Quest objective/turn-in | 1,000–5,000 | Completion and claim are server-authoritative and idempotent. |
| Dungeon encounter/boss | 1,500–4,000 per eligible character | Contribution/encounter eligibility; do not award solely by last hit or highest damage. |
| Exploration/faction objective | 250–1,500 | One-time or explicitly repeatable, with a stable reward key. |

These ranges are calibration fixtures only. The simulator must check the target XP/hour across all five level bands, representative solo/group compositions and mixed activity. Trivial enemies receive diminishing XP when the character outlevels them; repeated farming must not dominate questing or group content. Do not apply a hidden penalty to normal same-level play. Group eligibility must reward meaningful participation without making support/healing roles or lower-damage builds systematically unviable.

## Equipment stat budgets and power guardrails (provisional)

Use a normalized same-level, same-role reference build to compare tiers; do not infer balance from item level alone. The first stat-budget profile allocates each item's normalized budget as follows:

| Budget category | Initial share | Included stats (examples) |
| --- | ---: | --- |
| Primary role output | 45% | Damage for damage roles; healing/output for support-oriented effects where applicable |
| Survivability | 30% | Health, mitigation and defensive recovery |
| Secondary/role expression | 15% | Resource efficiency, cooldown interaction or role-specific secondary output |
| Utility | 10% | Movement, control resistance, information or situational effects |
| **Total** | **100%** | Budget is normalised per item and compared in an encounter model. |

This allocation is a simulation starting point, not a universal rule that every item must follow. Role-specific items may move up to 10 budget points between categories if their measured effective power remains within the guardrails below. Support and hybrid builds must be evaluated by their actual contribution rather than damage-per-second alone.

- Comparable builds should gain approximately 8–12% effective power between adjacent gear tiers: Worn Relics → Jadeforged → Zodiac Bound → Astral Ascendant → Firmament Relics.
- At the same level and tier, representative role/build variants should remain within a provisional ±5% encounter-contribution band after accounting for their intended role. Any larger difference needs an explicit documented trade-off and playtest evidence.
- A utility or defensive item may be situationally best without becoming a mandatory raw-power upgrade. Keep selected older items viable through distinct effects or niche uses, not by allowing unlimited vertical stat growth.
- No stat budget, item, upgrade, cultivation breakthrough or mastery reward may create paid-exclusive competitive power. Mastery after level 100 is bounded to choices, collections, achievements and cosmetics rather than an uncapped combat-stat treadmill.

## Item binding and tradeability matrix

`bindPolicy` and `tradeable` must agree; neither a client request nor a display label can override the server's item definition. The table defines defaults. Any exception must be explicit in versioned content and covered by tests.

| Item category | Default binding | Tradeable by default? | Rule |
| --- | --- | --- | --- |
| Ordinary gathered/crafted materials | `unbound` | Yes | Main player-market supply; quantities and ownership validated server-side. |
| Selected monster materials and bonus drops | `unbound` | Yes | Eligible for personal loot; drop rates and supply must be monitored. |
| Essential quest/key items | `character_bound` | No | Must not be required from a market-only source; provide alternate acquisition routes. |
| Breakthrough/progression materials | `unbound` or `account_bound` per content | Explicit per definition | At least one reliable non-market acquisition route; never permanently faction- or event-locked. |
| Crafted equipment before equip | `unbound` | Yes | Binding occurs only when an item definition explicitly uses `bind_on_equip`. |
| Equipment awarded as bind-on-pickup loot | `bind_on_pickup` | No | The server binds at award time; no trade window can bypass it. |
| Equipped character-specific gear | `bind_on_equip` or `character_bound` | No | Equipping applies binding atomically; no PvP death drops equipped items. |
| Account progression unlocks and profession recipes | `account_bound` | No | Unlock state belongs to the account; recipes are not market commodities unless explicitly redesigned. |
| Cosmetic entitlements from monetisation | `account_bound` | No by default | Cosmetic-only; platform purchase receipts are verified separately from combat systems. |
| Ordinary consumables | `unbound` | Yes | Effects, stack limits and use eligibility are server-authoritative. |
| Silver | Wallet/ledger entry | Transfer only through approved flows | No client-authored balance changes and no negative wallet balance. |
| Premium currency | Separate entitlement/currency domain | No player-to-player transfer | Restricted to approved cosmetics; never converted into competitive stats. |

Direct trade must reserve/escrow offered items, validate both parties and binding rules, and commit both sides atomically with a unique idempotency key. Marketplace listing must escrow an item so it cannot also be equipped, consumed, listed twice or transferred directly. Purchase settlement must atomically transfer the item, debit/credit Silver and burn the fee; retries must return the original result instead of duplicating a transfer. Expired/cancelled listings return escrowed items exactly once. Cross-faction trade is allowed unless a specific item definition forbids it; faction choice must not block essential progression.

## Silver flows and economy invariants

All balances are integer minor units (whole Silver units; no floating-point currency). `currency_ledger` is the audit record and `currency_wallets` is its transactional projection. Every currency creation, destruction or transfer writes a stable reason and idempotency key; wallet changes and ledger entries commit or roll back together.

| Flow | Classification | Initial rule |
| --- | --- | --- |
| Eligible PvE/quest/dungeon rewards | Source | Per-character reward, server-derived; duplicate reward keys cannot mint Silver twice. |
| Vendor sales and system grants | Source | Explicit content/config only; log the source and quantity. |
| Player purchase/sale | Transfer | Buyer debit and seller credit settle atomically; does not create net Silver. |
| Marketplace fee | Sink | Test a 3–5% fee, rounded deterministically in whole Silver and displayed before confirmation. |
| NPC services, crafting fees and optional upgrades | Sink | Costs are explicit before action; failed transactions do not consume currency or materials. |
| Premium-currency cosmetic purchase | Separate domain | Receipt verification and entitlement grant; no Silver or combat-stat minting. |

Economy simulations must report gross Silver created, gross Silver destroyed, net supply, per-account concentration, median/percentile balances, transaction volume, item supply, market fee totals, and sources/sinks by activity. Player-to-player transfers are supply-neutral before fees. Market fees are destroyed, not credited to a hidden wallet. Do not ship a fee, repair cost or upgrade cost solely because it is common in another game; validate its effect on low-level/new/returning players and market liquidity.

## Personal reward tables: first balance fixtures

Rewards are rolled per eligible character, not from one shared loot bag. The values below are a first simulation profile for the Ashen Frontier only; they do not imply the reward system is implemented. Item IDs must resolve to versioned definitions. The server records a stable encounter/reward claim key before applying XP, Silver or item grants.

| Encounter | XP per eligible character | Silver per eligible character | Guaranteed material | Bonus material roll (per eligible character) |
| --- | ---: | ---: | --- | --- |
| Rift Stalker (standard/fast) | 60–90 | 3–6 | None | 8% chance of 1 Ashen-Jade Fragment |
| Ashen Wisp (standard/ranged) | 70–100 | 3–7 | None | 10% chance of 1 Ashen-Jade Fragment |
| Jadebound Sentinel (durable) | 90–120 | 5–9 | None | 12% chance of 1 Ashen-Jade Fragment |
| Elite encounter (future content) | 250–500 | 15–30 | 1 common material | 15% chance of 1 uncommon material |
| Dungeon boss (future content) | 1,500–4,000 | 50–120 | 1–3 encounter materials | 5% initial rare-item roll; bad-luck group configured per item |

Rare-drop percentages are per eligible reward roll, not per party. A selected progression-critical rare reward may use `bad_luck_protected`; its group and pity counter must be explicit and persistent. Bad-luck protection must increase a player's chance or guarantee the reward after a documented number of eligible misses, never silently reset on reconnect, and never require a missed scheduled event. For bosses, eligibility is based on meaningful encounter participation and role-aware contribution, not last hit, highest damage, guild ownership or ability to monopolise the spawn. Essential gear/materials must have alternate acquisition routes.

## Acceptance tests for the specification

Before implementation, the balance simulator and automated content checks must prove:

1. The XP function is monotonic for levels 1–99, produces non-negative thresholds, caps at 100, and totals exactly 693,000 XP under this profile.
2. The five band totals in the table are reproducible from the formula; each simulated mixed-activity profile is normalised to 100% and reports time-to-level and time-to-cap by level band.
3. No tested activity dominates all alternatives by more than the agreed playtest tolerance; trivial-enemy farming diminishes and same-level play is not penalised.
4. Every item has a valid binding/tradeability combination; quest-critical and breakthrough progression have a reliable non-market route; premium currency and competitive power remain separate.
5. Direct trades, listings, cancellations, expirations, purchases, reward claims and retries cannot duplicate or destroy items/Silver; injected transaction failures roll back both ledger and wallet/escrow changes.
6. Player-to-player trades are supply-neutral before fees; marketplace fees are within 3–5%, deterministically rounded, and removed from circulating Silver.
7. Personal loot is independent per eligible character; support/low-damage participation can qualify; bad-luck counters survive reconnect/restart and only increment on eligible misses.
8. Adjacent gear tiers remain within the 8–12% effective-power target for comparable builds; role/build comparisons are within the provisional ±5% band or carry a documented, tested trade-off.
9. All fixtures and reward definitions are versioned, schema-valid, localisable and use stable IDs/idempotency keys. No progression-critical item is exclusive to one faction, guild, market listing or missed scheduled event.

**Status:** specification and test profile only. The XP curve, stat allocations, reward values, drop rates, Silver values and fee are provisional until the simulator and closed playtests provide evidence. No production implementation or balance claim is implied by this document.

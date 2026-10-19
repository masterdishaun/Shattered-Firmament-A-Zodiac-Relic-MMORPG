# Faction Starts and Side-Quest Catalogue

**Status:** Content outline 0.1; full dialogue and final reward data remain to be authored.

## Shared rules

Faction choice determines starting region, mentor, opening cinematic, early quest chain, introductory solo dungeon and first companion encounter. All openings occur during the same astral eclipse and reveal different evidence pointing to the scratched-out twelfth point of a Zodiac sigil. Choices may alter dialogue, trust, services, lore and cosmetics, but cannot permanently lock essential progression.

## Sovereign Sect — White Jade Bastion

### Opening: The Ward That Lied (1–20)

A ward-engine fails during an eclipse. Marshal Ren Kaid orders the player to recover a missing jade seal. Investigation reveals power was diverted to keep the upper city bright while lower terraces suffered spiritual sickness. The Underterrace Archive holds records of residents listed as evacuated but never rescued. The player rescues a wounded Syndicate hunter and finds the scratched Zodiac sigil.

### Side quests

1. **The Names We Sealed (5–10):** recover an evacuation ledger, locate families and deliver verified memorial records; choose private inquiry or public archive.
2. **The Price of a Quiet Street (8–14):** investigate relic confiscations and propose transparent inspection rules.
3. **A Sword for the Unarmed (12–18):** train evacuees and establish community protection without forcing them to join the Sect.
4. **The Marshal's Unsent Letters (16–20):** recover letters to families affected by the sealing order; reveal Ren's motives without absolving him.

**Dungeon:** Underterrace Archive. Boss: Census Warden, a construct attacking anyone missing from its incomplete registry. Restoring names and disabling its hostile protocol is the intended narrative resolution.

## Ashen Syndicate — Cinderwake

### Opening: The Shard That Sang (1–20)

A salvage rig uncovers a living Zodiac scale. The player secures it before a foreman sells it. Workers hear memories that are not theirs. Mira Voss wants the site shut down, while leaders fear losing the city's income. Evidence reveals illegal extraction and the scratched Zodiac sigil.

### Side quests

1. **The Last Shift (5–10):** rescue trapped workers and document unsafe orders; choose immediate publication or secure a compensation fund first.
2. **A Market for Stolen Memories (8–14):** trace memory fragments taken without consent and decide whether to close the market or create a consent-based archive.
3. **The Price of a Free Hand (12–18):** defend a community workshop and establish a public protection charter.
4. **The Beast in the Furnace (16–20):** calm a celestial beast stabilising an unsafe furnace and persuade the owner to redesign the production line.

**Dungeon:** Cinder Vault. Boss: Furnace Saint, a worker fused to a failing extraction rig. Interrupting the loop and freeing the trapped spirit offers the most complete narrative resolution.

## Astral Concord — Luminous Veil

### Opening: The Forest That Remembered (1–20)

A spirit-beast arrives at a river shrine carrying memories of a city absent from every map. The player tracks it through a memory storm and discovers villagers reliving the same evening. The story challenges the Concord's assumption that calming a crisis grants moral permission to change people's memories.

### Side quests

1. **The Names the River Keeps (5–10):** recover named objects, find descendants and choose between public memorials or private memory returns.
2. **A Beast Is Not a Tool (8–14):** discover that a captured fox spirit is protecting its injured litter; create a sanctuary or relocate the family safely.
3. **The Healer Who Would Not Choose (12–18):** coordinate triage between an urgent village crisis and a failing shrine.
4. **The Quiet That Costs Too Much (16–20):** investigate a calming ritual that suppresses residents' memories and establish consent-based oversight.

**Dungeon:** Drowned Shrine. Boss: Echo-Bound Guardian, compelled to repeat its final command. Reconstructing the interrupted covenant allows the Guardian to choose its future.

## Shared side-quest threads (21–95)

1. **The Cartographer of Missing Roads (21–30):** map routes appearing only in memory storms.
2. **The Price of Ashen-Jade (25–35):** investigate disappearing well memories near extraction and negotiate safer stewardship.
3. **Twelve Plates, Eleven Names (30–40):** compare faction archives and discover the missing point is the engine's consent seal.
4. **The Hunter Who Came Back (35–45):** clear a rival hunter's name and uncover a protocol manipulating faction hostility.
5. **A Feast Without Flags (40–50):** help displaced communities share supplies and expose a profiteering quartermaster.
6. **The Guardian's First Name (45–55):** reconstruct a Zodiac's original name from three memory sources.
7. **The Auction of Tomorrow (55–65):** expose forged prophecies used to manipulate the global market.
8. **The Village That Voted No (60–70):** help a community negotiate stewardship without a faction overriding its decision.
9. **Twelve Shadows at Dusk (70–80):** recover evidence of the Hollow Regent's restoration protocol in a fractured-memory instance.
10. **The Last Unwritten Page (85–95):** assemble Shen Veyu's journal and choose how findings are published.

## Quest-content contract

Every implemented quest requires a stable ID/version, availability, faction conditions, level range, prerequisites, objective IDs/counts, optional objectives, dialogue/localisation keys, choice flags, reward table, repeatability policy, catch-up eligibility, analytics events and test coverage. Rewards and completion state are server-authoritative and idempotent.

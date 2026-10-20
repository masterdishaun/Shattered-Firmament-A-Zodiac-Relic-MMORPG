import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const readJson = async (relativePath) =>
  JSON.parse(
    (await readFile(new URL(relativePath, import.meta.url), "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );

const loadContent = async (name) => readJson(`../fixtures/${name}.json`);
const loadSchema = async (name) => readJson(`../schemas/${name}.schema.json`);
const ajv = new Ajv2020({ allErrors: true });

const assertValidCollection = async (
  fixtureName,
  schemaName,
  idField = "id",
) => {
  const [schema, records] = await Promise.all([
    loadSchema(schemaName),
    loadContent(fixtureName),
  ]);
  const validate = ajv.compile(schema);
  assert.ok(records.length > 0, `${fixtureName} must not be empty`);
  assert.equal(
    new Set(records.map((record) => record[idField])).size,
    records.length,
    `${fixtureName} contains duplicate ${idField} values`,
  );
  for (const record of records) {
    assert.equal(
      validate(record),
      true,
      `${fixtureName}/${record[idField]}: ${JSON.stringify(validate.errors)}`,
    );
  }
  return records;
};

const assertAcyclicQuestGraph = (quests) => {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const visiting = new Set();
  const visited = new Set();

  const visit = (questId) => {
    if (visiting.has(questId)) {
      throw new Error(`Quest prerequisite cycle includes ${questId}`);
    }
    if (visited.has(questId)) return;
    const quest = byId.get(questId);
    assert.ok(quest, `Missing prerequisite quest: ${questId}`);
    visiting.add(questId);
    for (const prerequisiteId of quest.prerequisiteQuestIds) {
      assert.ok(
        byId.has(prerequisiteId),
        `${quest.id} references missing prerequisite ${prerequisiteId}`,
      );
      visit(prerequisiteId);
    }
    visiting.delete(questId);
    visited.add(questId);
  };

  for (const quest of quests) visit(quest.id);
};

test("faction definitions have valid schemas and unique starting regions", async () => {
  const factions = await assertValidCollection(
    "factions",
    "faction-definition",
  );
  assert.equal(factions.length, 3);
  assert.equal(
    new Set(factions.map((faction) => faction.startingRegionId)).size,
    3,
  );
});

test("quest catalog has valid schemas, ranges, references and an acyclic prerequisite graph", async () => {
  const quests = await assertValidCollection(
    "quest-catalog",
    "quest-definition",
  );
  assert.equal(quests.length, 25);
  for (const quest of quests) {
    assert.ok(
      quest.levelMin <= quest.levelMax,
      `${quest.id} has an invalid level range`,
    );
    assert.equal(
      new Set(quest.objectives.map((objective) => objective.id)).size,
      quest.objectives.length,
      `${quest.id} contains duplicate objective IDs`,
    );
    if (quest.essentialProgression) {
      assert.notEqual(
        quest.availability,
        "faction",
        "Essential progression cannot be locked to one faction quest.",
      );
    }
  }
  assertAcyclicQuestGraph(quests);
  assert.throws(
    () =>
      assertAcyclicQuestGraph([
        { id: "test.a", prerequisiteQuestIds: ["test.b"] },
        { id: "test.b", prerequisiteQuestIds: ["test.a"] },
      ]),
    /cycle/i,
  );
  assert.throws(
    () =>
      assertAcyclicQuestGraph([
        { id: "test.orphan", prerequisiteQuestIds: ["missing.quest"] },
      ]),
    /missing prerequisite/i,
  );
});

test("character archetypes and item definitions satisfy their schemas", async () => {
  const archetypes = await assertValidCollection(
    "character-archetypes",
    "character-archetype",
  );
  const items = await assertValidCollection("items", "item-definition");
  assert.equal(archetypes.length, 8);
  assert.deepEqual(
    archetypes.map((entry) => entry.displayName),
    [
      "Vanguard",
      "Blade Dancer",
      "Spear Saint",
      "Shadow Adept",
      "Astral Mystic",
      "Spirit Warden",
      "Storm Caller",
      "Iron Fist",
    ],
  );
  assert.ok(items.some((item) => item.cosmeticOnly === true));
  for (const item of items) {
    if (
      ["bind_on_pickup", "account_bound", "character_bound"].includes(
        item.bindPolicy,
      )
    ) {
      assert.equal(
        item.tradeable,
        false,
        item.id + " cannot be tradeable with binding policy " + item.bindPolicy,
      );
    }
    if (item.tradeable) {
      assert.ok(
        ["unbound", "bind_on_equip"].includes(item.bindPolicy),
        item.id + " has an invalid tradeability/binding combination",
      );
    }
  }
  for (const archetype of archetypes) {
    for (const itemId of archetype.startingEquipmentIds ?? []) {
      assert.ok(
        items.some((item) => item.id === itemId),
        `${archetype.id} references missing item ${itemId}`,
      );
    }
  }
});

test("zone rules preserve protected starts, peace zones and explicit PvP boundaries", async () => {
  const [zones, factions] = await Promise.all([
    assertValidCollection("zones", "zone-definition"),
    loadContent("factions"),
  ]);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  for (const faction of factions) {
    const start = zonesById.get(faction.startingRegionId);
    assert.ok(start, `${faction.id} has no matching starting zone`);
    assert.equal(start.zoneType, "faction_start");
    assert.deepEqual(start.allowedFactionIds, [faction.id]);
    assert.equal(start.safeZone, true);
    assert.equal(start.pvpEnabled, false);
  }
  assert.ok(
    zones.some(
      (zone) => zone.zoneType === "peace" && zone.safeZone && !zone.pvpEnabled,
    ),
  );
  assert.ok(
    zones.some(
      (zone) =>
        zone.zoneType === "faction_pvp" && !zone.safeZone && zone.pvpEnabled,
    ),
  );
  assert.ok(
    zones.some((zone) => zone.zoneType === "contested" && !zone.safeZone),
  );
  const validateZone = new Ajv2020({ allErrors: true }).compile(
    await loadSchema("zone-definition"),
  );
  assert.equal(
    validateZone({ ...zones[0], pvpEnabled: true }),
    false,
    "A faction starting zone must not allow PvP.",
  );
});

test("dungeons reference valid zones and rewards and preserve faction access alternatives", async () => {
  const [dungeons, zones, rewards] = await Promise.all([
    assertValidCollection("dungeons", "dungeon-definition"),
    loadContent("zones"),
    loadContent("reward-tables"),
  ]);
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const rewardIds = new Set(rewards.map((reward) => reward.id));
  for (const dungeon of dungeons) {
    assert.ok(
      dungeon.levelMin <= dungeon.levelMax,
      `${dungeon.id} has an invalid level range`,
    );
    assert.ok(
      dungeon.partySizeMin <= dungeon.partySizeMax,
      `${dungeon.id} has an invalid party range`,
    );
    assert.ok(
      zoneIds.has(dungeon.zoneId),
      `${dungeon.id} references missing zone ${dungeon.zoneId}`,
    );
    assert.ok(
      rewardIds.has(dungeon.rewardTableId),
      `${dungeon.id} references missing reward table ${dungeon.rewardTableId}`,
    );
    if (dungeon.essentialProgression) {
      assert.equal(dungeon.factionAccess, "all");
    }
  }
  const validateDungeon = new Ajv2020({ allErrors: true }).compile(
    await loadSchema("dungeon-definition"),
  );
  assert.equal(
    validateDungeon({ ...dungeons[0], partySizeMax: 4 }),
    false,
    "Solo story dungeons must have a party size of one.",
  );
});

test("reward tables satisfy schema, item references and quantity bounds", async () => {
  const [tables, items] = await Promise.all([
    assertValidCollection("reward-tables", "reward-table"),
    loadContent("items"),
  ]);
  const itemIds = new Set(items.map((item) => item.id));
  for (const table of tables) {
    assert.equal(
      new Set(table.entries.map((entry) => entry.id)).size,
      table.entries.length,
      `${table.id} contains duplicate reward entry IDs`,
    );
    for (const entry of table.entries) {
      assert.ok(
        entry.quantityMin <= entry.quantityMax,
        `${table.id}/${entry.id} has an invalid quantity range`,
      );
      if (entry.itemId) {
        assert.ok(
          itemIds.has(entry.itemId),
          `${table.id} references missing item ${entry.itemId}`,
        );
      }
    }
  }
});

test("provisional reward profiles provide personal XP/Silver and tradeability-safe materials", async () => {
  const tables = await loadContent("reward-tables");
  const byId = new Map(tables.map((table) => [table.id, table]));
  for (const id of [
    "rewards.ashen-frontier.rift-stalker",
    "rewards.ashen-frontier.ashen-wisp",
    "rewards.ashen-frontier.jadebound-sentinel",
  ]) {
    const table = byId.get(id);
    assert.ok(table, "Missing provisional enemy reward table: " + id);
    const xp = table.entries.find((entry) => entry.rewardType === "experience");
    const silver = table.entries.find(
      (entry) => entry.rewardType === "currency",
    );
    const material = table.entries.find(
      (entry) => entry.rewardType === "material",
    );
    assert.ok(xp && xp.quantityMin <= xp.quantityMax && xp.tradeable === false);
    assert.ok(
      silver &&
        silver.currencyCode === "SILVER" &&
        silver.quantityMin <= silver.quantityMax,
    );
    assert.ok(
      material &&
        material.tradeable === true &&
        material.chance > 0 &&
        material.chance < 1,
    );
  }
  const boss = byId.get("rewards.dungeon-boss.test-profile");
  assert.equal(boss?.rollPolicy, "bad_luck_protected");
  assert.ok(
    boss?.entries.some(
      (entry) => entry.badLuckGroupId === "bad-luck.dungeon-boss.rare",
    ),
  );
});
test("encounters reference valid zones and reward tables", async () => {
  const [encounters, zones, rewards] = await Promise.all([
    assertValidCollection("encounters", "encounter-definition"),
    loadContent("zones"),
    loadContent("reward-tables"),
  ]);
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const rewardIds = new Set(rewards.map((reward) => reward.id));
  for (const encounter of encounters) {
    assert.ok(
      encounter.levelMin <= encounter.levelMax,
      `${encounter.id} has an invalid level range`,
    );
    assert.ok(
      zoneIds.has(encounter.zoneId),
      `${encounter.id} references missing zone ${encounter.zoneId}`,
    );
    assert.ok(
      rewardIds.has(encounter.rewardTableId),
      `${encounter.id} references missing reward table ${encounter.rewardTableId}`,
    );
    if (encounter.factionAccess !== "all") {
      assert.ok(
        encounter.factionIds?.length,
        `${encounter.id} must declare faction access`,
      );
    }
  }
});

test("progression baseline keeps realm and gear tiers within the launch level cap", async () => {
  const schema = await loadSchema("progression-definition");
  const progression = await loadContent("progression");
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(progression), true, JSON.stringify(validate.errors));
  assert.equal(progression.levelCap, 100);
  const curve = progression.experienceCurve;
  const thresholds = [];
  for (let level = 1; level < progression.levelCap; level += 1) {
    const threshold = curve.baseXp + curve.perLevelXp * level;
    assert.ok(threshold > 0, "level " + level + " must require positive XP");
    if (thresholds.length > 0)
      assert.ok(
        threshold >= thresholds[thresholds.length - 1],
        "XP thresholds must be monotonic",
      );
    thresholds.push(threshold);
  }
  assert.equal(
    thresholds.reduce((sum, threshold) => sum + threshold, 0),
    curve.totalXpToCap,
  );
  assert.equal(curve.totalXpToCap, 693000);
  const bandTotals = [
    [1, 20],
    [20, 40],
    [40, 60],
    [60, 80],
    [80, 100],
  ].map(([firstLevel, nextLevel]) =>
    thresholds
      .slice(firstLevel - 1, nextLevel - 1)
      .reduce((sum, threshold) => sum + threshold, 0),
  );
  assert.deepEqual(bandTotals, [87400, 115400, 139400, 163400, 187400]);
  const budget = progression.statBudget;
  assert.equal(
    budget.offensePercent +
      budget.survivabilityPercent +
      budget.roleExpressionPercent +
      budget.utilityPercent,
    100,
  );
  assert.ok(budget.maxRoleShiftPoints >= 0 && budget.maxRoleShiftPoints <= 100);
  assert.ok(
    budget.sameTierContributionVariancePercent >= 0 &&
      budget.sameTierContributionVariancePercent <= 100,
  );
  assert.ok(
    progression.expectedHoursToCap.minimum <=
      progression.expectedHoursToCap.maximum,
  );
  assert.deepEqual(
    progression.cultivationRealms.map((realm) => realm.breakthroughLevel),
    progression.breakthroughLevels,
  );
  assert.equal(
    new Set(progression.cultivationRealms.map((realm) => realm.id)).size,
    progression.cultivationRealms.length,
  );
  assert.equal(
    new Set(progression.gearTiers.map((tier) => tier.id)).size,
    progression.gearTiers.length,
  );
  for (const tier of progression.gearTiers) {
    assert.ok(
      tier.levelMin <= tier.levelMax,
      `${tier.id} has an invalid level range`,
    );
    assert.ok(
      tier.expectedPowerGrowthPercent.minimum <=
        tier.expectedPowerGrowthPercent.maximum,
    );
  }
  assert.equal(
    validate({ ...progression, levelCap: 120 }),
    false,
    "The launch level cap must not exceed the documented level 100 baseline.",
  );
});

test("all dungeon encounters and reward entry types resolve to valid content", async () => {
  const [dungeons, encounters, tables] = await Promise.all([
    loadContent("dungeons"),
    loadContent("encounters"),
    loadContent("reward-tables"),
  ]);
  const encounterIds = new Set(encounters.map((encounter) => encounter.id));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  for (const dungeon of dungeons) {
    for (const encounterId of dungeon.encounterIds) {
      assert.ok(
        encounterIds.has(encounterId),
        `${dungeon.id} references missing encounter ${encounterId}`,
      );
    }
  }
  for (const table of tables) {
    for (const entry of table.entries) {
      if (["item", "material", "cosmetic"].includes(entry.rewardType)) {
        assert.ok(
          entry.itemId,
          `${table.id}/${entry.id} must reference an item`,
        );
      }
      if (entry.rewardType === "currency") {
        assert.ok(
          entry.currencyCode,
          `${table.id}/${entry.id} must specify a currency code`,
        );
      }
      assert.ok(tableById.has(table.id));
    }
  }
});

test("inventory item instances and trade offers enforce structural safety rules", async () => {
  const [itemSchema, tradeSchema, tradeOffers, items] = await Promise.all([
    loadSchema("item-instance"),
    loadSchema("trade-offer"),
    loadContent("trade-offers"),
    loadContent("items"),
  ]);
  const validateItem = new Ajv2020({ allErrors: true }).compile(itemSchema);
  const validateTrade = new Ajv2020({ allErrors: true }).compile(tradeSchema);
  assert.ok(items.length > 0);
  const itemInstance = {
    instanceId: "c65c12b0-8b31-4b2a-9d62-6f4a0e1a1008",
    ownerCharacterId: "c65c12b0-8b31-4b2a-9d62-6f4a0e1a1009",
    definitionId: "weapon.training-jade-blade",
    definitionVersion: 1,
    quantity: 1,
    upgradeLevel: 0,
    equippedSlot: null,
  };
  assert.equal(
    validateItem(itemInstance),
    true,
    JSON.stringify(validateItem.errors),
  );
  assert.equal(validateItem({ ...itemInstance, quantity: 0 }), false);
  assert.equal(validateItem({ ...itemInstance, upgradeLevel: 31 }), false);
  assert.equal(tradeOffers.length, 2);
  for (const offer of tradeOffers) {
    assert.equal(
      validateTrade(offer),
      true,
      JSON.stringify(validateTrade.errors),
    );
    assert.ok(Date.parse(offer.expiresAt) > Date.parse(offer.createdAt));
    assert.equal(
      new Set(offer.offeredItems.map((item) => item.itemInstanceId)).size,
      offer.offeredItems.length,
    );
  }
  assert.equal(
    validateTrade({
      ...tradeOffers[0],
      buyerCharacterId: tradeOffers[0].sellerCharacterId,
    }),
    false,
    "Marketplace listings must not reserve a specific buyer.",
  );
  assert.equal(
    validateTrade({ ...tradeOffers[1], buyerCharacterId: null }),
    false,
    "Direct offers must identify their intended buyer.",
  );
  assert.equal(
    validateTrade({ ...tradeOffers[0], requestedAmount: 0 }),
    false,
    "A trade offer cannot request a zero or negative price.",
  );
});

test("reward-granted protocol validates server-owned progression and personal loot", async () => {
  const schema = await loadSchema("reward-granted");
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const envelope = {
    type: "S2C_RewardGranted",
    protocolVersion: 1,
    payload: {
      sourceId: "rift-stalker",
      experienceAwarded: 60,
      totalExperience: 60,
      level: 1,
      silverAwarded: 3,
      totalSilver: 3,
      loot: [
        {
          itemId: "material.ashen-jade-fragment",
          quantity: 1,
          tradeable: true,
        },
      ],
    },
  };
  assert.equal(validate(envelope), true, JSON.stringify(validate.errors));
  assert.equal(
    validate({
      ...envelope,
      payload: { ...envelope.payload, silverAwarded: -1 },
    }),
    false,
  );
  assert.equal(
    validate({
      ...envelope,
      payload: { ...envelope.payload, clientDamage: 999 },
    }),
    false,
  );
});

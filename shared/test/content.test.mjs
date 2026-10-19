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

test("faction fixtures satisfy the faction schema and have unique starting regions", async () => {
  const [schema, factions] = await Promise.all([
    readJson("../schemas/faction-definition.schema.json"),
    readJson("../fixtures/factions.json"),
  ]);
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schema);

  assert.equal(factions.length, 3);
  assert.equal(new Set(factions.map((faction) => faction.id)).size, 3);
  assert.equal(
    new Set(factions.map((faction) => faction.startingRegionId)).size,
    3,
  );
  for (const faction of factions) {
    assert.equal(validate(faction), true, JSON.stringify(validate.errors));
  }
});

test("quest catalog satisfies the quest schema and protects faction access boundaries", async () => {
  const [schema, quests] = await Promise.all([
    readJson("../schemas/quest-definition.schema.json"),
    readJson("../fixtures/quest-catalog.json"),
  ]);
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schema);

  assert.equal(quests.length, 25);
  assert.equal(new Set(quests.map((quest) => quest.id)).size, quests.length);
  for (const quest of quests) {
    assert.equal(
      validate(quest),
      true,
      `${quest.id}: ${JSON.stringify(validate.errors)}`,
    );
    assert.ok(
      quest.levelMin <= quest.levelMax,
      `${quest.id} has an invalid level range`,
    );
    if (quest.essentialProgression) {
      assert.notEqual(
        quest.availability,
        "faction",
        "essential progression cannot be faction-exclusive",
      );
    }
  }
});

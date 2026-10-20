import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";
import { grantEnemyDefeatRewards } from "./progression.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = testDatabaseUrl ? describe : describe.skip;
let adminPool: Pool;
let pool: Pool;
let schemaName: string;

async function createCharacter() {
  const userId = randomUUID();
  const characterId = randomUUID();
  await pool.query(
    "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)",
    [
      userId,
      `${userId}@example.test`,
      `player_${userId.replaceAll("-", "").slice(0, 20)}`,
      "test-hash",
    ],
  );
  await pool.query(
    `INSERT INTO characters (id, user_id, name, class_id, faction_id, active_map_id)
     VALUES ($1, $2, $3, 'vanguard', 'sovereign_sect', 'white_jade_bastion')`,
    [characterId, userId, `Hero ${characterId}`],
  );
  return { userId, characterId };
}

databaseSuite("durable progression and personal reward grants", () => {
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    const database = await adminPool.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    expect(database.rows[0]?.current_database).toMatch(/_test$/);
    schemaName = `sf_rewards_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    const url = new URL(testDatabaseUrl!);
    url.searchParams.set("options", `-c search_path=${schemaName}`);
    pool = new Pool({ connectionString: url.toString(), max: 4 });
    await runMigrations(pool, resolve(process.cwd(), "migrations"));
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool && schemaName)
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool?.end();
  });

  it("atomically persists XP, level progression, Silver, and personal loot exactly once", async () => {
    const { userId, characterId } = await createCharacter();
    const input = {
      eventKey: `enemy:rift-stalker:${randomUUID()}`,
      userId,
      characterId,
      archetype: "rift-stalker" as const,
      enemyLevel: 2,
      random: () => 0,
    };
    const [first, replay] = await Promise.all([
      grantEnemyDefeatRewards(pool, input),
      grantEnemyDefeatRewards(pool, input),
    ]);
    expect([first.granted, replay.granted].sort()).toEqual([false, true]);
    const granted = first.granted ? first : replay;
    const duplicate = first.granted ? replay : first;
    expect(granted).toMatchObject({
      granted: true,
      experience: 60,
      silver: 3,
      level: 1,
      totalExperience: 60,
      totalSilver: 3,
    });
    expect(granted.loot).toEqual([
      { itemId: "material.ashen-jade-fragment", quantity: 1, tradeable: true },
    ]);
    expect(duplicate).toMatchObject({
      granted: false,
      experience: 0,
      silver: 0,
      loot: [],
      totalExperience: 60,
      totalSilver: 3,
    });

    const character = await pool.query<{ experience: string; level: number }>(
      "SELECT experience, level FROM characters WHERE id = $1",
      [characterId],
    );
    expect(character.rows[0]).toMatchObject({ experience: "60", level: 1 });
    const wallet = await pool.query<{ balance: string }>(
      "SELECT balance FROM currency_wallets WHERE user_id = $1 AND currency_code = 'silver'",
      [userId],
    );
    expect(wallet.rows[0]?.balance).toBe("3");
    const claims = await pool.query<{ loot: { itemId: string }[] }>(
      "SELECT loot FROM character_reward_claims WHERE event_key = $1 AND character_id = $2",
      [input.eventKey, characterId],
    );
    expect(claims.rowCount).toBe(1);
    expect(claims.rows[0]?.loot[0]?.itemId).toBe(
      "material.ashen-jade-fragment",
    );
    const inventory = await pool.query<{
      definition_id: string;
      definition_version: number;
      owner_character_id: string;
      quantity: number;
      bound_to_user_id: string | null;
    }>(
      `SELECT definition_id, definition_version, owner_character_id, quantity, bound_to_user_id
       FROM item_instances WHERE owner_character_id = $1`,
      [characterId],
    );
    expect(inventory.rows).toEqual([
      expect.objectContaining({
        definition_id: "material.ashen-jade-fragment",
        definition_version: 1,
        owner_character_id: characterId,
        quantity: 1,
        bound_to_user_id: null,
      }),
    ]);

    const ledger = await pool.query(
      "SELECT id FROM currency_ledger WHERE user_id = $1 AND reason = 'enemy_defeat'",
      [userId],
    );
    expect(ledger.rowCount).toBe(1);
    expect(inventory.rowCount).toBe(1);
  });

  it("persists level-ups when a reward crosses the next-level threshold", async () => {
    const { userId, characterId } = await createCharacter();
    await pool.query("UPDATE characters SET experience = 4_050 WHERE id = $1", [
      characterId,
    ]);
    const result = await grantEnemyDefeatRewards(pool, {
      eventKey: `enemy:level-up:${randomUUID()}`,
      userId,
      characterId,
      archetype: "rift-stalker",
      enemyLevel: 2,
      random: () => 0,
    });
    expect(result).toMatchObject({
      granted: true,
      experience: 60,
      level: 2,
      totalExperience: 4_110,
    });
    const saved = await pool.query<{ level: number; experience: string }>(
      "SELECT level, experience FROM characters WHERE id = $1",
      [characterId],
    );
    expect(saved.rows[0]).toEqual({ level: 2, experience: "4110" });
  });
  it("applies level-difference diminishing returns to persisted XP only", async () => {
    const { userId, characterId } = await createCharacter();
    await pool.query(
      "UPDATE characters SET experience = 142100, level = 30 WHERE id = $1",
      [characterId],
    );
    const eventKey = `enemy:trivial:${randomUUID()}`;
    const result = await grantEnemyDefeatRewards(pool, {
      eventKey,
      userId,
      characterId,
      archetype: "rift-stalker",
      enemyLevel: 2,
      random: () => 0,
    });
    expect(result).toMatchObject({
      experience: 6,
      silver: 3,
      level: 30,
      totalExperience: 142106,
    });
    const claim = await pool.query<{ experience_awarded: number }>(
      "SELECT experience_awarded FROM character_reward_claims WHERE event_key = $1",
      [eventKey],
    );
    expect(Number(claim.rows[0]?.experience_awarded)).toBe(6);
    const wallet = await pool.query<{ balance: string }>(
      "SELECT balance FROM currency_wallets WHERE user_id = $1 AND currency_code = 'silver'",
      [userId],
    );
    expect(wallet.rows[0]?.balance).toBe("3");
  });

  it("guarantees the protected fragment after ten misses and resets pity on a drop", async () => {
    const { userId, characterId } = await createCharacter();
    for (let index = 0; index < 9; index += 1) {
      const result = await grantEnemyDefeatRewards(pool, {
        eventKey: `enemy:pity-miss:${index}:${randomUUID()}`,
        userId,
        characterId,
        archetype: "rift-stalker",
        enemyLevel: 2,
        random: () => 0.5,
      });
      expect(result.loot).toEqual([]);
    }
    const misses = await pool.query<{ consecutive_misses: number }>(
      "SELECT consecutive_misses FROM character_loot_pity WHERE character_id = $1",
      [characterId],
    );
    expect(misses.rows[0]?.consecutive_misses).toBe(9);

    const guaranteed = await grantEnemyDefeatRewards(pool, {
      eventKey: `enemy:pity-guarantee:${randomUUID()}`,
      userId,
      characterId,
      archetype: "rift-stalker",
      enemyLevel: 2,
      random: () => 0.5,
    });
    expect(guaranteed.loot).toEqual([
      { itemId: "material.ashen-jade-fragment", quantity: 1, tradeable: true },
    ]);
    const reset = await pool.query<{ consecutive_misses: number }>(
      "SELECT consecutive_misses FROM character_loot_pity WHERE character_id = $1",
      [characterId],
    );
    expect(reset.rows[0]?.consecutive_misses).toBe(0);
    const items = await pool.query(
      "SELECT id FROM item_instances WHERE owner_character_id = $1 AND definition_id = 'material.ashen-jade-fragment'",
      [characterId],
    );
    expect(items.rowCount).toBe(1);
  });

  it("does not advance pity when a duplicate event is replayed concurrently", async () => {
    const { userId, characterId } = await createCharacter();
    for (let index = 0; index < 8; index += 1) {
      await grantEnemyDefeatRewards(pool, {
        eventKey: `enemy:pity-prior:${index}:${randomUUID()}`,
        userId,
        characterId,
        archetype: "rift-stalker",
        enemyLevel: 2,
        random: () => 0.5,
      });
    }
    const eventKey = `enemy:pity-duplicate:${randomUUID()}`;
    const input = {
      eventKey,
      userId,
      characterId,
      archetype: "rift-stalker" as const,
      enemyLevel: 2,
      random: () => 0.5,
    };
    const [first, replay] = await Promise.all([
      grantEnemyDefeatRewards(pool, input),
      grantEnemyDefeatRewards(pool, input),
    ]);
    expect([first.granted, replay.granted].sort()).toEqual([false, true]);
    const state = await pool.query<{ consecutive_misses: number }>(
      "SELECT consecutive_misses FROM character_loot_pity WHERE character_id = $1",
      [characterId],
    );
    expect(state.rows[0]?.consecutive_misses).toBe(9);
    const claims = await pool.query(
      "SELECT id FROM character_reward_claims WHERE event_key = $1 AND character_id = $2",
      [eventKey, characterId],
    );
    expect(claims.rowCount).toBe(1);
  });

  it("rolls back pity, claims, and rewards if loot materialization fails", async () => {
    const { userId, characterId } = await createCharacter();
    const eventKey = `enemy:pity-rollback:${randomUUID()}`;
    await pool.query(
      "UPDATE item_definitions SET tradeable = false WHERE id = 'material.ashen-jade-fragment' AND content_version = 1",
    );
    try {
      await expect(
        grantEnemyDefeatRewards(pool, {
          eventKey,
          userId,
          characterId,
          archetype: "rift-stalker",
          enemyLevel: 2,
          random: () => 0,
        }),
      ).rejects.toThrow("REWARD_ITEM_TRADEABILITY_MISMATCH");
    } finally {
      await pool.query(
        "UPDATE item_definitions SET tradeable = true WHERE id = 'material.ashen-jade-fragment' AND content_version = 1",
      );
    }
    const state = await pool.query(
      "SELECT character_id FROM character_loot_pity WHERE character_id = $1",
      [characterId],
    );
    const claim = await pool.query(
      "SELECT id FROM character_reward_claims WHERE event_key = $1 AND character_id = $2",
      [eventKey, characterId],
    );
    const inventory = await pool.query(
      "SELECT id FROM item_instances WHERE owner_character_id = $1 AND definition_id = 'material.ashen-jade-fragment'",
      [characterId],
    );
    expect(state.rowCount).toBe(0);
    expect(claim.rowCount).toBe(0);
    expect(inventory.rowCount).toBe(0);
  });

  it("refuses a reward grant for a character not owned by the supplied user", async () => {
    const { characterId } = await createCharacter();
    await expect(
      grantEnemyDefeatRewards(pool, {
        eventKey: `enemy:forged:${randomUUID()}`,
        userId: randomUUID(),
        characterId,
        archetype: "ashen-wisp",
        enemyLevel: 1,
        random: () => 0,
      }),
    ).rejects.toThrow("REWARD_CHARACTER_NOT_FOUND");
  });
});

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";
import {
  claimQuestCompletionRewards,
  ContentRewardError,
  grantDungeonCompletionRewards,
} from "./content-rewards.js";
import {
  startQuest,
  recordTrustedQuestEvent,
  enterDungeonInstance,
  applyDungeonBossDamage,
  createDungeonRoomTicket,
  consumeDungeonRoomTicket,
} from "./content-runtime.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = testDatabaseUrl ? describe : describe.skip;
let adminPool: Pool;
let pool: Pool;
let schemaName: string;

async function createCharacter(factionId = "sovereign_sect", level = 1) {
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
    `INSERT INTO characters (id, user_id, name, class_id, faction_id, active_map_id, level)
     VALUES ($1, $2, $3, 'vanguard', $4, 'white_jade_bastion', $5)`,
    [characterId, userId, `Hero ${characterId}`, factionId, level],
  );
  return { userId, characterId };
}

const completedOpeningQuestProgress = {
  "sovereign.ward-that-lied.obj1": 1,
  "sovereign.ward-that-lied.obj2": 1,
  "sovereign.ward-that-lied.obj3": 1,
  "sovereign.ward-that-lied.obj4": 1,
};

databaseSuite("authoritative quest and dungeon completion rewards", () => {
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    const database = await adminPool.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    expect(database.rows[0]?.current_database).toMatch(/_test$/);
    schemaName = `sf_content_rewards_${randomUUID().replaceAll("-", "")}`;
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

  it("settles a completed quest once and rejects incomplete objective state", async () => {
    const { userId, characterId } = await createCharacter();
    await pool.query(
      `INSERT INTO quest_progress (character_id, quest_id, content_version, status, objective_progress, completed_at)
       VALUES ($1, 'sovereign.ward-that-lied', 1, 'completed', $2::jsonb, now())`,
      [characterId, JSON.stringify(completedOpeningQuestProgress)],
    );
    const input = {
      userId,
      characterId,
      questId: "sovereign.ward-that-lied",
      random: () => 0,
    };
    const [first, replay] = await Promise.all([
      claimQuestCompletionRewards(pool, input),
      claimQuestCompletionRewards(pool, input),
    ]);
    expect([first.granted, replay.granted].sort()).toEqual([false, true]);
    const granted = first.granted ? first : replay;
    expect(granted).toMatchObject({
      granted: true,
      experienceAwarded: 550,
      silverAwarded: 12,
      totalExperience: 550,
      totalSilver: 12,
    });
    const claims = await pool.query(
      `SELECT id FROM character_reward_claims WHERE event_key = $1 AND character_id = $2`,
      [`quest:sovereign.ward-that-lied:v1`, characterId],
    );
    expect(claims.rowCount).toBe(1);
    const ledger = await pool.query(
      "SELECT id FROM currency_ledger WHERE idempotency_key = $1",
      [`reward:quest:sovereign.ward-that-lied:v1:${characterId}:silver`],
    );
    expect(ledger.rowCount).toBe(1);

    const invalid = await createCharacter();
    await pool.query(
      `INSERT INTO quest_progress (character_id, quest_id, content_version, status, objective_progress, completed_at)
       VALUES ($1, 'sovereign.ward-that-lied', 1, 'completed', '{}'::jsonb, now())`,
      [invalid.characterId],
    );
    await expect(
      claimQuestCompletionRewards(pool, { ...input, ...invalid }),
    ).rejects.toMatchObject({ code: "QUEST_OBJECTIVES_INCOMPLETE" });
  });

  it("rejects faction-locked quest claims from a different faction", async () => {
    const { userId, characterId } = await createCharacter("ashen_syndicate");
    await pool.query(
      `INSERT INTO quest_progress (character_id, quest_id, content_version, status, objective_progress, completed_at)
       VALUES ($1, 'sovereign.ward-that-lied', 1, 'completed', $2::jsonb, now())`,
      [characterId, JSON.stringify(completedOpeningQuestProgress)],
    );
    await expect(
      claimQuestCompletionRewards(pool, {
        userId,
        characterId,
        questId: "sovereign.ward-that-lied",
      }),
    ).rejects.toMatchObject({ code: "QUEST_FACTION_MISMATCH" });
  });

  it("settles a server-recorded dungeon completion atomically and makes event replay harmless", async () => {
    const { userId, characterId } = await createCharacter();
    const input = {
      eventKey: `test-run:${randomUUID()}`,
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      completedEncounterIds: ["encounter.census-warden"],
      random: () => 0,
    };
    const first = await grantDungeonCompletionRewards(pool, input);
    const replay = await grantDungeonCompletionRewards(pool, input);
    expect(first).toMatchObject({
      granted: true,
      experienceAwarded: 100,
      silverAwarded: 0,
      totalExperience: 100,
      loot: [
        {
          itemId: "material.ashen-jade-fragment",
          quantity: 1,
          tradeable: true,
        },
      ],
    });
    expect(replay).toMatchObject({
      granted: false,
      experienceAwarded: 0,
      silverAwarded: 0,
      loot: [],
    });
    const events = await pool.query(
      "SELECT id FROM dungeon_completion_events WHERE event_key = $1 AND character_id = $2",
      [input.eventKey, characterId],
    );
    const claims = await pool.query(
      "SELECT id FROM character_reward_claims WHERE event_key = $1 AND character_id = $2",
      [`dungeon:${input.eventKey}`, characterId],
    );
    const inventory = await pool.query(
      "SELECT id, quantity FROM item_instances WHERE owner_character_id = $1 AND definition_id = 'material.ashen-jade-fragment'",
      [characterId],
    );
    expect(events.rowCount).toBe(1);
    expect(claims.rowCount).toBe(1);
    expect(inventory.rowCount).toBe(1);
    expect(inventory.rows[0]?.quantity).toBe(1);
  });

  it("starts quests and advances only configured objectives from idempotent trusted events", async () => {
    const { userId, characterId } = await createCharacter("sovereign_sect", 5);
    const started = await startQuest(pool, {
      userId,
      characterId,
      questId: "sovereign.ward-that-lied",
    });
    expect(started.status).toBe("in_progress");
    const instance = await enterDungeonInstance(pool, {
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      runKey: `runtime:${randomUUID()}`,
    });
    const input = {
      eventKey: `enter:${instance.instanceId}`,
      userId,
      characterId,
      eventType: "dungeon_entered" as const,
      targetId: "dungeon.underterrace-archive",
    };
    const [first, replay] = await Promise.all([
      recordTrustedQuestEvent(pool, input),
      recordTrustedQuestEvent(pool, input),
    ]);
    expect([first.applied, replay.applied].sort()).toEqual([false, true]);
    const progress = await pool.query<{
      status: string;
      objective_progress: Record<string, number>;
    }>(
      "SELECT status,objective_progress FROM quest_progress WHERE character_id=$1 AND quest_id='sovereign.ward-that-lied' AND content_version=1",
      [characterId],
    );
    expect(progress.rows[0]?.status).toBe("in_progress");
    expect(
      progress.rows[0]?.objective_progress["sovereign.ward-that-lied.obj3"],
    ).toBe(1);
    const events = await pool.query(
      "SELECT id FROM quest_progress_events WHERE event_key=$1 AND character_id=$2",
      [input.eventKey, characterId],
    );
    expect(events.rowCount).toBe(1);
  });

  it("issues single-use dungeon room tickets bound to the authenticated character and run", async () => {
    const { userId, characterId } = await createCharacter("sovereign_sect", 5);
    const instance = await enterDungeonInstance(pool, {
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      runKey: `ticket-run:${randomUUID()}`,
    });
    const ticket = await createDungeonRoomTicket(pool, {
      userId,
      characterId,
      instanceId: instance.instanceId,
    });
    expect(ticket.joinTicket.length).toBeGreaterThanOrEqual(32);
    const consumed = await consumeDungeonRoomTicket(pool, ticket.joinTicket);
    expect(consumed).toMatchObject({
      userId,
      characterId,
      instanceId: instance.instanceId,
      dungeonId: "dungeon.underterrace-archive",
      classId: "vanguard",
    });
    await expect(
      consumeDungeonRoomTicket(pool, ticket.joinTicket),
    ).rejects.toMatchObject({
      code: "DUNGEON_TICKET_INVALID",
    });
    const stored = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM dungeon_room_tickets WHERE instance_id=$1",
      [instance.instanceId],
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]?.token_hash).not.toBe(ticket.joinTicket);
  });

  it("tracks authoritative dungeon boss defeat and persists one reward through replay", async () => {
    const { userId, characterId } = await createCharacter("sovereign_sect", 5);
    const instance = await enterDungeonInstance(pool, {
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      runKey: `boss-run:${randomUUID()}`,
    });
    const firstHit = await applyDungeonBossDamage(pool, {
      instanceId: instance.instanceId,
      eventKey: `boss-hit-1:${randomUUID()}`,
      userId,
      characterId,
      encounterId: "encounter.census-warden",
      damage: 500,
      random: () => 0,
    });
    expect(firstHit).toMatchObject({
      currentHealth: 350,
      defeated: false,
      completed: false,
    });
    const input = {
      instanceId: instance.instanceId,
      eventKey: `boss-hit-2:${randomUUID()}`,
      userId,
      characterId,
      encounterId: "encounter.census-warden",
      damage: 500,
      random: () => 0,
    };
    const first = await applyDungeonBossDamage(pool, input);
    const replay = await applyDungeonBossDamage(pool, input);
    expect(first).toMatchObject({
      currentHealth: 0,
      defeated: true,
      completed: true,
    });
    expect(first.reward?.granted).toBe(true);
    expect(replay).toMatchObject({
      currentHealth: 0,
      defeated: true,
      completed: true,
    });
    expect(replay.reward?.granted).toBe(false);
    const instanceRows = await pool.query(
      "SELECT id FROM dungeon_instances WHERE id=$1 AND status='completed'",
      [instance.instanceId],
    );
    const encounters = await pool.query(
      "SELECT id FROM dungeon_encounter_events WHERE instance_id=$1",
      [instance.instanceId],
    );
    const claims = await pool.query(
      "SELECT id FROM character_reward_claims WHERE event_key=$1 AND character_id=$2",
      [`dungeon:instance:${instance.instanceId}`, characterId],
    );
    expect(instanceRows.rowCount).toBe(1);
    expect(encounters.rowCount).toBe(1);
    const damageEvents = await pool.query(
      "SELECT id FROM dungeon_damage_events WHERE instance_id=$1",
      [instance.instanceId],
    );
    const encounterState = await pool.query<{
      current_health: number;
      status: string;
    }>(
      "SELECT current_health,status FROM dungeon_encounter_state WHERE instance_id=$1 AND encounter_id='encounter.census-warden'",
      [instance.instanceId],
    );
    expect(damageEvents.rowCount).toBe(2);
    expect(encounterState.rows[0]).toEqual({
      current_health: 0,
      status: "defeated",
    });
    expect(claims.rowCount).toBe(1);
  });

  it("rejects incomplete dungeon encounter sets without recording a completion", async () => {
    const { userId, characterId } = await createCharacter();
    const input = {
      eventKey: `incomplete-run:${randomUUID()}`,
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      completedEncounterIds: [],
    };
    await expect(
      grantDungeonCompletionRewards(pool, input),
    ).rejects.toBeInstanceOf(ContentRewardError);
    const events = await pool.query(
      "SELECT id FROM dungeon_completion_events WHERE event_key = $1",
      [input.eventKey],
    );
    expect(events.rowCount).toBe(0);
  });

  it("rejects attempts to reuse a dungeon event key for another dungeon", async () => {
    const { userId, characterId } = await createCharacter();
    const eventKey = `reused-run:${randomUUID()}`;
    await grantDungeonCompletionRewards(pool, {
      eventKey,
      userId,
      characterId,
      dungeonId: "dungeon.underterrace-archive",
      completedEncounterIds: ["encounter.census-warden"],
      random: () => 0,
    });
    await expect(
      grantDungeonCompletionRewards(pool, {
        eventKey,
        userId,
        characterId,
        dungeonId: "dungeon.cinder-vault",
        completedEncounterIds: ["encounter.furnace-saint"],
        random: () => 0,
      }),
    ).rejects.toMatchObject({ code: "DUNGEON_EVENT_KEY_REUSED" });
  });
});

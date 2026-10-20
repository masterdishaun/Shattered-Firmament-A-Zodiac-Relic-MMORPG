import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { createOpaqueToken, hashOpaqueToken } from "./security.js";
import {
  grantDungeonCompletionRewards,
  ContentRewardError,
  type ContentRewardGrantResult,
} from "./content-rewards.js";

type QuestObjective = {
  id: string;
  targetCount: number;
  optional: boolean;
  eventType?: TrustedQuestEventType;
  targetId?: string;
};
type QuestDefinition = {
  id: string;
  version: number;
  availability: "faction" | "shared";
  factionIds?: string[];
  levelMin: number;
  levelMax: number;
  prerequisiteQuestIds: string[];
  objectives: QuestObjective[];
};
type EncounterDefinition = { id: string; health: number };
type DungeonDefinition = {
  id: string;
  levelMin: number;
  levelMax: number;
  zoneId: string;
  encounterIds: string[];
  factionAccess: string;
  factionIds?: string[];
};
export type TrustedQuestEventType =
  | "enemy_defeated"
  | "dungeon_entered"
  | "item_acquired"
  | "npc_interaction"
  | "world_interaction";
export class QuestRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "QuestRuntimeError";
  }
}
export class DungeonRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DungeonRuntimeError";
  }
}
const fixtureDir = resolve(process.cwd(), "../shared/fixtures");
const read = <T>(name: string): T =>
  JSON.parse(
    readFileSync(resolve(fixtureDir, name), "utf8").replace(/^\uFEFF/, ""),
  ) as T;
const quests = read<QuestDefinition[]>("quest-catalog.json");
const dungeons = read<DungeonDefinition[]>("dungeons.json");
const encounters = read<EncounterDefinition[]>("encounters.json");
const encounterById = new Map(
  encounters.map((encounter) => [encounter.id, encounter]),
);
const questById = new Map(quests.map((q) => [q.id, q]));
const dungeonById = new Map(dungeons.map((d) => [d.id, d]));

export async function startQuest(
  pool: Pool,
  input: { userId: string; characterId: string; questId: string },
) {
  const quest = questById.get(input.questId);
  if (!quest) throw new QuestRuntimeError("QUEST_NOT_FOUND");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query<{
      faction_id: string;
      level: number;
      status: string;
    }>(
      "SELECT faction_id, level, status FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [input.characterId, input.userId],
    );
    const character = owned.rows[0];
    if (!character || character.status !== "active")
      throw new QuestRuntimeError("CHARACTER_NOT_FOUND");
    if (character.level < quest.levelMin || character.level > quest.levelMax)
      throw new QuestRuntimeError("QUEST_LEVEL_INVALID");
    if (
      quest.availability === "faction" &&
      !quest.factionIds?.includes(character.faction_id)
    )
      throw new QuestRuntimeError("QUEST_FACTION_MISMATCH");
    for (const prerequisite of quest.prerequisiteQuestIds) {
      const done = await client.query(
        "SELECT 1 FROM quest_progress WHERE character_id=$1 AND quest_id=$2 AND status='completed' LIMIT 1",
        [input.characterId, prerequisite],
      );
      if (!done.rowCount)
        throw new QuestRuntimeError("QUEST_PREREQUISITE_INCOMPLETE");
    }
    await client.query(
      `INSERT INTO quest_progress (character_id, quest_id, content_version, status, objective_progress, started_at)
      VALUES ($1,$2,$3,'in_progress','{}'::jsonb,now()) ON CONFLICT (character_id,quest_id,content_version) DO NOTHING`,
      [input.characterId, quest.id, quest.version],
    );
    const row = await client.query<{ status: string }>(
      "SELECT status FROM quest_progress WHERE character_id=$1 AND quest_id=$2 AND content_version=$3 FOR UPDATE",
      [input.characterId, quest.id, quest.version],
    );
    if (row.rows[0]?.status === "abandoned")
      await client.query(
        "UPDATE quest_progress SET status='in_progress', started_at=now(), updated_at=now() WHERE character_id=$1 AND quest_id=$2 AND content_version=$3",
        [input.characterId, quest.id, quest.version],
      );
    await client.query("COMMIT");
    return {
      questId: quest.id,
      status: row.rows[0]?.status === "completed" ? "completed" : "in_progress",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Only trusted simulation/service code may call this. There is deliberately no client-facing event-submission route. */
export async function recordTrustedQuestEvent(
  pool: Pool,
  input: {
    eventKey: string;
    userId: string;
    characterId: string;
    eventType: TrustedQuestEventType;
    targetId: string;
    amount?: number;
  },
) {
  if (
    !input.eventKey ||
    input.eventKey.length > 160 ||
    !input.targetId ||
    input.targetId.length > 160
  )
    throw new TypeError("Bounded event key and target are required");
  const amount = input.amount ?? 1;
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000)
    throw new TypeError("Event amount is invalid");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query(
      "SELECT 1 FROM characters WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
      [input.characterId, input.userId],
    );
    if (!owner.rowCount) throw new QuestRuntimeError("CHARACTER_NOT_FOUND");
    const inserted = await client.query(
      `INSERT INTO quest_progress_events (id,event_key,user_id,character_id,event_type,target_id,amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_key,character_id) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        input.eventKey,
        input.userId,
        input.characterId,
        input.eventType,
        input.targetId,
        amount,
      ],
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { applied: false, completedQuestIds: [] as string[] };
    }
    const completedQuestIds: string[] = [];
    const active = await client.query<{
      quest_id: string;
      content_version: number;
      objective_progress: Record<string, number> | string;
    }>(
      "SELECT quest_id,content_version,objective_progress FROM quest_progress WHERE character_id=$1 AND status='in_progress' FOR UPDATE",
      [input.characterId],
    );
    for (const progress of active.rows) {
      const quest = questById.get(progress.quest_id);
      if (!quest || quest.version !== progress.content_version) continue;
      const objectives = quest.objectives.filter(
        (o) => o.eventType === input.eventType && o.targetId === input.targetId,
      );
      if (!objectives.length) continue;
      const values =
        typeof progress.objective_progress === "string"
          ? (JSON.parse(progress.objective_progress) as Record<string, number>)
          : progress.objective_progress;
      for (const objective of objectives)
        values[objective.id] = Math.min(
          objective.targetCount,
          Math.max(0, Number(values[objective.id] ?? 0)) + amount,
        );
      const complete = quest.objectives
        .filter((o) => !o.optional)
        .every((o) => Number(values[o.id] ?? 0) >= o.targetCount);
      await client.query(
        "UPDATE quest_progress SET objective_progress=$4::jsonb,status=$5,completed_at=CASE WHEN $5='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE character_id=$1 AND quest_id=$2 AND content_version=$3",
        [
          input.characterId,
          quest.id,
          quest.version,
          JSON.stringify(values),
          complete ? "completed" : "in_progress",
        ],
      );
      if (complete) completedQuestIds.push(quest.id);
    }
    await client.query("COMMIT");
    return { applied: true, completedQuestIds };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function enterDungeonInstance(
  pool: Pool,
  input: {
    runKey: string;
    userId: string;
    characterId: string;
    dungeonId: string;
  },
) {
  if (!input.runKey || input.runKey.length > 160)
    throw new TypeError("A bounded run key is required");
  const dungeon = dungeonById.get(input.dungeonId);
  if (!dungeon) throw new DungeonRuntimeError("DUNGEON_NOT_FOUND");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      level: number;
      faction_id: string;
      status: string;
    }>(
      "SELECT id,level,faction_id,status FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [input.characterId, input.userId],
    );
    const character = result.rows[0];
    if (!character || character.status !== "active")
      throw new DungeonRuntimeError("CHARACTER_NOT_FOUND");
    if (
      character.level < dungeon.levelMin ||
      character.level > dungeon.levelMax
    )
      throw new DungeonRuntimeError("DUNGEON_LEVEL_INVALID");
    if (
      dungeon.factionAccess !== "all" &&
      dungeon.factionIds?.length &&
      !dungeon.factionIds.includes(character.faction_id)
    )
      throw new DungeonRuntimeError("DUNGEON_FACTION_MISMATCH");
    const prior = await client.query<{
      id: string;
      dungeon_id: string;
      status: string;
      user_id: string;
      character_id: string;
    }>(
      "SELECT id,dungeon_id,status,user_id,character_id FROM dungeon_instances WHERE run_key=$1 FOR UPDATE",
      [input.runKey],
    );
    if (prior.rows[0]) {
      if (
        prior.rows[0].dungeon_id !== dungeon.id ||
        prior.rows[0].user_id !== input.userId ||
        prior.rows[0].character_id !== input.characterId
      )
        throw new DungeonRuntimeError("DUNGEON_RUN_KEY_REUSED");
      await client.query("COMMIT");
      return {
        instanceId: prior.rows[0].id,
        dungeonId: dungeon.id,
        status: prior.rows[0].status,
        resumed: true,
      };
    }
    const instanceId = randomUUID();
    await client.query(
      "INSERT INTO dungeon_instances (id,run_key,user_id,character_id,dungeon_id,content_version,status) VALUES ($1,$2,$3,$4,$5,1,'active')",
      [instanceId, input.runKey, input.userId, input.characterId, dungeon.id],
    );
    for (const encounterId of dungeon.encounterIds) {
      const encounter = encounterById.get(encounterId);
      if (
        !encounter ||
        !Number.isInteger(encounter.health) ||
        encounter.health < 1
      )
        throw new DungeonRuntimeError("DUNGEON_ENCOUNTER_CONTENT_INVALID");
      await client.query(
        "INSERT INTO dungeon_encounter_state (instance_id,encounter_id,max_health,current_health,status) VALUES ($1,$2,$3,$3,'alive')",
        [instanceId, encounterId, encounter.health],
      );
    }
    await client.query("COMMIT");
    return {
      instanceId,
      dungeonId: dungeon.id,
      status: "active",
      resumed: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Internal combat-runtime entry point. Damage must be calculated by the server combat resolver;
 * this function persists health and deduplicates each attack before emitting a defeat event.
 * It is deliberately not exposed as an HTTP route.
 */
export async function applyDungeonBossDamage(
  pool: Pool,
  input: {
    instanceId: string;
    eventKey: string;
    userId: string;
    characterId: string;
    encounterId: string;
    damage: number;
    random?: () => number;
  },
): Promise<{
  currentHealth: number;
  defeated: boolean;
  completed: boolean;
  reward?: ContentRewardGrantResult;
}> {
  if (!input.eventKey || input.eventKey.length > 160)
    throw new TypeError("A bounded damage event key is required");
  if (
    !Number.isInteger(input.damage) ||
    input.damage < 1 ||
    input.damage > 1000
  )
    throw new TypeError("Server-calculated boss damage is invalid");
  const client = await pool.connect();
  let currentHealth = 0;
  let defeated = false;
  try {
    await client.query("BEGIN");
    const instanceResult = await client.query<{
      user_id: string;
      character_id: string;
      dungeon_id: string;
      status: string;
    }>(
      "SELECT user_id,character_id,dungeon_id,status FROM dungeon_instances WHERE id=$1 FOR UPDATE",
      [input.instanceId],
    );
    const instance = instanceResult.rows[0];
    if (
      !instance ||
      instance.user_id !== input.userId ||
      instance.character_id !== input.characterId
    )
      throw new DungeonRuntimeError("DUNGEON_INSTANCE_NOT_FOUND");
    const dungeon = dungeonById.get(instance.dungeon_id);
    if (!dungeon || !dungeon.encounterIds.includes(input.encounterId))
      throw new DungeonRuntimeError("DUNGEON_ENCOUNTER_INVALID");
    const stateResult = await client.query<{
      current_health: number;
      status: string;
    }>(
      "SELECT current_health,status FROM dungeon_encounter_state WHERE instance_id=$1 AND encounter_id=$2 FOR UPDATE",
      [input.instanceId, input.encounterId],
    );
    const state = stateResult.rows[0];
    if (!state)
      throw new DungeonRuntimeError("DUNGEON_ENCOUNTER_STATE_MISSING");
    const event = await client.query(
      "INSERT INTO dungeon_damage_events (id,instance_id,encounter_id,event_key,damage) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (instance_id,event_key) DO NOTHING RETURNING id",
      [
        randomUUID(),
        input.instanceId,
        input.encounterId,
        input.eventKey,
        input.damage,
      ],
    );
    currentHealth = Number(state.current_health);
    defeated = state.status === "defeated";
    if (event.rowCount && instance.status === "active" && !defeated) {
      currentHealth = Math.max(0, currentHealth - input.damage);
      defeated = currentHealth === 0;
      await client.query(
        "UPDATE dungeon_encounter_state SET current_health=$3,status=$4,updated_at=now() WHERE instance_id=$1 AND encounter_id=$2",
        [
          input.instanceId,
          input.encounterId,
          currentHealth,
          defeated ? "defeated" : "alive",
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (!defeated) return { currentHealth, defeated: false, completed: false };
  const completion = await recordAuthoritativeBossDefeat(pool, {
    instanceId: input.instanceId,
    eventKey: input.eventKey,
    userId: input.userId,
    characterId: input.characterId,
    encounterId: input.encounterId,
    ...(input.random ? { random: input.random } : {}),
  });
  return { currentHealth: 0, defeated: true, ...completion };
}

/** Called only after the authoritative encounter simulator confirms the boss health reached zero. */
async function recordAuthoritativeBossDefeat(
  pool: Pool,
  input: {
    instanceId: string;
    eventKey: string;
    userId: string;
    characterId: string;
    encounterId: string;
    random?: () => number;
  },
): Promise<{ completed: boolean; reward?: ContentRewardGrantResult }> {
  if (!input.eventKey || input.eventKey.length > 160)
    throw new TypeError("A bounded encounter event key is required");
  const client = await pool.connect();
  let shouldSettle = false;
  let dungeonId = "";
  let encounterIds: string[] = [];
  try {
    await client.query("BEGIN");
    const instanceResult = await client.query<{
      run_key: string;
      user_id: string;
      character_id: string;
      dungeon_id: string;
      status: string;
    }>(
      "SELECT run_key,user_id,character_id,dungeon_id,status FROM dungeon_instances WHERE id=$1 FOR UPDATE",
      [input.instanceId],
    );
    const instance = instanceResult.rows[0];
    if (
      !instance ||
      instance.user_id !== input.userId ||
      instance.character_id !== input.characterId
    )
      throw new DungeonRuntimeError("DUNGEON_INSTANCE_NOT_FOUND");
    if (instance.status === "abandoned") {
      await client.query("COMMIT");
      return { completed: false };
    }
    const dungeon = dungeonById.get(instance.dungeon_id);
    if (!dungeon || !dungeon.encounterIds.includes(input.encounterId))
      throw new DungeonRuntimeError("DUNGEON_ENCOUNTER_INVALID");
    if (instance.status === "active")
      await client.query(
        "INSERT INTO dungeon_encounter_events (id,instance_id,encounter_id,event_key) VALUES ($1,$2,$3,$4) ON CONFLICT (instance_id,encounter_id) DO NOTHING",
        [randomUUID(), input.instanceId, input.encounterId, input.eventKey],
      );
    const done = await client.query<{ encounter_id: string }>(
      "SELECT encounter_id FROM dungeon_encounter_events WHERE instance_id=$1 ORDER BY encounter_id",
      [input.instanceId],
    );
    encounterIds = done.rows.map((row) => row.encounter_id);
    shouldSettle = dungeon.encounterIds.every((id) =>
      encounterIds.includes(id),
    );
    dungeonId = dungeon.id;
    if (shouldSettle)
      await client.query(
        "UPDATE dungeon_instances SET status='completed',completed_at=COALESCE(completed_at,now()) WHERE id=$1 AND status='active'",
        [input.instanceId],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (!shouldSettle) return { completed: false };
  await recordTrustedQuestEvent(pool, {
    eventKey: `dungeon-boss:${input.instanceId}:${input.encounterId}`,
    userId: input.userId,
    characterId: input.characterId,
    eventType: "enemy_defeated",
    targetId: input.encounterId,
  });
  const reward = await grantDungeonCompletionRewards(pool, {
    eventKey: `instance:${input.instanceId}`,
    userId: input.userId,
    characterId: input.characterId,
    dungeonId,
    completedEncounterIds: encounterIds,
    ...(input.random ? { random: input.random } : {}),
  });
  return { completed: true, reward };
}

export async function createDungeonRoomTicket(
  pool: Pool,
  input: { userId: string; characterId: string; instanceId: string },
): Promise<{ joinTicket: string; expiresAt: string }> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 60_000);
  const result = await pool.query(
    `INSERT INTO dungeon_room_tickets (id,token_hash,instance_id,user_id,character_id,expires_at)
     SELECT $1,$2,di.id,di.user_id,di.character_id,$6
     FROM dungeon_instances di
     WHERE di.id=$3 AND di.user_id=$4 AND di.character_id=$5 AND di.status='active'
     RETURNING id`,
    [
      randomUUID(),
      hashOpaqueToken(token),
      input.instanceId,
      input.userId,
      input.characterId,
      expiresAt,
    ],
  );
  if (!result.rowCount)
    throw new DungeonRuntimeError("DUNGEON_INSTANCE_NOT_ACTIVE");
  return { joinTicket: token, expiresAt: expiresAt.toISOString() };
}

export async function consumeDungeonRoomTicket(pool: Pool, rawTicket: string) {
  if (
    typeof rawTicket !== "string" ||
    rawTicket.length < 32 ||
    rawTicket.length > 200
  )
    throw new DungeonRuntimeError("DUNGEON_TICKET_INVALID");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      ticket_id: string;
      user_id: string;
      character_id: string;
      instance_id: string;
      dungeon_id: string;
      instance_status: string;
      class_id: "vanguard" | "mystic" | "support";
    }>(
      `SELECT t.id AS ticket_id,t.user_id,t.character_id,t.instance_id,di.dungeon_id,
              di.status AS instance_status,c.class_id
       FROM dungeon_room_tickets t
       JOIN dungeon_instances di ON di.id=t.instance_id AND di.user_id=t.user_id AND di.character_id=t.character_id
       JOIN characters c ON c.id=t.character_id AND c.user_id=t.user_id
       WHERE t.token_hash=$1 AND t.consumed_at IS NULL AND t.expires_at>now()
       FOR UPDATE OF t`,
      [hashOpaqueToken(rawTicket)],
    );
    const ticket = result.rows[0];
    if (!ticket || ticket.instance_status !== "active")
      throw new DungeonRuntimeError("DUNGEON_TICKET_INVALID");
    await client.query(
      "UPDATE dungeon_room_tickets SET consumed_at=now() WHERE id=$1",
      [ticket.ticket_id],
    );
    await client.query("COMMIT");
    return {
      userId: ticket.user_id,
      characterId: ticket.character_id,
      instanceId: ticket.instance_id,
      dungeonId: ticket.dungeon_id,
      classId: ticket.class_id,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import { levelForTotalExperience, LEVEL_CAP } from "./progression.js";

type RewardSource = "quest" | "dungeon";
type RewardEntry = {
  id: string;
  rewardType: "item" | "currency" | "experience" | "cosmetic" | "material";
  itemId?: string;
  currencyCode?: string;
  quantityMin: number;
  quantityMax: number;
  chance: number;
  tradeable: boolean;
};
type RewardTable = {
  id: string;
  version: number;
  rollPolicy: string;
  entries: RewardEntry[];
};
type QuestDefinition = {
  id: string;
  version: number;
  availability: "faction" | "shared";
  factionIds?: string[];
  prerequisiteQuestIds: string[];
  objectives: { id: string; targetCount: number; optional: boolean }[];
  rewardTableId: string;
};
type DungeonDefinition = {
  id: string;
  levelMin: number;
  levelMax: number;
  zoneId: string;
  encounterIds: string[];
  rewardTableId: string;
  factionAccess: string;
  factionIds?: string[];
};
type RolledRewards = {
  experienceAwarded: number;
  silverAwarded: number;
  loot: { itemId: string; quantity: number; tradeable: boolean }[];
};

export type ContentRewardErrorCode =
  | "CHARACTER_NOT_FOUND"
  | "QUEST_NOT_FOUND"
  | "QUEST_NOT_COMPLETED"
  | "QUEST_OBJECTIVES_INCOMPLETE"
  | "QUEST_PREREQUISITE_INCOMPLETE"
  | "QUEST_FACTION_MISMATCH"
  | "DUNGEON_NOT_FOUND"
  | "DUNGEON_LEVEL_INVALID"
  | "DUNGEON_FACTION_MISMATCH"
  | "DUNGEON_ENCOUNTERS_INCOMPLETE"
  | "DUNGEON_EVENT_KEY_REUSED"
  | "REWARD_TABLE_NOT_FOUND";

export class ContentRewardError extends Error {
  constructor(
    readonly code: ContentRewardErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "ContentRewardError";
  }
}

const fixtureDirectory = resolve(process.cwd(), "../shared/fixtures");
const readFixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(resolve(fixtureDirectory, name), "utf8").replace(
      /^\uFEFF/,
      "",
    ),
  ) as T;
const quests = readFixture<QuestDefinition[]>("quest-catalog.json");
const dungeons = readFixture<DungeonDefinition[]>("dungeons.json");
const rewardTables = readFixture<RewardTable[]>("reward-tables.json");
const questById = new Map(quests.map((quest) => [quest.id, quest]));
const dungeonById = new Map(dungeons.map((dungeon) => [dungeon.id, dungeon]));
const rewardTableById = new Map(rewardTables.map((table) => [table.id, table]));

export interface ContentRewardGrantResult extends RolledRewards {
  granted: boolean;
  level: number;
  totalExperience: number;
  totalSilver: number;
}

export interface DungeonCompletionRewardInput {
  eventKey: string;
  userId: string;
  characterId: string;
  dungeonId: string;
  completedEncounterIds: string[];
  random?: () => number;
}

function rollRewards(table: RewardTable, random: () => number): RolledRewards {
  let experienceAwarded = 0;
  let silverAwarded = 0;
  const loot: RolledRewards["loot"] = [];
  for (const entry of table.entries) {
    const chance = random();
    if (!Number.isFinite(chance) || chance < 0 || chance >= 1)
      throw new RangeError("Random source must return a number in [0, 1).");
    if (chance >= entry.chance) continue;
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
      throw new RangeError("Random source must return a number in [0, 1).");
    const quantity =
      entry.quantityMin +
      Math.floor(roll * (entry.quantityMax - entry.quantityMin + 1));
    if (entry.rewardType === "experience") experienceAwarded += quantity;
    else if (entry.rewardType === "currency") {
      if (entry.currencyCode !== "SILVER")
        throw new Error(
          `UNSUPPORTED_REWARD_CURRENCY:${entry.currencyCode ?? "missing"}`,
        );
      silverAwarded += quantity;
    } else if (["item", "material", "cosmetic"].includes(entry.rewardType)) {
      if (!entry.itemId) throw new Error(`REWARD_ITEM_ID_MISSING:${entry.id}`);
      loot.push({ itemId: entry.itemId, quantity, tradeable: entry.tradeable });
    }
  }
  return { experienceAwarded, silverAwarded, loot };
}

async function readCurrentState(
  client: PoolClient,
  characterId: string,
  userId: string,
) {
  const result = await client.query<{
    level: number;
    experience: string | number;
    silver: string | number;
  }>(
    `SELECT c.level, c.experience, COALESCE(w.balance, 0) AS silver
     FROM characters c LEFT JOIN currency_wallets w ON w.user_id = c.user_id AND w.currency_code = 'silver'
     WHERE c.id = $1 AND c.user_id = $2`,
    [characterId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new ContentRewardError("CHARACTER_NOT_FOUND");
  return {
    level: Number(row.level),
    totalExperience: Number(row.experience),
    totalSilver: Number(row.silver),
  };
}

async function settleRewards(
  client: PoolClient,
  input: {
    userId: string;
    characterId: string;
    eventKey: string;
    sourceType: RewardSource;
    sourceId: string;
  },
  rolled: RolledRewards,
): Promise<ContentRewardGrantResult> {
  const state = await readCurrentState(client, input.characterId, input.userId);
  const experienceAwarded =
    state.level >= LEVEL_CAP ? 0 : rolled.experienceAwarded;
  const claim = await client.query(
    `INSERT INTO character_reward_claims
      (id, event_key, character_id, user_id, source_type, source_id, experience_awarded, silver_awarded, loot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (event_key, character_id) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      input.eventKey,
      input.characterId,
      input.userId,
      input.sourceType,
      input.sourceId,
      experienceAwarded,
      rolled.silverAwarded,
      JSON.stringify(rolled.loot),
    ],
  );
  if (claim.rowCount === 0)
    return {
      granted: false,
      experienceAwarded: 0,
      silverAwarded: 0,
      loot: [],
      ...state,
    };

  for (const item of rolled.loot) {
    const result = await client.query<{
      content_version: number;
      tradeable: boolean;
      bind_policy: string;
    }>(
      `SELECT content_version, tradeable, bind_policy FROM item_definitions WHERE id = $1 ORDER BY content_version DESC LIMIT 1`,
      [item.itemId],
    );
    const definition = result.rows[0];
    if (!definition)
      throw new Error(`REWARD_ITEM_DEFINITION_MISSING:${item.itemId}`);
    if (definition.tradeable !== item.tradeable)
      throw new Error(`REWARD_ITEM_TRADEABILITY_MISMATCH:${item.itemId}`);
    const bindsOnPickup = [
      "bind_on_pickup",
      "account_bound",
      "character_bound",
    ].includes(definition.bind_policy);
    if (
      (definition.tradeable && bindsOnPickup) ||
      (!definition.tradeable && definition.bind_policy === "unbound")
    )
      throw new Error(`REWARD_ITEM_BIND_POLICY_MISMATCH:${item.itemId}`);
    await client.query(
      `INSERT INTO item_instances (id, definition_id, definition_version, owner_character_id, quantity, bound_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        item.itemId,
        definition.content_version,
        input.characterId,
        item.quantity,
        bindsOnPickup ? input.userId : null,
      ],
    );
  }

  const nextExperience = state.totalExperience + experienceAwarded;
  if (!Number.isSafeInteger(nextExperience))
    throw new Error("EXPERIENCE_OVERFLOW");
  const nextLevel = levelForTotalExperience(nextExperience);
  await client.query(
    "UPDATE characters SET experience = $2, level = $3, updated_at = now() WHERE id = $1",
    [input.characterId, nextExperience, nextLevel],
  );
  if (rolled.silverAwarded > 0) {
    await client.query(
      `INSERT INTO currency_wallets (user_id, currency_code, balance) VALUES ($1, 'silver', $2)
       ON CONFLICT (user_id, currency_code) DO UPDATE SET balance = currency_wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [input.userId, rolled.silverAwarded],
    );
    await client.query(
      `INSERT INTO currency_ledger (transaction_id, idempotency_key, user_id, character_id, currency_code, delta, reason, metadata)
       VALUES ($1, $2, $3, $4, 'silver', $5, $6, $7::jsonb)`,
      [
        randomUUID(),
        `reward:${input.eventKey}:${input.characterId}:silver`,
        input.userId,
        input.characterId,
        rolled.silverAwarded,
        input.sourceType,
        JSON.stringify({ sourceId: input.sourceId, eventKey: input.eventKey }),
      ],
    );
  }
  const finalState = await readCurrentState(
    client,
    input.characterId,
    input.userId,
  );
  return {
    granted: true,
    experienceAwarded,
    silverAwarded: rolled.silverAwarded,
    loot: rolled.loot,
    ...finalState,
  };
}

export async function claimQuestCompletionRewards(
  pool: Pool,
  input: {
    userId: string;
    characterId: string;
    questId: string;
    random?: () => number;
  },
): Promise<ContentRewardGrantResult> {
  const quest = questById.get(input.questId);
  if (!quest) throw new ContentRewardError("QUEST_NOT_FOUND");
  const table = rewardTableById.get(quest.rewardTableId);
  if (!table)
    throw new ContentRewardError("REWARD_TABLE_NOT_FOUND", quest.rewardTableId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const characterResult = await client.query<{ faction_id: string }>(
      "SELECT faction_id FROM characters WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE",
      [input.characterId, input.userId],
    );
    const character = characterResult.rows[0];
    if (!character) throw new ContentRewardError("CHARACTER_NOT_FOUND");
    if (
      quest.availability === "faction" &&
      !quest.factionIds?.includes(character.faction_id)
    )
      throw new ContentRewardError("QUEST_FACTION_MISMATCH");
    for (const prerequisiteId of quest.prerequisiteQuestIds) {
      const prerequisite = await client.query(
        "SELECT 1 FROM quest_progress WHERE character_id = $1 AND quest_id = $2 AND status = 'completed' LIMIT 1",
        [input.characterId, prerequisiteId],
      );
      if (!prerequisite.rowCount)
        throw new ContentRewardError("QUEST_PREREQUISITE_INCOMPLETE");
    }
    const progressResult = await client.query<{
      content_version: number;
      objective_progress: Record<string, unknown> | string;
      status: string;
    }>(
      `SELECT content_version, objective_progress, status FROM quest_progress
       WHERE character_id = $1 AND quest_id = $2 AND content_version = $3 FOR UPDATE`,
      [input.characterId, quest.id, quest.version],
    );
    const progress = progressResult.rows[0];
    if (!progress || progress.status !== "completed")
      throw new ContentRewardError("QUEST_NOT_COMPLETED");
    const objectiveProgress =
      typeof progress.objective_progress === "string"
        ? (JSON.parse(progress.objective_progress) as Record<string, unknown>)
        : progress.objective_progress;
    for (const objective of quest.objectives) {
      if (objective.optional) continue;
      const count = Number(objectiveProgress?.[objective.id] ?? 0);
      if (!Number.isFinite(count) || count < objective.targetCount)
        throw new ContentRewardError("QUEST_OBJECTIVES_INCOMPLETE");
    }
    const result = await settleRewards(
      client,
      {
        userId: input.userId,
        characterId: input.characterId,
        eventKey: `quest:${quest.id}:v${quest.version}`,
        sourceType: "quest",
        sourceId: quest.id,
      },
      rollRewards(table, input.random ?? Math.random),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantDungeonCompletionRewards(
  pool: Pool,
  input: DungeonCompletionRewardInput,
): Promise<ContentRewardGrantResult> {
  if (!input.eventKey || input.eventKey.length > 160)
    throw new TypeError("A bounded dungeon completion event key is required.");
  const dungeon = dungeonById.get(input.dungeonId);
  if (!dungeon) throw new ContentRewardError("DUNGEON_NOT_FOUND");
  const table = rewardTableById.get(dungeon.rewardTableId);
  if (!table)
    throw new ContentRewardError(
      "REWARD_TABLE_NOT_FOUND",
      dungeon.rewardTableId,
    );
  if (
    input.completedEncounterIds.length > 100 ||
    !dungeon.encounterIds.every((id) =>
      input.completedEncounterIds.includes(id),
    ) ||
    input.completedEncounterIds.some((id) => !dungeon.encounterIds.includes(id))
  )
    throw new ContentRewardError("DUNGEON_ENCOUNTERS_INCOMPLETE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const characterResult = await client.query<{
      faction_id: string;
      level: number;
    }>(
      "SELECT faction_id, level FROM characters WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE",
      [input.characterId, input.userId],
    );
    const character = characterResult.rows[0];
    if (!character) throw new ContentRewardError("CHARACTER_NOT_FOUND");
    const priorEvent = await client.query<{
      user_id: string;
      dungeon_id: string;
      content_version: number;
    }>(
      "SELECT user_id, dungeon_id, content_version FROM dungeon_completion_events WHERE event_key = $1 AND character_id = $2",
      [input.eventKey, input.characterId],
    );
    if (priorEvent.rows[0]) {
      const prior = priorEvent.rows[0];
      if (
        prior.user_id !== input.userId ||
        prior.dungeon_id !== dungeon.id ||
        prior.content_version !== table.version
      )
        throw new ContentRewardError("DUNGEON_EVENT_KEY_REUSED");
      const state = await readCurrentState(
        client,
        input.characterId,
        input.userId,
      );
      await client.query("COMMIT");
      return {
        granted: false,
        experienceAwarded: 0,
        silverAwarded: 0,
        loot: [],
        ...state,
      };
    }
    if (
      character.level < dungeon.levelMin ||
      character.level > dungeon.levelMax
    )
      throw new ContentRewardError("DUNGEON_LEVEL_INVALID");
    if (
      dungeon.factionAccess !== "all" &&
      dungeon.factionIds?.length &&
      !dungeon.factionIds.includes(character.faction_id)
    )
      throw new ContentRewardError("DUNGEON_FACTION_MISMATCH");
    const event = await client.query(
      `INSERT INTO dungeon_completion_events (id, event_key, user_id, character_id, dungeon_id, content_version, completed_encounter_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT (event_key, character_id) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        input.eventKey,
        input.userId,
        input.characterId,
        dungeon.id,
        table.version,
        JSON.stringify([...new Set(input.completedEncounterIds)]),
      ],
    );
    if (event.rowCount === 0) {
      const existing = await client.query<{
        user_id: string;
        dungeon_id: string;
        content_version: number;
      }>(
        "SELECT user_id, dungeon_id, content_version FROM dungeon_completion_events WHERE event_key = $1 AND character_id = $2",
        [input.eventKey, input.characterId],
      );
      const row = existing.rows[0];
      if (
        !row ||
        row.user_id !== input.userId ||
        row.dungeon_id !== dungeon.id ||
        row.content_version !== table.version
      )
        throw new ContentRewardError("DUNGEON_EVENT_KEY_REUSED");
      const state = await readCurrentState(
        client,
        input.characterId,
        input.userId,
      );
      await client.query("COMMIT");
      return {
        granted: false,
        experienceAwarded: 0,
        silverAwarded: 0,
        loot: [],
        ...state,
      };
    }
    const result = await settleRewards(
      client,
      {
        userId: input.userId,
        characterId: input.characterId,
        eventKey: `dungeon:${input.eventKey}`,
        sourceType: "dungeon",
        sourceId: dungeon.id,
      },
      rollRewards(table, input.random ?? Math.random),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

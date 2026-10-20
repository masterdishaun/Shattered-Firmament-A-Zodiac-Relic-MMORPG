import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const LEVEL_CAP = 100;
export const XP_BASE = 4_000;
export const XP_PER_LEVEL = 60;
export const LOOT_PITY_MISS_LIMIT = 9;
export const PITY_PROTECTED_ITEM_ID = "material.ashen-jade-fragment";

export type EnemyRewardArchetype =
  "rift-stalker" | "ashen-wisp" | "jadebound-sentinel";

export interface RolledEnemyRewards {
  experience: number;
  silver: number;
  loot: { itemId: string; quantity: number; tradeable: boolean }[];
}

export interface EnemyRewardGrantInput {
  eventKey: string;
  userId: string;
  characterId: string;
  archetype: EnemyRewardArchetype;
  enemyLevel: number;
  random?: () => number;
}

export interface EnemyRewardGrantResult extends RolledEnemyRewards {
  granted: boolean;
  level: number;
  totalExperience: number;
  totalSilver: number;
}

export function xpMultiplierForLevelDifference(
  characterLevel: number,
  enemyLevel: number,
): number {
  if (
    !Number.isInteger(characterLevel) ||
    characterLevel < 1 ||
    characterLevel > LEVEL_CAP ||
    !Number.isInteger(enemyLevel) ||
    enemyLevel < 1 ||
    enemyLevel > LEVEL_CAP
  )
    throw new RangeError(
      "Character and enemy levels must be integers within the level cap.",
    );
  const difference = characterLevel - enemyLevel;
  if (difference <= 4) return 1;
  if (difference <= 9) return 0.5;
  if (difference <= 19) return 0.25;
  return 0.1;
}

const ENEMY_REWARD_RANGES: Record<
  EnemyRewardArchetype,
  { xp: [number, number]; silver: [number, number]; materialChance: number }
> = {
  "rift-stalker": { xp: [60, 90], silver: [3, 6], materialChance: 0.08 },
  "ashen-wisp": { xp: [70, 100], silver: [3, 7], materialChance: 0.1 },
  "jadebound-sentinel": { xp: [90, 120], silver: [5, 9], materialChance: 0.12 },
};

export function xpRequiredForNextLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level >= LEVEL_CAP) return 0;
  return XP_BASE + XP_PER_LEVEL * level;
}

export function levelForTotalExperience(totalExperience: number): number {
  if (!Number.isSafeInteger(totalExperience) || totalExperience < 0)
    throw new RangeError(
      "Total experience must be a non-negative safe integer.",
    );
  let remaining = totalExperience;
  let level = 1;
  while (level < LEVEL_CAP) {
    const required = xpRequiredForNextLevel(level);
    if (remaining < required) break;
    remaining -= required;
    level += 1;
  }
  return level;
}

function rollInteger(range: [number, number], random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError("Random source must return a number in [0, 1).");
  return range[0] + Math.floor(value * (range[1] - range[0] + 1));
}

export function rollEnemyRewards(
  archetype: EnemyRewardArchetype,
  random: () => number = Math.random,
): RolledEnemyRewards {
  const profile = ENEMY_REWARD_RANGES[archetype];
  const experience = rollInteger(profile.xp, random);
  const silver = rollInteger(profile.silver, random);
  const loot =
    random() < profile.materialChance
      ? [
          {
            itemId: "material.ashen-jade-fragment",
            quantity: 1,
            tradeable: true,
          },
        ]
      : [];
  return { experience, silver, loot };
}

export async function grantEnemyDefeatRewards(
  pool: Pool,
  input: EnemyRewardGrantInput,
): Promise<EnemyRewardGrantResult> {
  if (!input.eventKey || input.eventKey.length > 200)
    throw new TypeError("A bounded, stable reward event key is required.");
  const rolledRewards = rollEnemyRewards(input.archetype, input.random);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const characterResult = await client.query<{
      user_id: string;
      experience: string | number;
      level: number;
    }>(
      `SELECT user_id, experience, level FROM characters
       WHERE id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE`,
      [input.characterId, input.userId],
    );
    const character = characterResult.rows[0];
    if (!character) throw new Error("REWARD_CHARACTER_NOT_FOUND");
    if (
      !Number.isInteger(input.enemyLevel) ||
      input.enemyLevel < 1 ||
      input.enemyLevel > LEVEL_CAP
    )
      throw new RangeError(
        "Enemy level must be an integer within the level cap.",
      );
    const xpMultiplier =
      Number(character.level) >= LEVEL_CAP
        ? 0
        : xpMultiplierForLevelDifference(
            Number(character.level),
            input.enemyLevel,
          );
    const pityResult = await client.query<{ consecutive_misses: number }>(
      `SELECT consecutive_misses FROM character_loot_pity
       WHERE character_id = $1 AND item_id = $2 FOR UPDATE`,
      [input.characterId, PITY_PROTECTED_ITEM_ID],
    );
    const previousMisses = Number(pityResult.rows[0]?.consecutive_misses ?? 0);
    const rolledLoot = rolledRewards.loot;
    const pityLoot =
      rolledLoot.length === 0 && previousMisses >= LOOT_PITY_MISS_LIMIT
        ? [{ itemId: PITY_PROTECTED_ITEM_ID, quantity: 1, tradeable: true }]
        : rolledLoot;
    const rewards: RolledEnemyRewards = {
      ...rolledRewards,
      experience: Math.floor(rolledRewards.experience * xpMultiplier),
      loot: pityLoot,
    };

    const claim = await client.query(
      `INSERT INTO character_reward_claims
        (id, event_key, character_id, user_id, source_type, source_id,
         experience_awarded, silver_awarded, loot)
       VALUES ($1, $2, $3, $4, 'enemy_defeat', $5, $6, $7, $8::jsonb)
       ON CONFLICT (event_key, character_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        input.eventKey,
        input.characterId,
        input.userId,
        input.archetype,
        rewards.experience,
        rewards.silver,
        JSON.stringify(rewards.loot),
      ],
    );

    if (claim.rowCount === 0) {
      const totalSilver = await readSilverBalance(client, input.userId);
      await client.query("COMMIT");
      return {
        granted: false,
        experience: 0,
        silver: 0,
        loot: [],
        level: Number(character.level),
        totalExperience: Number(character.experience),
        totalSilver,
      };
    }

    // Pity changes only after a new claim has been inserted, and in the same
    // transaction. Duplicate claims return above without changing this counter.
    await client.query(
      `INSERT INTO character_loot_pity
        (character_id, item_id, consecutive_misses, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (character_id) DO UPDATE
       SET consecutive_misses = EXCLUDED.consecutive_misses, updated_at = now()`,
      [
        input.characterId,
        PITY_PROTECTED_ITEM_ID,
        rewards.loot.some((item) => item.itemId === PITY_PROTECTED_ITEM_ID)
          ? 0
          : Math.min(LOOT_PITY_MISS_LIMIT, previousMisses + 1),
      ],
    );

    // Materialize the recorded loot inside the same transaction as the claim.
    // Item definition policy is authoritative; reward payloads cannot override it.
    for (const item of rewards.loot) {
      const definitionResult = await client.query<{
        content_version: number;
        tradeable: boolean;
        bind_policy: string;
      }>(
        `SELECT content_version, tradeable, bind_policy
         FROM item_definitions WHERE id = $1
         ORDER BY content_version DESC LIMIT 1`,
        [item.itemId],
      );
      const definition = definitionResult.rows[0];
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
        `INSERT INTO item_instances
          (id, definition_id, definition_version, owner_character_id, quantity, bound_to_user_id)
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

    const nextExperience = Number(character.experience) + rewards.experience;
    if (!Number.isSafeInteger(nextExperience))
      throw new Error("EXPERIENCE_OVERFLOW");
    const nextLevel = levelForTotalExperience(nextExperience);
    await client.query(
      `UPDATE characters SET experience = $2, level = $3, updated_at = now()
       WHERE id = $1`,
      [input.characterId, nextExperience, nextLevel],
    );
    await client.query(
      `INSERT INTO currency_wallets (user_id, currency_code, balance)
       VALUES ($1, 'silver', $2)
       ON CONFLICT (user_id, currency_code) DO UPDATE
       SET balance = currency_wallets.balance + EXCLUDED.balance, updated_at = now()`,
      [input.userId, rewards.silver],
    );
    await client.query(
      `INSERT INTO currency_ledger
        (transaction_id, idempotency_key, user_id, character_id,
         currency_code, delta, reason, metadata)
       VALUES ($1, $2, $3, $4, 'silver', $5, 'enemy_defeat', $6::jsonb)`,
      [
        randomUUID(),
        `reward:${input.eventKey}:${input.characterId}:silver`,
        input.userId,
        input.characterId,
        rewards.silver,
        JSON.stringify({ sourceId: input.archetype, eventKey: input.eventKey }),
      ],
    );
    const totalSilver = await readSilverBalance(client, input.userId);
    await client.query("COMMIT");
    return {
      ...rewards,
      granted: true,
      level: nextLevel,
      totalExperience: nextExperience,
      totalSilver,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readSilverBalance(
  client: PoolClient,
  userId: string,
): Promise<number> {
  const result = await client.query<{ balance: string | number }>(
    "SELECT balance FROM currency_wallets WHERE user_id = $1 AND currency_code = 'silver'",
    [userId],
  );
  return Number(result.rows[0]?.balance ?? 0);
}

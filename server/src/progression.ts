import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const LEVEL_CAP = 100;
export const XP_BASE = 4_000;
export const XP_PER_LEVEL = 60;

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
  random?: () => number;
}

export interface EnemyRewardGrantResult extends RolledEnemyRewards {
  granted: boolean;
  level: number;
  totalExperience: number;
  totalSilver: number;
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
  const rewards = rollEnemyRewards(input.archetype, input.random);
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

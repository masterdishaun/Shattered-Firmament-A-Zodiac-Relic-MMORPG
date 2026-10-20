import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  grantEnemyDefeatRewards,
  type EnemyRewardArchetype,
} from "./progression.js";

export interface EnemyRewardOutboxInput {
  eventKey: string;
  userId: string;
  characterId: string;
  archetype: EnemyRewardArchetype;
  enemyLevel: number;
}

export async function enqueueEnemyReward(
  pool: Pool,
  input: EnemyRewardOutboxInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO enemy_reward_outbox (id, event_key, user_id, character_id, archetype, enemy_level)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_key, character_id) DO NOTHING`,
    [
      randomUUID(),
      input.eventKey,
      input.userId,
      input.characterId,
      input.archetype,
      input.enemyLevel,
    ],
  );
}

export async function processEnemyRewardOutbox(
  pool: Pool,
  batchSize = 20,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new RangeError("Outbox batch size must be between 1 and 100.");
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query("BEGIN");
    const claimed = await client.query<
      EnemyRewardOutboxInput & { id: string; attempts: number }
    >(
      `SELECT id, event_key AS "eventKey", user_id AS "userId", character_id AS "characterId", archetype, enemy_level AS "enemyLevel", attempts
       FROM enemy_reward_outbox
       WHERE (status = 'pending' AND available_at <= now())
          OR (status = 'processing' AND lease_until < now())
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED LIMIT $1`,
      [batchSize],
    );
    for (const row of claimed.rows) {
      await client.query(
        `UPDATE enemy_reward_outbox SET status = 'processing', attempts = attempts + 1,
         lease_until = now() + interval '60 seconds' WHERE id = $1`,
        [row.id],
      );
    }
    await client.query("COMMIT");
    for (const row of claimed.rows) {
      try {
        await grantEnemyDefeatRewards(pool, row);
        await pool.query(
          `UPDATE enemy_reward_outbox SET status = 'completed', completed_at = now(), lease_until = NULL, last_error = NULL WHERE id = $1`,
          [row.id],
        );
        processed += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown reward processing error";
        await pool
          .query(
            `UPDATE enemy_reward_outbox SET status = 'pending', available_at = now() + LEAST(interval '5 minutes', interval '2 seconds' * power(2, LEAST(attempts, 7))), lease_until = NULL, last_error = $2 WHERE id = $1`,
            [row.id, message],
          )
          .catch(() => undefined);
      }
    }
    return processed;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

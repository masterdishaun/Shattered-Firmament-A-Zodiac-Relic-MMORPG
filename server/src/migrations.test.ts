import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = testDatabaseUrl ? describe : describe.skip;
let pool: Pool;

async function createUser() {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)",
    [
      id,
      `${id}@example.test`,
      `player_${id.replaceAll("-", "").slice(0, 20)}`,
      "test-hash",
    ],
  );
  return id;
}

async function createCharacter(userId: string, factionId = "sovereign_sect") {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO characters
      (id, user_id, name, class_id, faction_id, active_map_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, `Hero ${id}`, "vanguard", factionId, "white_jade_bastion"],
  );
  return id;
}

databaseSuite("PostgreSQL migrations and persistence constraints", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    const database = await pool.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    expect(database.rows[0]?.current_database).toMatch(/_test$/);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("applies the initial schema and is idempotent", async () => {
    const first = await runMigrations(pool);
    expect(first.applied).toContain("0001_initial.sql");
    expect(first.applied).toContain("0002_character_mana.sql");
    expect(first.applied).toContain("0003_progression_rewards.sql");
    expect(first.applied).toContain("0004_pve_reward_item_definitions.sql");
    expect(first.applied).toContain("0005_character_loot_pity.sql");
    expect(first.applied).toContain("0006_enemy_reward_outbox.sql");
    expect(first.applied).toContain("0007_dungeon_completion_events.sql");

    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tableNames = new Set(tables.rows.map((row) => row.table_name));
    for (const table of [
      "users",
      "auth_sessions",
      "characters",
      "join_tickets",
      "item_definitions",
      "item_instances",
      "pets",
      "active_pets",
      "account_professions",
      "quest_progress",
      "currency_wallets",
      "currency_ledger",
      "item_transactions",
      "active_character_leases",
      "schema_migrations",
      "character_reward_claims",
      "character_loot_pity",
      "enemy_reward_outbox",
      "dungeon_completion_events",
    ]) {
      expect(tableNames.has(table), `missing migrated table: ${table}`).toBe(
        true,
      );
    }

    const rewardDefinition = await pool.query<{
      tradeable: boolean;
      bind_policy: string;
    }>(
      `SELECT tradeable, bind_policy FROM item_definitions
       WHERE id = 'material.ashen-jade-fragment' AND content_version = 1`,
    );
    expect(rewardDefinition.rows[0]).toEqual({
      tradeable: true,
      bind_policy: "unbound",
    });

    const leaseColumns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'active_character_leases'",
    );
    expect(leaseColumns.rows.map((row) => row.column_name)).toContain(
      "disconnected_at",
    );

    const characterColumns = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'characters'",
    );
    expect(characterColumns.rows.map((row) => row.column_name)).toContain(
      "mana",
    );
    expect(characterColumns.rows.map((row) => row.column_name)).toContain(
      "max_mana",
    );

    const second = await runMigrations(pool);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain("0001_initial.sql");
    expect(second.skipped).toContain("0002_character_mana.sql");
    expect(second.skipped).toContain("0003_progression_rewards.sql");
    expect(second.skipped).toContain("0004_pve_reward_item_definitions.sql");
    expect(second.skipped).toContain("0005_character_loot_pity.sql");
    expect(second.skipped).toContain("0006_enemy_reward_outbox.sql");
    expect(second.skipped).toContain("0007_dungeon_completion_events.sql");
  });

  it("enforces case-insensitive account uniqueness and valid character factions", async () => {
    const userId = await createUser();
    const user = await pool.query<{ email: string; username: string }>(
      "SELECT email, username FROM users WHERE id = $1",
      [userId],
    );
    const row = user.rows[0];
    expect(row).toBeDefined();

    await expect(
      pool.query(
        "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)",
        [
          randomUUID(),
          row!.email.toUpperCase(),
          `other_${randomUUID()}`,
          "test-hash",
        ],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        "INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4)",
        [
          randomUUID(),
          `other_${randomUUID()}@example.test`,
          row!.username.toUpperCase(),
          "test-hash",
        ],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        `INSERT INTO characters (id, user_id, name, class_id, faction_id, active_map_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          userId,
          `Bad Faction ${randomUUID()}`,
          "vanguard",
          "unregistered_faction",
          "white_jade_bastion",
        ],
      ),
    ).rejects.toThrow();

    const characterId = await createCharacter(userId);
    const owner = await pool.query<{ user_id: string }>(
      "SELECT user_id FROM characters WHERE id = $1",
      [characterId],
    );
    expect(owner.rows[0]?.user_id).toBe(userId);
  });

  it("prevents pets being equipped by a character that does not own them", async () => {
    const firstUserId = await createUser();
    const secondUserId = await createUser();
    const firstCharacterId = await createCharacter(firstUserId);
    const secondCharacterId = await createCharacter(
      secondUserId,
      "ashen_syndicate",
    );
    const firstPetId = randomUUID();
    const secondPetId = randomUUID();

    await pool.query(
      "INSERT INTO pets (id, owner_character_id, species_id, name) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)",
      [
        firstPetId,
        firstCharacterId,
        "spirit_fox",
        "First Fox",
        secondPetId,
        secondCharacterId,
        "spirit_crane",
        "Second Crane",
      ],
    );
    await pool.query(
      "INSERT INTO active_pets (character_id, pet_id) VALUES ($1, $2)",
      [firstCharacterId, firstPetId],
    );

    await expect(
      pool.query(
        "INSERT INTO active_pets (character_id, pet_id) VALUES ($1, $2)",
        [firstCharacterId, secondPetId],
      ),
    ).rejects.toThrow();
  });

  it("enforces item-definition references, positive quantities and currency safety", async () => {
    const userId = await createUser();
    const characterId = await createCharacter(userId);
    await pool.query(
      `INSERT INTO item_definitions
        (id, content_version, display_name, item_type, rarity, bind_policy, tradeable)
       VALUES ($1, 1, $2, 'weapon', 'common', 'character_bound', false)`,
      ["weapon.test-blade", "Test Blade"],
    );

    const itemId = randomUUID();
    await pool.query(
      `INSERT INTO item_instances (id, definition_id, definition_version, owner_character_id, quantity)
       VALUES ($1, 'weapon.test-blade', 1, $2, 1)`,
      [itemId, characterId],
    );

    await expect(
      pool.query(
        `INSERT INTO item_instances (id, definition_id, definition_version, owner_character_id, quantity)
         VALUES ($1, 'weapon.missing', 1, $2, 1)`,
        [randomUUID(), characterId],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        `INSERT INTO item_instances (id, definition_id, definition_version, owner_character_id, quantity)
         VALUES ($1, 'weapon.test-blade', 1, $2, 0)`,
        [randomUUID(), characterId],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        "INSERT INTO currency_wallets (user_id, currency_code, balance) VALUES ($1, 'silver', -1)",
        [userId],
      ),
    ).rejects.toThrow();

    const idempotencyKey = `test-${randomUUID()}`;
    const ledgerEntry = [
      randomUUID(),
      idempotencyKey,
      userId,
      characterId,
      "silver",
      10,
      "integration_test",
    ] as const;
    await pool.query(
      `INSERT INTO currency_ledger
        (transaction_id, idempotency_key, user_id, character_id, currency_code, delta, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [...ledgerEntry],
    );
    await expect(
      pool.query(
        `INSERT INTO currency_ledger
          (transaction_id, idempotency_key, user_id, character_id, currency_code, delta, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [...ledgerEntry],
      ),
    ).rejects.toThrow();
  });

  it("rejects changes to a migration version that has already been applied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sf-migration-drift-"));
    try {
      await writeFile(join(directory, "0001_initial.sql"), "SELECT 1;\n");
      await expect(runMigrations(pool, directory)).rejects.toThrow(
        /has changed.*Create a new migration/i,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rolls back a failed migration without recording it as applied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sf-migration-rollback-"));
    try {
      await writeFile(
        join(directory, "0002_failed.sql"),
        "CREATE TABLE migration_rollback_probe (id INTEGER);\nINVALID SQL STATEMENT;\n",
      );
      await expect(runMigrations(pool, directory)).rejects.toThrow();
      const table = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migration_rollback_probe'",
      );
      const record = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version = '0002_failed.sql'",
      );
      expect(table.rowCount).toBe(0);
      expect(record.rowCount).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("prevents join tickets and active leases crossing account ownership boundaries", async () => {
    const firstUserId = await createUser();
    const secondUserId = await createUser();
    const firstCharacterId = await createCharacter(firstUserId);
    const secondCharacterId = await createCharacter(
      secondUserId,
      "ashen_syndicate",
    );

    const firstSessionId = randomUUID();
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [firstSessionId, firstUserId, "a".repeat(64)],
    );
    await expect(
      pool.query(
        `INSERT INTO join_tickets
          (id, token_hash, user_id, session_id, character_id, destination, audience, protocol_version, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'world-main', 'gameplay', 1, now() + interval '5 minutes')`,
        [
          randomUUID(),
          "c".repeat(64),
          firstUserId,
          firstSessionId,
          secondCharacterId,
        ],
      ),
    ).rejects.toThrow();

    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, secondUserId, "b".repeat(64)],
    );

    await expect(
      pool.query(
        `INSERT INTO active_character_leases
          (character_id, user_id, session_id, lease_expires_at)
         VALUES ($1, $2, $3, now() + interval '1 minute')`,
        [firstCharacterId, firstUserId, sessionId],
      ),
    ).rejects.toThrow();

    const ticketOwnerCheck = await pool.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = 'join_tickets'
         AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(ticketOwnerCheck.rowCount).toBeGreaterThan(0);
  });
});

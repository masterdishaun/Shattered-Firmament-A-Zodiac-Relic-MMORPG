import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = testDatabaseUrl ? describe : describe.skip;
let pool: Pool;

databaseSuite("PostgreSQL migrations", () => {
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
      "quest_progress",
      "currency_wallets",
      "currency_ledger",
      "item_transactions",
      "active_character_leases",
      "schema_migrations",
    ]) {
      expect(tableNames.has(table), `missing migrated table: ${table}`).toBe(
        true,
      );
    }

    const second = await runMigrations(pool);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain("0001_initial.sql");
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
});

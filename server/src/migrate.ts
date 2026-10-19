import { Pool } from "pg";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be configured before applying migrations.",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const result = await runMigrations(pool);
  for (const version of result.applied) {
    process.stdout.write(`Applied migration: ${version}\n`);
  }
  for (const version of result.skipped) {
    process.stdout.write(`Already applied: ${version}\n`);
  }
  process.stdout.write(
    `Migration check complete. Applied ${result.applied.length}; unchanged ${result.skipped.length}.\n`,
  );
} catch (error) {
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}

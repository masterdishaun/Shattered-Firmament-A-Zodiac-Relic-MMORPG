import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";

export interface AppDependencies {
  databaseUrl?: string;
}

export interface ShatteredFirmamentApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

export const createApp = (
  dependencies: AppDependencies = {},
): ShatteredFirmamentApp => {
  const databaseUrl = dependencies.databaseUrl ?? process.env.DATABASE_URL;
  const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        max: 5,
        connectionTimeoutMillis: 1_500,
      })
    : null;
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

  app.get("/health/live", async () => ({
    status: "ok",
    service: "shattered-firmament-api",
    timestamp: new Date().toISOString(),
  }));

  app.get("/health/ready", async (_request, reply) => {
    if (!pool) {
      return reply
        .code(503)
        .send({ status: "not_ready", checks: { database: "not_configured" } });
    }

    try {
      await pool.query("SELECT 1");
      return {
        status: "ready",
        checks: { database: "ok" },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return reply
        .code(503)
        .send({ status: "not_ready", checks: { database: "unavailable" } });
    }
  });

  return {
    app,
    close: async () => {
      await app.close();
      await pool?.end();
    },
  };
};

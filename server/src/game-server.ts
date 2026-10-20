import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Pool } from "pg";
import { WorldRoom } from "./world-room.js";
import { DungeonRoom } from "./dungeon-room.js";
import { processEnemyRewardOutbox } from "./reward-outbox.js";

export interface GameServerService {
  listen: (port: number, host: string) => Promise<void>;
  close: () => Promise<void>;
}

export function createGameServer(databaseUrl: string): GameServerService {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL must be configured before starting the game server.",
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    connectionTimeoutMillis: 1_500,
  });
  const gameServer = new Server({
    greet: false,
    transport: new WebSocketTransport({
      pingInterval: 3_000,
      pingMaxRetries: 2,
      maxPayload: 4 * 1024,
      perMessageDeflate: false,
    }),
  });
  gameServer.define("world", WorldRoom, { pool });
  gameServer.define("dungeon", DungeonRoom, { pool }).filterBy(["instanceId"]);
  // Service-level polling continues even if the world room is disposed and resumes on restart.
  const rewardOutboxTimer = setInterval(() => {
    void processEnemyRewardOutbox(pool).catch((error: unknown) => {
      console.error("Failed to process PvE reward outbox", error);
    });
  }, 1_000);
  let listening = false;

  return {
    listen: async (port, host) => {
      await gameServer.listen(port, host);
      listening = true;
    },
    close: async () => {
      clearInterval(rewardOutboxTimer);
      try {
        if (listening) {
          await gameServer.gracefullyShutdown(false);
        }
      } finally {
        await pool.end();
      }
    },
  };
}

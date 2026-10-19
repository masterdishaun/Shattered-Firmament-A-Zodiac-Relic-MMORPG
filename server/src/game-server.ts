import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Pool } from "pg";
import { WorldRoom } from "./world-room.js";

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
  let listening = false;

  return {
    listen: async (port, host) => {
      await gameServer.listen(port, host);
      listening = true;
    },
    close: async () => {
      if (listening) {
        await gameServer.gracefullyShutdown(false);
      }
      await pool.end();
    },
  };
}

import { createApp } from "./app.js";
import { createGameServer } from "./game-server.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.HTTP_PORT ?? "2567", 10);
const gameHost = process.env.GAME_HOST ?? host;
const gamePort = Number.parseInt(process.env.GAME_PORT ?? "2568", 10);
const service = createApp();
const gameServer = process.env.DATABASE_URL
  ? createGameServer(process.env.DATABASE_URL)
  : null;

const start = async (): Promise<void> => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("HTTP_PORT must be a valid TCP port.");
  }
  if (
    gameServer &&
    (!Number.isInteger(gamePort) ||
      gamePort < 1 ||
      gamePort > 65_535 ||
      gamePort === port)
  ) {
    throw new Error(
      "GAME_PORT must be a valid TCP port different from HTTP_PORT.",
    );
  }

  await service.app.listen({ host, port });
  if (gameServer) {
    await gameServer.listen(gamePort, gameHost);
    service.app.log.info(
      { host: gameHost, port: gamePort },
      "Colyseus game server listening",
    );
  }
};

const shutdown = async (): Promise<void> => {
  await gameServer?.close();
  await service.close();
};

process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));

start().catch(async (error: unknown) => {
  service.app.log.error(error, "Failed to start services");
  try {
    await shutdown();
  } finally {
    process.exitCode = 1;
  }
});

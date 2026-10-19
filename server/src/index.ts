import { createApp } from "./app.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.HTTP_PORT ?? "2567", 10);
const service = createApp();

const start = async (): Promise<void> => {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("HTTP_PORT must be a valid TCP port.");
  }
  await service.app.listen({ host, port });
};

const shutdown = async (): Promise<void> => {
  await service.close();
};

process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));

start().catch((error: unknown) => {
  service.app.log.error(error, "Failed to start API");
  process.exitCode = 1;
});

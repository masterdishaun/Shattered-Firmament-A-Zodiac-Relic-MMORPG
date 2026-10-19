import { afterEach, describe, expect, it } from "vitest";
import { createApp, type ShatteredFirmamentApp } from "./app.js";

const services: ShatteredFirmamentApp[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});

describe("health endpoints", () => {
  it("reports liveness without requiring a database", async () => {
    const service = createApp({});
    services.push(service);
    const response = await service.app.inject({
      method: "GET",
      url: "/health/live",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "shattered-firmament-api",
    });
  });

  it("fails readiness closed when the database is not configured", async () => {
    const service = createApp({ databaseUrl: "" });
    services.push(service);
    const response = await service.app.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      checks: { database: "not_configured" },
    });
  });
});

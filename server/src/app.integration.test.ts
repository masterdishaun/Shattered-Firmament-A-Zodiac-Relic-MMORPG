import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp, type ShatteredFirmamentApp } from "./app.js";
import { runMigrations } from "./migrations.js";
import { grantEnemyDefeatRewards } from "./progression.js";
import { hashOpaqueToken } from "./security.js";
import {
  consumeJoinTicket,
  deferCharacterLeaseRelease,
  extendCharacterLease,
} from "./join-tickets.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = testDatabaseUrl ? describe : describe.skip;
const accessTokenSecret =
  "integration-test-secret-that-is-long-enough-for-hmac-signing";
let adminPool: Pool;
let migrationPool: Pool;
let service: ShatteredFirmamentApp;
let scopedDatabaseUrl: string;
let schemaName: string;

async function registerAccount(email: string, username: string) {
  const response = await service.app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, username, password: "correct horse battery staple 42" },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as {
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    user: { id: string; email: string; username: string };
  };
}

databaseSuite("authentication and character API integration", () => {
  beforeAll(async () => {
    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    const database = await adminPool.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    expect(database.rows[0]?.current_database).toMatch(/_test$/);

    schemaName = `sf_auth_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    const url = new URL(testDatabaseUrl!);
    url.searchParams.set("options", `-c search_path=${schemaName}`);
    scopedDatabaseUrl = url.toString();

    migrationPool = new Pool({ connectionString: scopedDatabaseUrl, max: 2 });
    await runMigrations(migrationPool, resolve(process.cwd(), "migrations"));
    service = createApp({
      databaseUrl: scopedDatabaseUrl,
      accessTokenSecret,
    });
    await service.app.ready();
  });

  afterAll(async () => {
    await service?.close();
    await migrationPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    await adminPool?.end();
  });

  it("registers an account, creates a faction-specific character and issues a hashed short-lived join ticket", async () => {
    const tokens = await registerAccount("Dee@Example.test", "DeePlayer");
    expect(tokens.user).toMatchObject({
      email: "dee@example.test",
      username: "deeplayer",
    });
    expect(tokens.expiresIn).toBe(900);
    const passwordHash = await migrationPool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [tokens.user.id],
    );
    expect(passwordHash.rows[0]?.password_hash).toMatch(
      /^scrypt\$32768\$8\$1\$/,
    );
    expect(passwordHash.rows[0]?.password_hash).not.toContain(
      "correct horse battery staple 42",
    );

    const me = await service.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      id: tokens.user.id,
      email: "dee@example.test",
    });

    const create = await service.app.inject({
      method: "POST",
      url: "/v1/characters",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: "Jade Hero",
        classId: "vanguard",
        factionId: "ashen_syndicate",
      },
    });
    expect(create.statusCode).toBe(201);
    const character = create.json().character;
    await grantEnemyDefeatRewards(migrationPool, {
      eventKey: `integration-enemy:${randomUUID()}`,
      userId: tokens.user.id,
      characterId: character.id,
      archetype: "rift-stalker",
      enemyLevel: 2,
      random: () => 0,
    });
    const rewards = await service.app.inject({
      method: "GET",
      url: `/v1/characters/${character.id}/rewards`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(rewards.statusCode).toBe(200);
    expect(rewards.json().rewards).toMatchObject([
      {
        sourceType: "enemy_defeat",
        sourceId: "rift-stalker",
        experienceAwarded: 60,
        silverAwarded: 3,
        loot: [
          {
            itemId: "material.ashen-jade-fragment",
            quantity: 1,
            tradeable: true,
          },
        ],
      },
    ]);
    expect(character).toMatchObject({
      name: "Jade Hero",
      classId: "vanguard",
      factionId: "ashen_syndicate",
      mapId: "cinderwake",
      level: 1,
    });

    const list = await service.app.inject({
      method: "GET",
      url: "/v1/characters",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().characters).toHaveLength(1);

    const selected = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${character.id}/select`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(selected.statusCode).toBe(200);
    const ticketResponse = selected.json();
    expect(ticketResponse).toMatchObject({
      destination: "world-main",
      audience: "gameplay",
      protocolVersion: 1,
      character: { id: character.id, mapId: "cinderwake" },
    });
    expect(Date.parse(ticketResponse.expiresAt)).toBeGreaterThan(Date.now());
    const ticketRow = await migrationPool.query<{ token_hash: string }>(
      "SELECT token_hash FROM join_tickets WHERE character_id = $1",
      [character.id],
    );
    expect(ticketRow.rows).toHaveLength(1);
    expect(ticketRow.rows[0]?.token_hash).toBe(
      hashOpaqueToken(ticketResponse.joinTicket),
    );
    expect(ticketRow.rows[0]?.token_hash).not.toBe(ticketResponse.joinTicket);

    const admitted = await consumeJoinTicket(
      migrationPool,
      ticketResponse.joinTicket,
    );
    expect(admitted).toMatchObject({
      userId: tokens.user.id,
      sessionId: expect.any(String),
      character: { id: character.id, mapId: "cinderwake" },
    });
    await expect(
      consumeJoinTicket(migrationPool, ticketResponse.joinTicket),
    ).rejects.toMatchObject({ code: "JOIN_TICKET_INVALID" });

    const sameSessionSelection = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${character.id}/select`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(sameSessionSelection.statusCode).toBe(200);
    await expect(
      consumeJoinTicket(migrationPool, sameSessionSelection.json().joinTicket),
    ).rejects.toMatchObject({ code: "CHARACTER_ALREADY_ACTIVE" });

    const secondLogin = await service.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: "deeplayer",
        password: "correct horse battery staple 42",
      },
    });
    expect(secondLogin.statusCode).toBe(200);
    const secondTokens = secondLogin.json();
    const secondSelection = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${character.id}/select`,
      headers: { authorization: `Bearer ${secondTokens.accessToken}` },
    });
    expect(secondSelection.statusCode).toBe(200);
    await expect(
      consumeJoinTicket(migrationPool, secondSelection.json().joinTicket),
    ).rejects.toMatchObject({ code: "CHARACTER_ALREADY_ACTIVE" });

    // Disconnection opens a short grace window only for the same authenticated
    // session; a second login still cannot take over the disconnected character.
    await deferCharacterLeaseRelease(migrationPool, admitted);
    await expect(
      consumeJoinTicket(migrationPool, secondSelection.json().joinTicket),
    ).rejects.toMatchObject({ code: "CHARACTER_ALREADY_ACTIVE" });
    const resumed = await consumeJoinTicket(
      migrationPool,
      sameSessionSelection.json().joinTicket,
    );
    expect(resumed).toMatchObject({
      userId: tokens.user.id,
      sessionId: admitted.sessionId,
      character: { id: character.id },
    });

    const other = await registerAccount("other@example.test", "OtherPlayer");
    const foreignSelection = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${character.id}/select`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(foreignSelection.statusCode).toBe(404);
  });

  it("uses generic login failures and rotates refresh tokens exactly once", async () => {
    const tokens = await registerAccount("login@example.test", "LoginPlayer");

    const duplicate = await service.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "LOGIN@example.test",
        username: "AnotherPlayer",
        password: "correct horse battery staple 42",
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const badLogin = await service.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: "login@example.test",
        password: "incorrect password",
      },
    });
    expect(badLogin.statusCode).toBe(401);
    expect(badLogin.json().error.code).toBe("AUTH_INVALID");

    const login = await service.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: "LOGINPLAYER",
        password: "correct horse battery staple 42",
      },
    });
    expect(login.statusCode).toBe(200);
    const loggedIn = login.json();

    const refreshed = await service.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: loggedIn.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const rotated = refreshed.json();
    expect(rotated.refreshToken).not.toBe(loggedIn.refreshToken);

    const replay = await service.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: loggedIn.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const oldAccess = await service.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${loggedIn.accessToken}` },
    });
    expect(oldAccess.statusCode).toBe(401);

    const logout = await service.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${rotated.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await service.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${rotated.accessToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("validates request bodies and rejects unauthenticated character operations", async () => {
    const invalidRegister = await service.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "not-an-email", username: "x", password: "short" },
    });
    expect(invalidRegister.statusCode).toBe(400);

    const unauthenticated = await service.app.inject({
      method: "POST",
      url: "/v1/characters",
      payload: {
        name: "Jade Hero",
        classId: "vanguard",
        factionId: "sovereign_sect",
      },
    });
    expect(unauthenticated.statusCode).toBe(401);
  });
  it("rejects tickets issued for a different audience without consuming them", async () => {
    const tokens = await registerAccount(
      "context@example.test",
      "ContextPlayer",
    );
    const create = await service.app.inject({
      method: "POST",
      url: "/v1/characters",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: "Context Hero",
        classId: "mystic",
        factionId: "astral_concord",
      },
    });
    expect(create.statusCode).toBe(201);
    const characterId = create.json().character.id;

    const selected = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${characterId}/select`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(selected.statusCode).toBe(200);
    const ticket = selected.json().joinTicket;
    await migrationPool.query(
      "UPDATE join_tickets SET audience = 'admin' WHERE token_hash = $1",
      [hashOpaqueToken(ticket)],
    );

    await expect(
      consumeJoinTicket(migrationPool, ticket),
    ).rejects.toMatchObject({
      code: "JOIN_TICKET_CONTEXT_MISMATCH",
    });
    const stored = await migrationPool.query<{ consumed_at: Date | null }>(
      "SELECT consumed_at FROM join_tickets WHERE token_hash = $1",
      [hashOpaqueToken(ticket)],
    );
    expect(stored.rows[0]?.consumed_at).toBeNull();
  });
  it("stops renewing a character lease after its account session is revoked", async () => {
    const tokens = await registerAccount("lease@example.test", "LeasePlayer");
    const create = await service.app.inject({
      method: "POST",
      url: "/v1/characters",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: "Lease Hero",
        classId: "support",
        factionId: "sovereign_sect",
      },
    });
    expect(create.statusCode).toBe(201);
    const characterId = create.json().character.id;
    const selected = await service.app.inject({
      method: "POST",
      url: `/v1/characters/${characterId}/select`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(selected.statusCode).toBe(200);
    const admitted = await consumeJoinTicket(
      migrationPool,
      selected.json().joinTicket,
    );
    expect(await extendCharacterLease(migrationPool, admitted)).toBe(true);

    const logout = await service.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);
    expect(await extendCharacterLease(migrationPool, admitted)).toBe(false);
  });
});

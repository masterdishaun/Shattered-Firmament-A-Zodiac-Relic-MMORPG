import { randomUUID } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { Pool, type PoolClient } from "pg";
import { PROTOCOL_VERSION } from "@shattered-firmament/shared/protocol";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./security.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const JOIN_TICKET_TTL_MS = 60 * 1000;
const FACTION_START_MAPS = {
  sovereign_sect: "white_jade_bastion",
  ashen_syndicate: "cinderwake",
  astral_concord: "luminous_veil",
} as const;
const ARCHETYPE_IDS = ["vanguard", "mystic", "support"] as const;
const FACTION_IDS = [
  "sovereign_sect",
  "ashen_syndicate",
  "astral_concord",
] as const;

type FactionId = (typeof FACTION_IDS)[number];
type AuthUser = { id: string; email: string; username: string };
type AuthContext = AuthUser & { sessionId: string };
type RegisterBody = { email: string; username: string; password: string };
type LoginBody = { identifier: string; password: string };
type RefreshBody = { refreshToken: string };
type CreateCharacterBody = {
  name: string;
  classId: (typeof ARCHETYPE_IDS)[number];
  factionId: FactionId;
};

export interface AppDependencies {
  databaseUrl?: string;
  accessTokenSecret?: string;
}

export interface ShatteredFirmamentApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

function isAuthReady(pool: Pool | null, secret: string): boolean {
  return pool !== null && Buffer.byteLength(secret, "utf8") >= 32;
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: {
      code: "SERVICE_NOT_READY",
      message: "Authentication service is not configured.",
    },
  });
}

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: {
      code: "AUTH_INVALID",
      message: "Authentication credentials are invalid or expired.",
    },
  });
}

function databaseUnavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
}

async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  pool: Pool | null,
  secret: string,
): Promise<AuthContext | null> {
  if (!isAuthReady(pool, secret)) {
    unavailable(reply);
    return null;
  }

  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match?.[1]) {
    unauthorized(reply);
    return null;
  }

  const claims = verifyAccessToken(match[1], secret);
  if (!claims) {
    unauthorized(reply);
    return null;
  }

  try {
    const result = await pool!.query<AuthContext>(
      `SELECT u.id, u.email, u.username, s.id AS "sessionId"
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1
         AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.status = 'active'`,
      [claims.sid, claims.sub],
    );
    const user = result.rows[0];
    if (!user) {
      unauthorized(reply);
      return null;
    }
    return user;
  } catch {
    databaseUnavailable(reply);
    return null;
  }
}

async function createSession(
  pool: Pool | PoolClient,
  user: AuthUser,
  secret: string,
) {
  const sessionId = randomUUID();
  const refreshToken = createOpaqueToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, user.id, hashOpaqueToken(refreshToken), refreshExpiresAt],
  );
  const accessToken = issueAccessToken(user.id, sessionId, secret);
  return {
    tokenType: "Bearer" as const,
    accessToken: accessToken.token,
    expiresIn: accessToken.expiresIn,
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    user,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original request error; release closes any broken transaction.
  }
}

export const createApp = (
  dependencies: AppDependencies = {},
): ShatteredFirmamentApp => {
  const databaseUrl = dependencies.databaseUrl ?? process.env.DATABASE_URL;
  const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 1_500,
      })
    : null;
  const accessTokenSecret =
    dependencies.accessTokenSecret ?? process.env.ACCESS_TOKEN_SECRET ?? "";
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

  app.post<{ Body: RegisterBody }>(
    "/v1/auth/register",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "username", "password"],
          properties: {
            email: {
              type: "string",
              minLength: 3,
              maxLength: 254,
              pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
            },
            username: {
              type: "string",
              minLength: 3,
              maxLength: 24,
              pattern: "^[A-Za-z][A-Za-z0-9_]{2,23}$",
            },
            password: { type: "string", minLength: 12, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isAuthReady(pool, accessTokenSecret)) return unavailable(reply);
      const email = request.body.email.trim().toLowerCase();
      const username = request.body.username.trim().toLowerCase();
      let client: PoolClient | undefined;
      try {
        const passwordHash = await hashPassword(request.body.password);
        client = await pool!.connect();
        await client.query("BEGIN");
        const inserted = await client.query<AuthUser>(
          `INSERT INTO users (id, email, username, password_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, username`,
          [randomUUID(), email, username, passwordHash],
        );
        const user = inserted.rows[0]!;
        const tokens = await createSession(client, user, accessTokenSecret);
        await client.query("COMMIT");
        return reply.code(201).send(tokens);
      } catch (error) {
        if (client) await rollbackQuietly(client);
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            error: {
              code: "ACCOUNT_CONFLICT",
              message: "An account with those details already exists.",
            },
          });
        }
        request.log.error({ err: error }, "Account registration failed");
        return databaseUnavailable(reply);
      } finally {
        client?.release();
      }
    },
  );

  app.post<{ Body: LoginBody }>(
    "/v1/auth/login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["identifier", "password"],
          properties: {
            identifier: { type: "string", minLength: 1, maxLength: 254 },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isAuthReady(pool, accessTokenSecret)) return unavailable(reply);
      try {
        const result = await pool!.query<
          AuthUser & { password_hash: string; status: string }
        >(
          `SELECT id, email, username, password_hash, status
           FROM users
           WHERE lower(email) = lower($1) OR lower(username) = lower($1)
           LIMIT 1`,
          [request.body.identifier.trim()],
        );
        const user = result.rows[0];
        const passwordMatches = user
          ? await verifyPassword(request.body.password, user.password_hash)
          : (await hashPassword(request.body.password), false);
        if (!user || user.status !== "active" || !passwordMatches) {
          return unauthorized(reply);
        }
        const tokens = await createSession(
          pool!,
          { id: user.id, email: user.email, username: user.username },
          accessTokenSecret,
        );
        return reply.code(200).send(tokens);
      } catch (error) {
        request.log.error({ err: error }, "Login request failed");
        return databaseUnavailable(reply);
      }
    },
  );

  app.post<{ Body: RefreshBody }>(
    "/v1/auth/refresh",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", minLength: 20, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isAuthReady(pool, accessTokenSecret)) return unavailable(reply);
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<{
          id: string;
          user_id: string;
          email: string;
          username: string;
          status: string;
          expires_at: Date;
          revoked_at: Date | null;
        }>(
          `SELECT s.id, s.user_id, s.expires_at, s.revoked_at,
                  u.email, u.username, u.status
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.refresh_token_hash = $1
           FOR UPDATE OF s`,
          [hashOpaqueToken(request.body.refreshToken)],
        );
        const session = result.rows[0];
        if (
          !session ||
          session.revoked_at ||
          new Date(session.expires_at).getTime() <= Date.now() ||
          session.status !== "active"
        ) {
          await rollbackQuietly(client);
          return unauthorized(reply);
        }

        const newSessionId = randomUUID();
        const newRefreshToken = createOpaqueToken();
        const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
        await client.query(
          `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [
            newSessionId,
            session.user_id,
            hashOpaqueToken(newRefreshToken),
            newRefreshExpiresAt,
          ],
        );
        await client.query(
          `UPDATE auth_sessions
           SET revoked_at = now(), replaced_by_session_id = $2
           WHERE id = $1`,
          [session.id, newSessionId],
        );
        await client.query("COMMIT");

        const accessToken = issueAccessToken(
          session.user_id,
          newSessionId,
          accessTokenSecret,
        );
        return reply.code(200).send({
          tokenType: "Bearer",
          accessToken: accessToken.token,
          expiresIn: accessToken.expiresIn,
          refreshToken: newRefreshToken,
          refreshExpiresAt: newRefreshExpiresAt.toISOString(),
          user: {
            id: session.user_id,
            email: session.email,
            username: session.username,
          },
        });
      } catch (error) {
        await rollbackQuietly(client);
        request.log.error({ err: error }, "Refresh request failed");
        return databaseUnavailable(reply);
      } finally {
        client.release();
      }
    },
  );

  app.post("/v1/auth/logout", async (request, reply) => {
    const auth = await authenticateRequest(
      request,
      reply,
      pool,
      accessTokenSecret,
    );
    if (!auth) return;
    try {
      await pool!.query(
        "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND user_id = $2",
        [auth.sessionId, auth.id],
      );
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, "Logout request failed");
      return databaseUnavailable(reply);
    }
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const auth = await authenticateRequest(
      request,
      reply,
      pool,
      accessTokenSecret,
    );
    if (!auth) return;
    return { id: auth.id, email: auth.email, username: auth.username };
  });

  app.get("/v1/characters", async (request, reply) => {
    const auth = await authenticateRequest(
      request,
      reply,
      pool,
      accessTokenSecret,
    );
    if (!auth) return;
    try {
      const result = await pool!.query(
        `SELECT id, name, class_id AS "classId", faction_id AS "factionId",
                level, experience, cultivation_realm AS "cultivationRealm",
                active_map_id AS "mapId", health, max_health AS "maxHealth",
                created_at AS "createdAt", last_played_at AS "lastPlayedAt"
         FROM characters
         WHERE user_id = $1 AND status = 'active'
         ORDER BY last_played_at DESC NULLS LAST, created_at ASC`,
        [auth.id],
      );
      return { characters: result.rows };
    } catch (error) {
      request.log.error({ err: error }, "Character list failed");
      return databaseUnavailable(reply);
    }
  });

  app.post<{ Body: CreateCharacterBody }>(
    "/v1/characters",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name", "classId", "factionId"],
          properties: {
            name: {
              type: "string",
              minLength: 3,
              maxLength: 24,
              pattern: "^[A-Za-z][A-Za-z0-9 _'-]{2,23}$",
            },
            classId: { type: "string", enum: [...ARCHETYPE_IDS] },
            factionId: { type: "string", enum: [...FACTION_IDS] },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticateRequest(
        request,
        reply,
        pool,
        accessTokenSecret,
      );
      if (!auth) return;
      const name = request.body.name.trim().replace(/\s+/g, " ");
      const mapId = FACTION_START_MAPS[request.body.factionId];
      try {
        const result = await pool!.query(
          `INSERT INTO characters
            (id, user_id, name, class_id, faction_id, active_map_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, class_id AS "classId", faction_id AS "factionId",
                     level, experience, cultivation_realm AS "cultivationRealm",
                     active_map_id AS "mapId", health, max_health AS "maxHealth",
                     created_at AS "createdAt"`,
          [
            randomUUID(),
            auth.id,
            name,
            request.body.classId,
            request.body.factionId,
            mapId,
          ],
        );
        return reply.code(201).send({ character: result.rows[0] });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            error: {
              code: "CHARACTER_NAME_CONFLICT",
              message: "That character name is already in use.",
            },
          });
        }
        request.log.error({ err: error }, "Character creation failed");
        return databaseUnavailable(reply);
      }
    },
  );

  app.post<{ Params: { characterId: string } }>(
    "/v1/characters/:characterId/select",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["characterId"],
          properties: {
            characterId: {
              type: "string",
              pattern:
                "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticateRequest(
        request,
        reply,
        pool,
        accessTokenSecret,
      );
      if (!auth) return;
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const characterResult = await client.query<{
          id: string;
          name: string;
          level: number;
          active_map_id: string;
          position_x: number;
          position_y: number;
          facing: number;
          health: number;
          max_health: number;
        }>(
          `SELECT id, name, level, active_map_id, position_x, position_y, facing, health, max_health
           FROM characters
           WHERE id = $1 AND user_id = $2 AND status = 'active'
           FOR UPDATE`,
          [request.params.characterId, auth.id],
        );
        const character = characterResult.rows[0];
        if (!character) {
          await rollbackQuietly(client);
          return reply.code(404).send({
            error: {
              code: "CHARACTER_NOT_FOUND",
              message: "The requested character was not found.",
            },
          });
        }

        const rawJoinTicket = createOpaqueToken();
        const ticketExpiresAt = new Date(Date.now() + JOIN_TICKET_TTL_MS);
        await client.query(
          `INSERT INTO join_tickets
            (id, token_hash, user_id, character_id, destination, audience, protocol_version, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            hashOpaqueToken(rawJoinTicket),
            auth.id,
            character.id,
            "world-main",
            "gameplay",
            PROTOCOL_VERSION,
            ticketExpiresAt,
          ],
        );
        await client.query(
          "UPDATE characters SET last_played_at = now(), updated_at = now() WHERE id = $1",
          [character.id],
        );
        await client.query("COMMIT");
        return {
          joinTicket: rawJoinTicket,
          expiresAt: ticketExpiresAt.toISOString(),
          destination: "world-main",
          audience: "gameplay",
          protocolVersion: PROTOCOL_VERSION,
          character: {
            id: character.id,
            name: character.name,
            level: character.level,
            mapId: character.active_map_id,
            position: {
              x: character.position_x,
              y: character.position_y,
              facing: character.facing,
            },
            health: character.health,
            maxHealth: character.max_health,
          },
        };
      } catch (error) {
        await rollbackQuietly(client);
        request.log.error({ err: error }, "Character selection failed");
        return databaseUnavailable(reply);
      } finally {
        client.release();
      }
    },
  );

  app.addHook("onClose", async () => {
    await pool?.end();
  });

  return {
    app,
    close: async () => {
      await app.close();
    },
  };
};

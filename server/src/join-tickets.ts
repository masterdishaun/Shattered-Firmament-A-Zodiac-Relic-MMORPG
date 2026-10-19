import type { Pool, PoolClient } from "pg";
import { PROTOCOL_VERSION } from "@shattered-firmament/shared/protocol";
import { hashOpaqueToken } from "./security.js";

const EXPECTED_DESTINATION = "world-main";
const EXPECTED_AUDIENCE = "gameplay";
const CHARACTER_LEASE_MS = 60_000;

export class JoinTicketError extends Error {
  constructor(
    readonly code:
      | "JOIN_TICKET_INVALID"
      | "JOIN_TICKET_CONTEXT_MISMATCH"
      | "CHARACTER_ALREADY_ACTIVE",
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "JoinTicketError";
  }
}

export interface ConsumedJoinTicket {
  ticketId: string;
  userId: string;
  sessionId: string;
  character: {
    id: string;
    name: string;
    level: number;
    factionId: "sovereign_sect" | "ashen_syndicate" | "astral_concord";
    mapId: string;
    position: { x: number; y: number; facing: number };
    health: number;
    maxHealth: number;
  };
  destination: string;
  audience: string;
  protocolVersion: number;
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original error.
  }
}

export async function consumeJoinTicket(
  pool: Pool,
  rawTicket: string,
): Promise<ConsumedJoinTicket> {
  if (
    typeof rawTicket !== "string" ||
    rawTicket.length < 32 ||
    rawTicket.length > 200
  ) {
    throw new JoinTicketError(
      "JOIN_TICKET_INVALID",
      401,
      "Join ticket is invalid or expired.",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      user_id: string;
      session_id: string;
      character_id: string;
      destination: string;
      audience: string;
      protocol_version: number;
      consumed_at: Date | null;
      ticket_valid: boolean;
      session_valid: boolean;
      session_revoked_at: Date | null;
      user_status: string;
      character_status: string;
      name: string;
      level: number;
      active_map_id: string;
      faction_id: "sovereign_sect" | "ashen_syndicate" | "astral_concord";
      position_x: number;
      position_y: number;
      facing: number;
      health: number;
      max_health: number;
    }>(
      `SELECT jt.id, jt.user_id, jt.session_id, jt.character_id,
              jt.destination, jt.audience, jt.protocol_version, jt.consumed_at,
              (jt.expires_at > now()) AS ticket_valid,
              (s.expires_at > now()) AS session_valid,
              s.revoked_at AS session_revoked_at,
              u.status AS user_status,
              c.status AS character_status,
              c.name, c.level, c.faction_id, c.active_map_id, c.position_x, c.position_y,
              c.facing, c.health, c.max_health
       FROM join_tickets jt
       JOIN users u ON u.id = jt.user_id
       JOIN auth_sessions s ON s.id = jt.session_id AND s.user_id = jt.user_id
       JOIN characters c ON c.id = jt.character_id AND c.user_id = jt.user_id
       WHERE jt.token_hash = $1
       FOR UPDATE OF jt`,
      [hashOpaqueToken(rawTicket)],
    );

    const ticket = result.rows[0];
    if (
      !ticket ||
      ticket.consumed_at ||
      !ticket.ticket_valid ||
      !ticket.session_valid ||
      ticket.session_revoked_at ||
      ticket.user_status !== "active" ||
      ticket.character_status !== "active"
    ) {
      throw new JoinTicketError(
        "JOIN_TICKET_INVALID",
        401,
        "Join ticket is invalid or expired.",
      );
    }

    if (
      ticket.destination !== EXPECTED_DESTINATION ||
      ticket.audience !== EXPECTED_AUDIENCE ||
      ticket.protocol_version !== PROTOCOL_VERSION
    ) {
      throw new JoinTicketError(
        "JOIN_TICKET_CONTEXT_MISMATCH",
        401,
        "Join ticket is not valid for this world or protocol.",
      );
    }

    const leaseExpiresAt = new Date(Date.now() + CHARACTER_LEASE_MS);
    const lease = await client.query(
      `INSERT INTO active_character_leases
        (character_id, user_id, session_id, lease_expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             session_id = EXCLUDED.session_id,
             lease_expires_at = EXCLUDED.lease_expires_at,
             disconnected_at = NULL,
             updated_at = now()
       WHERE active_character_leases.lease_expires_at <= now()
          OR (
            active_character_leases.user_id = EXCLUDED.user_id
            AND active_character_leases.session_id = EXCLUDED.session_id
            AND active_character_leases.disconnected_at IS NOT NULL
            AND active_character_leases.disconnected_at > now() - interval '60 seconds'
          )
       RETURNING character_id`,
      [ticket.character_id, ticket.user_id, ticket.session_id, leaseExpiresAt],
    );
    if (lease.rowCount !== 1) {
      throw new JoinTicketError(
        "CHARACTER_ALREADY_ACTIVE",
        409,
        "This character is already active in another session.",
      );
    }

    const consumed = await client.query(
      `UPDATE join_tickets
       SET consumed_at = now()
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [ticket.id],
    );
    if (consumed.rowCount !== 1) {
      throw new JoinTicketError(
        "JOIN_TICKET_INVALID",
        401,
        "Join ticket is invalid or expired.",
      );
    }

    await client.query("COMMIT");
    return {
      ticketId: ticket.id,
      userId: ticket.user_id,
      sessionId: ticket.session_id,
      destination: ticket.destination,
      audience: ticket.audience,
      protocolVersion: ticket.protocol_version,
      character: {
        id: ticket.character_id,
        name: ticket.name,
        level: ticket.level,
        factionId: ticket.faction_id,
        mapId: ticket.active_map_id,
        position: {
          x: ticket.position_x,
          y: ticket.position_y,
          facing: ticket.facing,
        },
        health: ticket.health,
        maxHealth: ticket.max_health,
      },
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function extendCharacterLease(
  pool: Pool,
  lease: Pick<ConsumedJoinTicket, "character" | "userId" | "sessionId">,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE active_character_leases AS lease
     SET lease_expires_at = now() + interval '60 seconds',
         disconnected_at = NULL,
         updated_at = now()
     WHERE lease.character_id = $1
       AND lease.user_id = $2
       AND lease.session_id = $3
       AND EXISTS (
         SELECT 1 FROM auth_sessions session
         JOIN users account ON account.id = session.user_id
         WHERE session.id = lease.session_id
           AND session.user_id = lease.user_id
           AND session.revoked_at IS NULL
           AND session.expires_at > now()
           AND account.status = 'active'
       )
       AND EXISTS (
         SELECT 1 FROM characters character
         WHERE character.id = lease.character_id
           AND character.user_id = lease.user_id
           AND character.status = 'active'
       )
     RETURNING lease.character_id`,
    [lease.character.id, lease.userId, lease.sessionId],
  );
  return result.rowCount === 1;
}

export async function deferCharacterLeaseRelease(
  pool: Pool,
  lease: Pick<ConsumedJoinTicket, "character" | "userId" | "sessionId">,
): Promise<void> {
  await pool.query(
    `UPDATE active_character_leases
     SET lease_expires_at = now() + interval '60 seconds',
         disconnected_at = now(),
         updated_at = now()
     WHERE character_id = $1 AND user_id = $2 AND session_id = $3`,
    [lease.character.id, lease.userId, lease.sessionId],
  );
}

export async function releaseCharacterLease(
  pool: Pool,
  lease: Pick<ConsumedJoinTicket, "character" | "userId" | "sessionId">,
): Promise<void> {
  await pool.query(
    `DELETE FROM active_character_leases
     WHERE character_id = $1 AND user_id = $2 AND session_id = $3`,
    [lease.character.id, lease.userId, lease.sessionId],
  );
}

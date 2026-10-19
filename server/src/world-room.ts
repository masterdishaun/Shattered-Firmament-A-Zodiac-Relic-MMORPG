import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import type { Pool } from "pg";
import {
  PROTOCOL_VERSION,
  type RoomJoinSuccess,
} from "@shattered-firmament/shared/protocol";
import {
  consumeJoinTicket,
  deferCharacterLeaseRelease,
  extendCharacterLease,
  releaseCharacterLease,
  type ConsumedJoinTicket,
  JoinTicketError,
} from "./join-tickets.js";

interface WorldRoomOptions {
  pool: Pool;
}

export class WorldRoom extends Room<
  object,
  Record<string, never>,
  unknown,
  ConsumedJoinTicket
> {
  override maxClients = 100;
  override patchRate = 50;

  private pool!: Pool;
  private readonly authenticatedClients = new Map<string, ConsumedJoinTicket>();
  private serverTick = 0;

  override onCreate(options: WorldRoomOptions) {
    this.pool = options.pool;
    this.setSimulationInterval(() => {
      this.serverTick += 1;
    }, 50);
    this.clock.setInterval(() => {
      void this.renewActiveLeases();
    }, 30_000);
  }

  override async onAuth(
    _client: Client,
    options: unknown,
    _context: unknown,
  ): Promise<ConsumedJoinTicket> {
    const joinTicket =
      typeof options === "object" && options !== null && "joinTicket" in options
        ? (options as { joinTicket?: unknown }).joinTicket
        : undefined;
    if (typeof joinTicket !== "string") {
      throw new ServerError(401, "A valid join ticket is required.");
    }

    try {
      return await consumeJoinTicket(this.pool, joinTicket);
    } catch (error) {
      if (error instanceof JoinTicketError) {
        throw new ServerError(error.statusCode, error.message);
      }
      throw new ServerError(503, "World admission is temporarily unavailable.");
    }
  }

  override onJoin(
    client: Client<unknown, ConsumedJoinTicket>,
    _options?: unknown,
    auth?: ConsumedJoinTicket,
  ) {
    if (!auth) {
      throw new ServerError(401, "World admission was not authenticated.");
    }
    this.authenticatedClients.set(client.sessionId, auth);

    const message: RoomJoinSuccess = {
      type: "S2C_RoomJoinSuccess",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        sessionId: client.sessionId,
        roomId: this.roomId,
        shardId: "world-main",
        character: {
          characterId: auth.character.id,
          name: auth.character.name,
          level: auth.character.level,
          mapId: auth.character.mapId,
          position: auth.character.position,
          health: auth.character.health,
          maxHealth: auth.character.maxHealth,
          movementSequence: 0,
        },
        world: {
          tickRate: 20,
          serverTick: this.serverTick,
          snapshotRate: 0,
          mapRevision: "blockout-001",
        },
        serverTime: new Date().toISOString(),
      },
    };
    client.send("S2C_RoomJoinSuccess", message);
  }

  override async onLeave(
    client: Client<unknown, ConsumedJoinTicket>,
    consented?: boolean,
  ) {
    const auth = this.authenticatedClients.get(client.sessionId);
    if (!auth) return;
    this.authenticatedClients.delete(client.sessionId);

    try {
      if (consented) {
        await releaseCharacterLease(this.pool, auth);
      } else {
        await deferCharacterLeaseRelease(this.pool, auth);
      }
    } catch {
      // The lease naturally expires; log/metrics integration is a later hardening step.
    }
  }

  private async renewActiveLeases() {
    for (const [clientSessionId, auth] of this.authenticatedClients) {
      try {
        const renewed = await extendCharacterLease(this.pool, auth);
        if (!renewed) {
          const client = this.clients.find(
            (candidate) => candidate.sessionId === clientSessionId,
          );
          client?.leave(4001, "Character lease lost");
          this.authenticatedClients.delete(clientSessionId);
        }
      } catch {
        // A transient database error must not crash the room timer. The lease remains bounded.
      }
    }
  }
}

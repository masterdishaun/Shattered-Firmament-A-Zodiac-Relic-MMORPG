import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import type { Pool } from "pg";
import {
  PROTOCOL_VERSION,
  type RoomJoinSuccess,
  type WorldSnapshotEnvelope,
} from "@shattered-firmament/shared/protocol";
import {
  applyMoveIntent,
  parseMoveIntent,
  stepPlayerMovement,
  WORLD_MOVEMENT,
  type PlayerMovementState,
} from "./movement.js";
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

interface WorldPlayerRuntime extends PlayerMovementState {
  userId: string;
  sessionId: string;
  characterId: string;
  name: string;
  mapId: string;
  health: number;
  maxHealth: number;
  lastIntentAtMs: number;
  invalidIntentCount: number;
}

const POSITION_CHECKPOINT_INTERVAL_MS = 5_000;

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
  private readonly playerStates = new Map<string, WorldPlayerRuntime>();
  private positionPersistenceQueue: Promise<void> = Promise.resolve();
  private positionCheckpointInFlight = false;
  private serverTick = 0;

  override onCreate(options: WorldRoomOptions) {
    this.pool = options.pool;
    this.onMessage("C2S_MoveIntent", (client, message: unknown) => {
      this.handleMoveIntent(client, message);
    });
    this.setSimulationInterval(() => {
      this.simulateWorld();
    }, 1000 / WORLD_MOVEMENT.tickRate);
    this.clock.setInterval(() => {
      void this.renewActiveLeases();
    }, 30_000);
    this.clock.setInterval(() => {
      void this.persistActivePositions();
    }, POSITION_CHECKPOINT_INTERVAL_MS);
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
    const state: WorldPlayerRuntime = {
      userId: auth.userId,
      sessionId: client.sessionId,
      characterId: auth.character.id,
      name: auth.character.name,
      mapId: auth.character.mapId,
      x: auth.character.position.x,
      y: auth.character.position.y,
      facing: auth.character.position.facing,
      movementSequence: 0,
      axisX: 0,
      axisY: 0,
      health: auth.character.health,
      maxHealth: auth.character.maxHealth,
      lastIntentAtMs: 0,
      invalidIntentCount: 0,
    };
    this.playerStates.set(client.sessionId, state);

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
          position: {
            x: state.x,
            y: state.y,
            facing: state.facing,
          },
          health: state.health,
          maxHealth: state.maxHealth,
          movementSequence: state.movementSequence,
        },
        world: {
          tickRate: WORLD_MOVEMENT.tickRate,
          serverTick: this.serverTick,
          snapshotRate: WORLD_MOVEMENT.tickRate,
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
    const state = this.playerStates.get(client.sessionId);
    this.playerStates.delete(client.sessionId);

    if (state) {
      await this.queuePositionPersistence([state]);
    }

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

  override async onDispose() {
    await this.queuePositionPersistence([...this.playerStates.values()]);
  }

  private handleMoveIntent(client: Client, message: unknown) {
    const state = this.playerStates.get(client.sessionId);
    if (!state) return;

    const now = Date.now();
    if (now - state.lastIntentAtMs < WORLD_MOVEMENT.minimumIntentIntervalMs) {
      state.invalidIntentCount += 1;
      if (state.invalidIntentCount >= WORLD_MOVEMENT.maximumInvalidIntents) {
        client.leave(4003, "Movement intent rate limit exceeded");
      }
      return;
    }

    const intent = parseMoveIntent(message, state.movementSequence);
    if (!intent) {
      state.invalidIntentCount += 1;
      if (state.invalidIntentCount >= WORLD_MOVEMENT.maximumInvalidIntents) {
        client.leave(4003, "Invalid movement input");
      }
      return;
    }

    state.lastIntentAtMs = now;
    state.invalidIntentCount = 0;
    applyMoveIntent(state, intent);
  }

  private simulateWorld() {
    this.serverTick += 1;
    for (const state of this.playerStates.values()) {
      stepPlayerMovement(state, WORLD_MOVEMENT.stepSeconds);
    }

    if (this.clients.length === 0) return;
    const snapshot: WorldSnapshotEnvelope = {
      type: "S2C_WorldSnapshot",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        serverTick: this.serverTick,
        serverTime: new Date().toISOString(),
        players: [...this.playerStates.values()].map((state) => ({
          characterId: state.characterId,
          name: state.name,
          mapId: state.mapId,
          position: {
            x: state.x,
            y: state.y,
            facing: state.facing,
          },
          movementSequence: state.movementSequence,
          health: state.health,
          maxHealth: state.maxHealth,
        })),
      },
    };
    this.broadcast("S2C_WorldSnapshot", snapshot);
  }

  private async persistActivePositions() {
    if (this.positionCheckpointInFlight || this.playerStates.size === 0) return;
    this.positionCheckpointInFlight = true;
    try {
      await this.queuePositionPersistence([...this.playerStates.values()]);
    } finally {
      this.positionCheckpointInFlight = false;
    }
  }

  private queuePositionPersistence(
    states: readonly WorldPlayerRuntime[],
  ): Promise<void> {
    if (states.length === 0) return this.positionPersistenceQueue;
    const rows = states.map((state) => ({
      character_id: state.characterId,
      user_id: state.userId,
      position_x: state.x,
      position_y: state.y,
      facing: state.facing,
    }));

    this.positionPersistenceQueue = this.positionPersistenceQueue
      .then(async () => {
        await this.pool.query(
          "UPDATE characters AS c\n" +
            "SET position_x = p.position_x,\n" +
            "    position_y = p.position_y,\n" +
            "    facing = p.facing,\n" +
            "    updated_at = now(),\n" +
            "    last_played_at = now()\n" +
            "FROM jsonb_to_recordset($1::jsonb) AS p(\n" +
            "  character_id UUID,\n" +
            "  user_id UUID,\n" +
            "  position_x DOUBLE PRECISION,\n" +
            "  position_y DOUBLE PRECISION,\n" +
            "  facing DOUBLE PRECISION\n" +
            ")\n" +
            "WHERE c.id = p.character_id AND c.user_id = p.user_id",
          [JSON.stringify(rows)],
        );
      })
      .catch((error: unknown) => {
        console.error(
          "[WorldRoom] Position persistence failed:",
          error instanceof Error ? error.message : "unknown database error",
        );
      });
    return this.positionPersistenceQueue;
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
          this.playerStates.delete(clientSessionId);
        }
      } catch {
        // A transient database error must not crash the room timer. The lease remains bounded.
      }
    }
  }
}

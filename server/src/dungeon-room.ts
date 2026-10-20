import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  applyDungeonBossDamage,
  consumeDungeonRoomTicket,
  DungeonRuntimeError,
} from "./content-runtime.js";

interface DungeonRoomOptions {
  pool: Pool;
  instanceId?: string;
}
interface DungeonRoomAuth {
  userId: string;
  characterId: string;
  instanceId: string;
  dungeonId: string;
  classId: "vanguard" | "mystic" | "support";
}
const DAMAGE_BY_CLASS = { vanguard: 50, mystic: 45, support: 25 } as const;
const ATTACK_COOLDOWN_MS = 900;

function parseAttackIntent(message: unknown): { encounterId: string } | null {
  if (typeof message !== "object" || message === null || Array.isArray(message))
    return null;
  const value = message as Record<string, unknown>;
  if (
    Object.keys(value).length !== 1 ||
    typeof value.encounterId !== "string" ||
    value.encounterId.length < 1 ||
    value.encounterId.length > 160
  )
    return null;
  return { encounterId: value.encounterId };
}

export class DungeonRoom extends Room {
  override maxClients = 5;
  private pool!: Pool;
  private instanceId = "";
  private readonly members = new Map<string, DungeonRoomAuth>();
  private readonly lastAttackAt = new Map<string, number>();

  override onCreate(options: DungeonRoomOptions) {
    this.pool = options.pool;
    this.instanceId =
      typeof options.instanceId === "string" ? options.instanceId : "";
    this.onMessage("C2S_DungeonAttackIntent", (client, message: unknown) => {
      void this.handleAttack(client, message);
    });
  }

  override async onAuth(
    _client: Client,
    options: unknown,
  ): Promise<DungeonRoomAuth> {
    const ticket =
      typeof options === "object" && options !== null && "joinTicket" in options
        ? (options as { joinTicket?: unknown }).joinTicket
        : undefined;
    if (typeof ticket !== "string")
      throw new ServerError(401, "Dungeon join ticket is required.");
    try {
      const auth = await consumeDungeonRoomTicket(this.pool, ticket);
      if (auth.instanceId !== this.instanceId)
        throw new DungeonRuntimeError("DUNGEON_TICKET_INSTANCE_MISMATCH");
      return auth;
    } catch (error) {
      if (error instanceof DungeonRuntimeError)
        throw new ServerError(401, error.message);
      throw new ServerError(
        503,
        "Dungeon admission is temporarily unavailable.",
      );
    }
  }

  override onJoin(client: Client, _options: unknown, auth: DungeonRoomAuth) {
    this.members.set(client.sessionId, auth);
    client.send("S2C_DungeonJoined", {
      instanceId: auth.instanceId,
      dungeonId: auth.dungeonId,
      characterId: auth.characterId,
      status: "active",
    });
  }

  override onLeave(client: Client) {
    this.members.delete(client.sessionId);
    this.lastAttackAt.delete(client.sessionId);
  }

  private async handleAttack(client: Client, message: unknown) {
    const auth = this.members.get(client.sessionId);
    const intent = parseAttackIntent(message);
    if (!auth || !intent) {
      client.send("S2C_DungeonCombatResult", {
        accepted: false,
        reason: "INVALID_INTENT",
      });
      return;
    }
    const now = Date.now();
    if (
      now - (this.lastAttackAt.get(client.sessionId) ?? 0) <
      ATTACK_COOLDOWN_MS
    ) {
      client.send("S2C_DungeonCombatResult", {
        accepted: false,
        reason: "COOLDOWN",
      });
      return;
    }
    this.lastAttackAt.set(client.sessionId, now);
    try {
      const result = await applyDungeonBossDamage(this.pool, {
        instanceId: auth.instanceId,
        eventKey: randomUUID(),
        userId: auth.userId,
        characterId: auth.characterId,
        encounterId: intent.encounterId,
        damage: DAMAGE_BY_CLASS[auth.classId],
      });
      const envelope = {
        accepted: true,
        encounterId: intent.encounterId,
        damage: DAMAGE_BY_CLASS[auth.classId],
        currentHealth: result.currentHealth,
        defeated: result.defeated,
        completed: result.completed,
        reward: result.reward ?? null,
      };
      for (const recipient of this.clients)
        recipient.send("S2C_DungeonCombatResult", envelope);
    } catch (error) {
      const code =
        error instanceof DungeonRuntimeError
          ? error.code
          : "DUNGEON_COMBAT_UNAVAILABLE";
      client.send("S2C_DungeonCombatResult", { accepted: false, reason: code });
    }
  }
}

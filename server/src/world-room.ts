import { Room, ServerError } from "@colyseus/core";
import type { Client } from "@colyseus/core";
import type { Pool } from "pg";
import {
  PROTOCOL_VERSION,
  type RoomJoinSuccess,
  type WorldSnapshotEnvelope,
  type CombatResultEnvelope,
  type WorldEnemySnapshot,
  type RespawnedEnvelope,
  type RewardGrantedEnvelope,
} from "@shattered-firmament/shared/protocol";
import {
  COMBAT_RULES,
  parseCombatIntent,
  resolveBasicAttack,
} from "./combat.js";
import {
  ABILITIES,
  ABILITY_RULES,
  parseAbilityIntent,
  resolveAbility,
} from "./abilities.js";
import {
  ENEMY_DEFINITIONS,
  createWorldEnemies,
  isNearbySupportEligible,
  stepEnemy,
  type PveEnemy,
} from "./pve.js";
import {
  enqueueEnemyReward,
  processEnemyRewardOutbox,
  type EnemyRewardOutboxInput,
} from "./reward-outbox.js";
import {
  FACTION_START_ZONE,
  isPositionWalkable,
  isZoneAllowedForFaction,
  isZoneId,
  resolveZoneTransition,
  WORLD_ZONES,
  zoneFallbackSpawn,
  type FactionId,
} from "./zones.js";
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

interface EnemyRewardParticipant {
  userId: string;
  characterId: string;
  sessionId: string;
  damage: number;
  support: boolean;
}

interface WorldPlayerRuntime extends PlayerMovementState {
  userId: string;
  sessionId: string;
  characterId: string;
  classId: "vanguard" | "mystic" | "support";
  name: string;
  mapId: string;
  factionId: FactionId;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  abilityCooldowns: Map<string, number>;
  lastAbilityIntentAtMs: number;
  respawnAtMs: number;
  lastIntentAtMs: number;
  invalidIntentCount: number;
  lastCombatIntentAtMs: number;
  lastAttackAtMs: number;
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
  private readonly enemies = new Map<string, PveEnemy>();
  private readonly rewardEnqueueRetries = new Map<
    string,
    EnemyRewardOutboxInput
  >();
  private readonly enemyParticipants = new Map<
    string,
    Map<string, EnemyRewardParticipant>
  >();
  private readonly characterAbilityCooldowns = new Map<
    string,
    Map<string, number>
  >();
  private positionPersistenceQueue: Promise<void> = Promise.resolve();
  private positionCheckpointInFlight = false;
  private serverTick = 0;

  override onCreate(options: WorldRoomOptions) {
    this.pool = options.pool;
    for (const enemy of createWorldEnemies(Date.now()))
      this.enemies.set(enemy.id, enemy);
    this.onMessage("C2S_MoveIntent", (client, message: unknown) => {
      this.handleMoveIntent(client, message);
    });
    this.onMessage("C2S_CombatIntent", (client, message: unknown) => {
      this.handleCombatIntent(client, message);
    });
    this.onMessage("C2S_AbilityIntent", (client, message: unknown) => {
      this.handleAbilityIntent(client, message);
    });
    this.onMessage("C2S_ZoneTransition", (client, message: unknown) => {
      this.handleZoneTransition(client, message);
    });
    this.setSimulationInterval(() => {
      this.simulateWorld();
    }, 1000 / WORLD_MOVEMENT.tickRate);
    this.clock.setInterval(() => {
      void this.renewActiveLeases();
    }, 30_000);
    this.clock.setInterval(() => {
      void this.flushRewardEnqueueRetries();
      void processEnemyRewardOutbox(this.pool).catch((error: unknown) => {
        console.error("Failed to process PvE reward outbox", error);
      });
    }, 1_000);
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
    const factionId = auth.character.factionId;
    const mapId =
      isZoneId(auth.character.mapId) &&
      isZoneAllowedForFaction(auth.character.mapId, factionId)
        ? auth.character.mapId
        : FACTION_START_ZONE[factionId];
    const persistedPosition = auth.character.position;
    const safeSpawn = zoneFallbackSpawn(mapId);
    const positionIsWalkable = isPositionWalkable(
      mapId,
      persistedPosition.x,
      persistedPosition.y,
    );
    const state: WorldPlayerRuntime = {
      userId: auth.userId,
      sessionId: client.sessionId,
      characterId: auth.character.id,
      classId: auth.character.classId,
      name: auth.character.name,
      mapId,
      factionId,
      x: positionIsWalkable ? persistedPosition.x : safeSpawn.x,
      y: positionIsWalkable ? persistedPosition.y : safeSpawn.y,
      facing: Number.isFinite(persistedPosition.facing)
        ? persistedPosition.facing
        : 0,
      movementSequence: 0,
      axisX: 0,
      axisY: 0,
      health: auth.character.health,
      maxHealth: auth.character.maxHealth,
      mana: auth.character.mana,
      maxMana: auth.character.maxMana,
      abilityCooldowns:
        this.characterAbilityCooldowns.get(auth.character.id) ?? new Map(),
      lastAbilityIntentAtMs: 0,
      respawnAtMs:
        auth.character.health <= 0
          ? Date.now() + ABILITY_RULES.respawnDelayMs
          : 0,
      lastIntentAtMs: 0,
      invalidIntentCount: 0,
      lastCombatIntentAtMs: 0,
      lastAttackAtMs: 0,
    };
    this.characterAbilityCooldowns.set(
      auth.character.id,
      state.abilityCooldowns,
    );
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
          classId: auth.character.classId,
          name: auth.character.name,
          level: auth.character.level,
          mapId: state.mapId,
          position: {
            x: state.x,
            y: state.y,
            facing: state.facing,
          },
          health: state.health,
          maxHealth: state.maxHealth,
          mana: Math.floor(state.mana),
          maxMana: state.maxMana,
          movementSequence: state.movementSequence,
        },
        world: {
          tickRate: WORLD_MOVEMENT.tickRate,
          serverTick: this.serverTick,
          snapshotRate: WORLD_MOVEMENT.tickRate,
          mapRevision: "blockout-002",
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
    if (!state || state.health <= 0) return;

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

  private handleAbilityIntent(client: Client, message: unknown) {
    const actor = this.playerStates.get(client.sessionId);
    if (!actor || actor.health <= 0) return;
    const now = Date.now();
    if (now - actor.lastAbilityIntentAtMs < 100) return;
    actor.lastAbilityIntentAtMs = now;
    const intent = parseAbilityIntent(message);
    if (!intent) {
      this.sendCombatResult(client, actor.characterId, "", {
        accepted: false,
        reason: "INVALID_INTENT",
        damage: 0,
      });
      return;
    }
    const enemy = this.enemies.get(intent.targetId);
    const targetEntry = [...this.playerStates.entries()].find(
      ([, state]) => state.characterId === intent.targetId,
    );
    const targetPlayer = targetEntry?.[1];
    const target = enemy
      ? {
          characterId: enemy.id,
          factionId: "wild",
          mapId: enemy.mapId,
          x: enemy.x,
          y: enemy.y,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          kind: "enemy" as const,
        }
      : targetPlayer
        ? {
            characterId: targetPlayer.characterId,
            factionId: targetPlayer.factionId,
            mapId: targetPlayer.mapId,
            x: targetPlayer.x,
            y: targetPlayer.y,
            health: targetPlayer.health,
            maxHealth: targetPlayer.maxHealth,
            kind: "player" as const,
          }
        : undefined;
    const actorView = {
      characterId: actor.characterId,
      factionId: actor.factionId,
      classId: actor.classId,
      mapId: actor.mapId,
      x: actor.x,
      y: actor.y,
      health: actor.health,
      maxHealth: actor.maxHealth,
      resource: actor.mana,
    };
    const ability = ABILITIES[intent.abilityId];
    const result = resolveAbility({
      actor: actorView,
      target,
      abilityId: intent.abilityId,
      nowMs: now,
      lastUsedAtMs: actor.abilityCooldowns.get(intent.abilityId) ?? 0,
    });
    if (result.accepted && target) {
      actor.mana = result.resourceAfter ?? actor.mana;
      actor.abilityCooldowns.set(intent.abilityId, now);
      if (enemy) {
        const wasAlive = enemy.health > 0;
        if (wasAlive && result.damage > 0)
          this.recordEnemyParticipant(enemy, actor, result.damage, false);
        enemy.health = result.targetHealth ?? enemy.health;
        if (wasAlive && enemy.health <= 0) {
          enemy.respawnAtMs =
            now + ENEMY_DEFINITIONS[enemy.archetype].respawnDelayMs;
          enemy.aggroCharacterId = "";
          enemy.aiState = "dead";
          enemy.telegraphEndsAtMs = 0;
          const participants = [
            ...(this.enemyParticipants.get(enemy.id)?.values() ?? []),
          ].filter(
            (participant) =>
              participant.support ||
              participant.damage >= enemy.maxHealth * 0.05,
          );
          this.enemyParticipants.delete(enemy.id);
          const eventKey = `${enemy.id}:${enemy.respawnAtMs}`;
          for (const participant of participants)
            void this.queueEnemyReward(participant, enemy, eventKey);
        }
      } else if (targetPlayer) {
        targetPlayer.health = result.targetHealth ?? targetPlayer.health;
        if (targetPlayer.health <= 0)
          targetPlayer.respawnAtMs = now + ABILITY_RULES.respawnDelayMs;
        if (result.healing > 0) {
          for (const engagedEnemy of this.enemies.values()) {
            if (
              engagedEnemy.health > 0 &&
              isNearbySupportEligible({
                healer: { x: actor.x, y: actor.y, mapId: actor.mapId },
                target: { ...targetPlayer, mapId: targetPlayer.mapId },
                enemy: { ...engagedEnemy, mapId: engagedEnemy.mapId },
                targetParticipated:
                  this.enemyParticipants
                    .get(engagedEnemy.id)
                    ?.has(targetPlayer.characterId) ?? false,
              })
            ) {
              this.recordEnemyParticipant(engagedEnemy, actor, 0, true);
            }
          }
        }
        void this.queuePositionPersistence([targetPlayer]);
      }
      void this.queuePositionPersistence([actor]);
    }
    const envelope: CombatResultEnvelope = {
      type: "S2C_CombatResult",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        accepted: result.accepted,
        attackerCharacterId: actor.characterId,
        targetCharacterId: intent.targetId,
        damage: result.damage,
        healing: result.healing,
        ...(result.targetHealth === undefined
          ? {}
          : { targetHealth: result.targetHealth }),
        ...(result.resourceAfter === undefined
          ? {}
          : { resourceAfter: result.resourceAfter }),
        abilityId: intent.abilityId,
        reason: result.reason ?? null,
        serverTick: this.serverTick,
      },
    };
    if (result.accepted) {
      for (const recipient of this.clients) {
        const recipientState = this.playerStates.get(recipient.sessionId);
        if (recipientState?.mapId === actor.mapId)
          recipient.send("S2C_CombatResult", envelope);
      }
    } else client.send("S2C_CombatResult", envelope);
  }

  private recordEnemyParticipant(
    enemy: PveEnemy,
    actor: WorldPlayerRuntime,
    damage: number,
    support: boolean,
  ) {
    let participants = this.enemyParticipants.get(enemy.id);
    if (!participants) {
      participants = new Map();
      this.enemyParticipants.set(enemy.id, participants);
    }
    const existing = participants.get(actor.characterId);
    participants.set(actor.characterId, {
      userId: actor.userId,
      characterId: actor.characterId,
      sessionId: actor.sessionId,
      damage: (existing?.damage ?? 0) + damage,
      support: support || (existing?.support ?? false),
    });
  }

  private async queueEnemyReward(
    participant: EnemyRewardParticipant,
    enemy: PveEnemy,
    eventKey: string,
  ) {
    const input: EnemyRewardOutboxInput = {
      eventKey,
      userId: participant.userId,
      characterId: participant.characterId,
      archetype: enemy.archetype,
      enemyLevel: ENEMY_DEFINITIONS[enemy.archetype].level,
    };
    const retryKey = `${eventKey}:${participant.characterId}`;
    try {
      await enqueueEnemyReward(this.pool, input);
      this.rewardEnqueueRetries.delete(retryKey);
      await this.deliverPersistedReward(input, participant.sessionId);
    } catch (error) {
      // Retain transient enqueue failures in memory; the DB outbox survives restarts after insert.
      this.rewardEnqueueRetries.set(retryKey, input);
      console.error("Failed to enqueue PvE reward; retry retained in memory", {
        eventKey,
        characterId: participant.characterId,
        error,
      });
    }
  }

  private async flushRewardEnqueueRetries() {
    for (const [retryKey, input] of this.rewardEnqueueRetries) {
      try {
        await enqueueEnemyReward(this.pool, input);
        this.rewardEnqueueRetries.delete(retryKey);
      } catch {
        /* Retry on next tick; do not discard unpersisted rewards. */
      }
    }
  }

  private async deliverPersistedReward(
    input: EnemyRewardOutboxInput,
    sessionId: string,
  ) {
    try {
      await processEnemyRewardOutbox(this.pool);
      const claim = await this.pool.query<{
        experience_awarded: number;
        silver_awarded: number;
        loot: RewardGrantedEnvelope["payload"]["loot"];
        level: number;
        experience: string;
        silver: string;
      }>(
        `SELECT r.experience_awarded, r.silver_awarded, r.loot, c.level, c.experience, w.balance AS silver
         FROM character_reward_claims r JOIN characters c ON c.id = r.character_id
         JOIN currency_wallets w ON w.user_id = r.user_id AND w.currency_code = 'silver'
         WHERE r.event_key = $1 AND r.character_id = $2`,
        [input.eventKey, input.characterId],
      );
      const row = claim.rows[0];
      if (!row) return;
      const client = this.clients.find(
        (candidate) => candidate.sessionId === sessionId,
      );
      const envelope: RewardGrantedEnvelope = {
        type: "S2C_RewardGranted",
        protocolVersion: PROTOCOL_VERSION,
        payload: {
          sourceId: input.archetype,
          experienceAwarded: row.experience_awarded,
          totalExperience: Number(row.experience),
          level: row.level,
          silverAwarded: row.silver_awarded,
          totalSilver: Number(row.silver),
          loot: row.loot,
        },
      };
      client?.send("S2C_RewardGranted", envelope);
    } catch (error) {
      console.error("Failed to notify persisted PvE reward", {
        eventKey: input.eventKey,
        characterId: input.characterId,
        error,
      });
    }
  }
  private handleZoneTransition(client: Client, message: unknown) {
    const state = this.playerStates.get(client.sessionId);
    if (
      !state ||
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    )
      return;
    const candidate = message as Record<string, unknown>;
    if (
      Object.keys(candidate).some((key) => key !== "targetMapId") ||
      typeof candidate.targetMapId !== "string"
    ) {
      client.send("S2C_ZoneTransitionRejected", {
        type: "S2C_ZoneTransitionRejected",
        protocolVersion: PROTOCOL_VERSION,
        payload: { message: "Invalid transition request." },
      });
      return;
    }
    const transition = resolveZoneTransition({
      sourceMapId: state.mapId,
      targetMapId: candidate.targetMapId,
      factionId: state.factionId,
      x: state.x,
      y: state.y,
    });
    if (!transition) {
      client.send("S2C_ZoneTransitionRejected", {
        type: "S2C_ZoneTransitionRejected",
        protocolVersion: PROTOCOL_VERSION,
        payload: {
          message: "Reach an authorised zone gate before changing regions.",
        },
      });
      return;
    }
    state.axisX = 0;
    state.axisY = 0;
    state.mapId = transition.mapId;
    state.x = transition.x;
    state.y = transition.y;
    client.send("S2C_ZoneTransitioned", {
      type: "S2C_ZoneTransitioned",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        mapId: state.mapId,
        position: { x: state.x, y: state.y, facing: state.facing },
        safeZone: WORLD_ZONES[transition.mapId].safeZone,
        pvpEnabled: WORLD_ZONES[transition.mapId].pvpEnabled,
      },
    });
  }

  private handleCombatIntent(client: Client, message: unknown) {
    const attacker = this.playerStates.get(client.sessionId);
    if (!attacker) return;
    const now = Date.now();
    if (
      now - attacker.lastCombatIntentAtMs <
      COMBAT_RULES.intentMinimumIntervalMs
    )
      return;
    attacker.lastCombatIntentAtMs = now;
    const intent = parseCombatIntent(message);
    if (!intent) {
      this.sendCombatResult(client, attacker.characterId, "", {
        accepted: false,
        reason: "INVALID_INTENT",
        damage: 0,
      });
      return;
    }
    const targetEntry = [...this.playerStates.entries()].find(
      ([, state]) => state.characterId === intent.targetCharacterId,
    );
    const target = targetEntry?.[1];
    const result = resolveBasicAttack({
      attacker: {
        characterId: attacker.characterId,
        factionId: attacker.factionId,
        mapId: attacker.mapId,
        x: attacker.x,
        y: attacker.y,
        health: attacker.health,
        maxHealth: attacker.maxHealth,
      },
      target: target
        ? {
            characterId: target.characterId,
            factionId: target.factionId,
            mapId: target.mapId,
            x: target.x,
            y: target.y,
            health: target.health,
            maxHealth: target.maxHealth,
          }
        : undefined,
      nowMs: now,
      lastAttackAtMs: attacker.lastAttackAtMs,
    });
    if (result.accepted && target) {
      target.health = result.targetHealth ?? target.health;
      attacker.lastAttackAtMs = now;
      if (target.health <= 0)
        target.respawnAtMs = now + ABILITY_RULES.respawnDelayMs;
      void this.queuePositionPersistence([target]);
    }
    const envelope: CombatResultEnvelope = {
      type: "S2C_CombatResult",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        accepted: result.accepted,
        attackerCharacterId: attacker.characterId,
        targetCharacterId: intent.targetCharacterId,
        damage: result.damage,
        ...(result.targetHealth === undefined
          ? {}
          : { targetHealth: result.targetHealth }),
        reason: result.reason ?? null,
        serverTick: this.serverTick,
      },
    };
    if (result.accepted && target) {
      for (const recipient of this.clients) {
        const recipientState = this.playerStates.get(recipient.sessionId);
        if (recipientState?.mapId === attacker.mapId)
          recipient.send("S2C_CombatResult", envelope);
      }
    } else {
      client.send("S2C_CombatResult", envelope);
    }
  }

  private sendCombatResult(
    client: Client,
    attackerCharacterId: string,
    targetCharacterId: string,
    result: {
      accepted: boolean;
      reason?: string;
      damage: number;
      targetHealth?: number;
    },
  ) {
    const envelope: CombatResultEnvelope = {
      type: "S2C_CombatResult",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        accepted: result.accepted,
        attackerCharacterId,
        targetCharacterId,
        damage: result.damage,
        ...(result.targetHealth === undefined
          ? {}
          : { targetHealth: result.targetHealth }),
        reason: result.reason ?? null,
        serverTick: this.serverTick,
      },
    };
    client.send("S2C_CombatResult", envelope);
  }
  private simulateWorld() {
    this.serverTick += 1;
    const now = Date.now();
    for (const state of this.playerStates.values()) {
      if (state.health <= 0) {
        if (state.respawnAtMs > 0 && now >= state.respawnAtMs) {
          const respawnMap = FACTION_START_ZONE[state.factionId];
          state.mapId = respawnMap;
          const spawn = zoneFallbackSpawn(respawnMap);
          state.x = spawn.x;
          state.y = spawn.y;
          state.facing = 0;
          state.health = state.maxHealth;
          state.mana = state.maxMana;
          state.respawnAtMs = 0;
          state.axisX = 0;
          state.axisY = 0;
          const client = this.clients.find(
            (candidate) => candidate.sessionId === state.sessionId,
          );
          const respawned: RespawnedEnvelope = {
            type: "S2C_Respawned",
            protocolVersion: PROTOCOL_VERSION,
            payload: {
              mapId: state.mapId,
              position: { x: state.x, y: state.y, facing: state.facing },
              health: state.health,
              maxHealth: state.maxHealth,
              mana: state.mana,
              maxMana: state.maxMana,
            },
          };
          client?.send("S2C_Respawned", respawned);
          void this.queuePositionPersistence([state]);
        }
        continue;
      }
      state.mana = Math.min(
        state.maxMana,
        state.mana +
          ABILITY_RULES.resourceRegenerationPerSecond *
            WORLD_MOVEMENT.stepSeconds,
      );
      stepPlayerMovement(state, WORLD_MOVEMENT.stepSeconds, state.mapId);
    }
    for (const enemy of this.enemies.values()) {
      const result = stepEnemy(
        enemy,
        [...this.playerStates.values()],
        WORLD_MOVEMENT.stepSeconds,
        now,
      );
      if (!result) continue;
      const target = [...this.playerStates.values()].find(
        (state) => state.characterId === result.targetCharacterId,
      );
      if (!target || target.health <= 0) continue;
      target.health = Math.max(0, target.health - result.damage);
      if (target.health <= 0)
        target.respawnAtMs = now + ABILITY_RULES.respawnDelayMs;
      void this.queuePositionPersistence([target]);
      this.broadcastCombatResult(target.mapId, {
        accepted: true,
        attackerCharacterId: enemy.id,
        targetCharacterId: target.characterId,
        damage: result.damage,
        reason: null,
      });
    }
    if (this.clients.length === 0) return;
    const serverTime = new Date().toISOString();
    for (const client of this.clients) {
      const recipient = this.playerStates.get(client.sessionId);
      if (!recipient) continue;
      const snapshot: WorldSnapshotEnvelope = {
        type: "S2C_WorldSnapshot",
        protocolVersion: PROTOCOL_VERSION,
        payload: {
          serverTick: this.serverTick,
          serverTime,
          players: [...this.playerStates.values()]
            .filter((state) => state.mapId === recipient.mapId)
            .map((state) => ({
              characterId: state.characterId,
              name: state.name,
              classId: state.classId,
              mapId: state.mapId,
              position: { x: state.x, y: state.y, facing: state.facing },
              movementSequence: state.movementSequence,
              health: state.health,
              maxHealth: state.maxHealth,
              mana: Math.floor(state.mana),
              maxMana: state.maxMana,
            })),
          enemies: [...this.enemies.values()]
            .filter((enemy) => enemy.mapId === recipient.mapId)
            .map((enemy): WorldEnemySnapshot => ({
              id: enemy.id,
              name: enemy.name,
              mapId: enemy.mapId,
              position: { x: enemy.x, y: enemy.y },
              health: enemy.health,
              maxHealth: enemy.maxHealth,
              archetype: enemy.archetype,
              attackStyle: enemy.attackStyle,
              aiState: enemy.aiState,
              telegraphEndsAtMs: enemy.telegraphEndsAtMs,
              targetCharacterId: enemy.aggroCharacterId,
            })),
        },
      };
      client.send("S2C_WorldSnapshot", snapshot);
    }
  }
  private broadcastCombatResult(
    mapId: string,
    result: {
      accepted: boolean;
      attackerCharacterId: string;
      targetCharacterId: string;
      damage: number;
      reason: string | null;
    },
  ) {
    const envelope: CombatResultEnvelope = {
      type: "S2C_CombatResult",
      protocolVersion: PROTOCOL_VERSION,
      payload: { ...result, serverTick: this.serverTick },
    };
    for (const client of this.clients)
      if (this.playerStates.get(client.sessionId)?.mapId === mapId)
        client.send("S2C_CombatResult", envelope);
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
      map_id: state.mapId,
      facing: state.facing,
      health: state.health,
      mana: Math.floor(state.mana),
    }));

    this.positionPersistenceQueue = this.positionPersistenceQueue
      .then(async () => {
        await this.pool.query(
          "UPDATE characters AS c\n" +
            "SET position_x = p.position_x,\n" +
            "    position_y = p.position_y,\n" +
            "    active_map_id = p.map_id,\n" +
            "    facing = p.facing,\n" +
            "    health = p.health,\n" +
            "    mana = p.mana,\n" +
            "    updated_at = now(),\n" +
            "    last_played_at = now()\n" +
            "FROM jsonb_to_recordset($1::jsonb) AS p(\n" +
            "  character_id UUID,\n" +
            "  user_id UUID,\n" +
            "  position_x DOUBLE PRECISION,\n" +
            "  position_y DOUBLE PRECISION,\n" +
            "  map_id TEXT,\n" +
            "  facing DOUBLE PRECISION,\n" +
            "  health INTEGER,\n" +
            "  mana INTEGER\n" +
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

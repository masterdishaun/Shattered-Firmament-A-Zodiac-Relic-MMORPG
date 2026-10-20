export const PROTOCOL_VERSION = 1 as const;
export interface ErrorEnvelope {
  type: "S2C_Error";
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId?: string;
  payload: {
    code:
      | "PROTOCOL_UNSUPPORTED"
      | "AUTH_INVALID"
      | "JOIN_TICKET_EXPIRED"
      | "JOIN_TICKET_REPLAYED"
      | "CHARACTER_NOT_OWNED"
      | "CHARACTER_ALREADY_ACTIVE"
      | "ROOM_UNAVAILABLE"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR";
    message: string;
    retryable: boolean;
  };
}
export interface RoomJoinSuccess {
  type: "S2C_RoomJoinSuccess";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    sessionId: string;
    roomId: string;
    shardId: string;
    character: {
      characterId: string;
      name: string;
      classId: string;
      level: number;
      mapId: string;
      position: { x: number; y: number; facing: number };
      health: number;
      maxHealth: number;
      mana: number;
      maxMana: number;
      movementSequence: number;
    };
    world: {
      tickRate: 20;
      serverTick: number;
      snapshotRate: number;
      mapRevision: string;
    };
    serverTime: string;
  };
}
export interface ClientMoveIntent {
  sequence: number;
  axisX: number;
  axisY: number;
}
export interface ClientCombatIntent {
  targetCharacterId: string;
}
export interface ClientAbilityIntent {
  abilityId: string;
  targetId: string;
}
export interface CombatResultEnvelope {
  type: "S2C_CombatResult";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    accepted: boolean;
    attackerCharacterId: string;
    targetCharacterId: string;
    damage: number;
    healing?: number;
    targetHealth?: number;
    resourceAfter?: number;
    abilityId?: string;
    reason: string | null;
    serverTick: number;
  };
}
export interface RespawnedEnvelope {
  type: "S2C_Respawned";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    mapId: string;
    position: { x: number; y: number; facing: number };
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
  };
}
export interface WorldPlayerSnapshot {
  characterId: string;
  name: string;
  classId: string;
  mapId: string;
  position: { x: number; y: number; facing: number };
  movementSequence: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}
export interface WorldEnemySnapshot {
  id: string;
  name: string;
  mapId: string;
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
  archetype: "ashen-wisp" | "jadebound-sentinel" | "rift-stalker";
  attackStyle: "ranged" | "heavy-melee" | "quick-melee";
  aiState: "idle" | "approach" | "telegraph" | "recover" | "dead";
  telegraphEndsAtMs: number;
  targetCharacterId: string;
}
export interface WorldSnapshotEnvelope {
  type: "S2C_WorldSnapshot";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    serverTick: number;
    serverTime: string;
    players: WorldPlayerSnapshot[];
    enemies: WorldEnemySnapshot[];
  };
}
export interface RewardGrantedEnvelope {
  type: "S2C_RewardGranted";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    sourceId: string;
    experienceAwarded: number;
    totalExperience: number;
    level: number;
    silverAwarded: number;
    totalSilver: number;
    loot: { itemId: string; quantity: number; tradeable: boolean }[];
  };
}

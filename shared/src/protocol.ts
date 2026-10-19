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
      level: number;
      mapId: string;
      position: { x: number; y: number; facing: number };
      health: number;
      maxHealth: number;
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

export interface WorldPlayerSnapshot {
  characterId: string;
  name: string;
  mapId: string;
  position: { x: number; y: number; facing: number };
  movementSequence: number;
  health: number;
  maxHealth: number;
}

export interface WorldSnapshotEnvelope {
  type: "S2C_WorldSnapshot";
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: {
    serverTick: number;
    serverTime: string;
    players: WorldPlayerSnapshot[];
  };
}

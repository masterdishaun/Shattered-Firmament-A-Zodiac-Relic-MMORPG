export type EnemyArchetypeId =
  "ashen-wisp" | "jadebound-sentinel" | "rift-stalker";
export type EnemyAiState =
  "idle" | "approach" | "telegraph" | "recover" | "dead";
export type EnemyAttackStyle = "ranged" | "heavy-melee" | "quick-melee";
export interface PveEnemy {
  id: string;
  archetype: EnemyArchetypeId;
  attackStyle: EnemyAttackStyle;
  name: string;
  level: number;
  mapId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  aggroCharacterId: string;
  aiState: EnemyAiState;
  telegraphEndsAtMs: number;
  nextAttackAtMs: number;
  respawnAtMs: number;
}
export interface NearbySupportEligibilityInput {
  healer: { x: number; y: number; mapId: string };
  target: { x: number; y: number; mapId: string; characterId: string };
  enemy: { x: number; y: number; mapId: string; aggroCharacterId: string };
  targetParticipated: boolean;
}

/** Support healing qualifies only for an engaged ally and while both players are near that enemy. */
export function isNearbySupportEligible(
  input: NearbySupportEligibilityInput,
): boolean {
  const { healer, target, enemy } = input;
  if (healer.mapId !== enemy.mapId || target.mapId !== enemy.mapId)
    return false;
  if (
    !input.targetParticipated &&
    enemy.aggroCharacterId !== target.characterId
  )
    return false;
  return (
    Math.hypot(target.x - enemy.x, target.y - enemy.y) <= 12 &&
    Math.hypot(healer.x - enemy.x, healer.y - enemy.y) <= 12
  );
}

export interface PvePlayer {
  characterId: string;
  mapId: string;
  x: number;
  y: number;
  health: number;
}
export interface EnemyStepResult {
  targetCharacterId: string;
  damage: number;
  enemyId: string;
  attackStyle: EnemyAttackStyle;
}
export interface EnemyDefinition {
  id: EnemyArchetypeId;
  name: string;
  level: number;
  mapId: string;
  x: number;
  y: number;
  maxHealth: number;
  damage: number;
  aggroRange: number;
  leashRange: number;
  attackRange: number;
  attackCooldownMs: number;
  telegraphDurationMs: number;
  moveSpeed: number;
  respawnDelayMs: number;
  attackStyle: EnemyAttackStyle;
}
export const ENEMY_DEFINITIONS: Record<EnemyArchetypeId, EnemyDefinition> = {
  "ashen-wisp": {
    id: "ashen-wisp",
    name: "Ashen Wisp",
    level: 1,
    mapId: "zone.ashen-frontier",
    x: 3,
    y: -23,
    maxHealth: 90,
    damage: 8,
    aggroRange: 7,
    leashRange: 12,
    attackRange: 5,
    attackCooldownMs: 2200,
    telegraphDurationMs: 750,
    moveSpeed: 1.8,
    respawnDelayMs: 8000,
    attackStyle: "ranged",
  },
  "jadebound-sentinel": {
    id: "jadebound-sentinel",
    name: "Jadebound Sentinel",
    level: 3,
    mapId: "zone.ashen-frontier",
    x: -3,
    y: -24,
    maxHealth: 180,
    damage: 16,
    aggroRange: 6,
    leashRange: 10,
    attackRange: 1.7,
    attackCooldownMs: 2800,
    telegraphDurationMs: 1000,
    moveSpeed: 1.05,
    respawnDelayMs: 10000,
    attackStyle: "heavy-melee",
  },
  "rift-stalker": {
    id: "rift-stalker",
    name: "Rift Stalker",
    level: 2,
    mapId: "zone.ashen-frontier",
    x: 7,
    y: -25,
    maxHealth: 72,
    damage: 11,
    aggroRange: 8,
    leashRange: 14,
    attackRange: 1.4,
    attackCooldownMs: 1800,
    telegraphDurationMs: 500,
    moveSpeed: 2.8,
    respawnDelayMs: 7000,
    attackStyle: "quick-melee",
  },
};
export const ASHEN_WISP = {
  ...ENEMY_DEFINITIONS["ashen-wisp"],
  id: "enemy:ashen-wisp-01",
} as const;
export const ENEMY_SPAWNS: readonly {
  archetype: EnemyArchetypeId;
  id: string;
}[] = [
  { archetype: "ashen-wisp", id: "enemy:ashen-wisp-01" },
  { archetype: "jadebound-sentinel", id: "enemy:jadebound-sentinel-01" },
  { archetype: "rift-stalker", id: "enemy:rift-stalker-01" },
];
export function createEnemy(
  archetype: EnemyArchetypeId,
  nowMs = 0,
  instanceId?: string,
): PveEnemy {
  const definition = ENEMY_DEFINITIONS[archetype];
  return {
    id: instanceId ?? "enemy:" + archetype + "-01",
    archetype,
    attackStyle: definition.attackStyle,
    name: definition.name,
    level: definition.level,
    mapId: definition.mapId,
    x: definition.x,
    y: definition.y,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    aggroCharacterId: "",
    aiState: "idle",
    telegraphEndsAtMs: 0,
    nextAttackAtMs: nowMs,
    respawnAtMs: 0,
  };
}
export function createAshenWisp(nowMs = 0): PveEnemy {
  return createEnemy("ashen-wisp", nowMs, ASHEN_WISP.id);
}
export function createWorldEnemies(nowMs = 0): PveEnemy[] {
  return ENEMY_SPAWNS.map(({ archetype, id }) =>
    createEnemy(archetype, nowMs, id),
  );
}
export function stepEnemy(
  enemy: PveEnemy,
  players: readonly PvePlayer[],
  deltaSeconds: number,
  nowMs: number,
): EnemyStepResult | null {
  const definition = ENEMY_DEFINITIONS[enemy.archetype];
  if (enemy.health <= 0) {
    enemy.aiState = "dead";
    enemy.telegraphEndsAtMs = 0;
    if (enemy.respawnAtMs > 0 && nowMs >= enemy.respawnAtMs)
      Object.assign(enemy, createEnemy(enemy.archetype, nowMs, enemy.id));
    return null;
  }
  const previousTargetId = enemy.aggroCharacterId;
  let target = players.find((player) => {
    if (
      player.characterId !== previousTargetId ||
      player.mapId !== enemy.mapId ||
      player.health <= 0
    )
      return false;
    return (
      Math.hypot(player.x - enemy.x, player.y - enemy.y) <=
      definition.leashRange
    );
  });
  if (!target) {
    target = players
      .filter((player) => player.mapId === enemy.mapId && player.health > 0)
      .map((player) => ({
        player,
        distance: Math.hypot(player.x - enemy.x, player.y - enemy.y),
      }))
      .filter((candidate) => candidate.distance <= definition.aggroRange)
      .sort((a, b) => a.distance - b.distance)[0]?.player;
    const nextTargetId = target?.characterId ?? "";
    enemy.aggroCharacterId = nextTargetId;
    if (nextTargetId !== previousTargetId) {
      // A new target must always receive a complete, fresh attack warning.
      enemy.aiState = "idle";
      enemy.telegraphEndsAtMs = 0;
    }
  }
  if (!target) {
    enemy.aiState = "idle";
    enemy.telegraphEndsAtMs = 0;
    return null;
  }
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance > definition.attackRange && distance > 0) {
    enemy.aiState = "approach";
    enemy.telegraphEndsAtMs = 0;
    const step = Math.min(
      distance - definition.attackRange,
      definition.moveSpeed * Math.max(0, Math.min(deltaSeconds, 0.1)),
    );
    enemy.x += (dx / distance) * step;
    enemy.y += (dy / distance) * step;
    return null;
  }
  if (nowMs < enemy.nextAttackAtMs) {
    enemy.aiState = "recover";
    enemy.telegraphEndsAtMs = 0;
    return null;
  }
  if (enemy.aiState !== "telegraph") {
    enemy.aiState = "telegraph";
    enemy.telegraphEndsAtMs = nowMs + definition.telegraphDurationMs;
    return null;
  }
  if (nowMs < enemy.telegraphEndsAtMs) return null;
  enemy.aiState = "recover";
  enemy.telegraphEndsAtMs = 0;
  enemy.nextAttackAtMs = nowMs + definition.attackCooldownMs;
  return {
    targetCharacterId: target.characterId,
    damage: definition.damage,
    enemyId: enemy.id,
    attackStyle: definition.attackStyle,
  };
}

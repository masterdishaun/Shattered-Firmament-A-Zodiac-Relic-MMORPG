export interface PveEnemy {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  aggroCharacterId: string;
  nextAttackAtMs: number;
  respawnAtMs: number;
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
}
export const ASHEN_WISP = {
  id: "enemy:ashen-wisp-01",
  name: "Ashen Wisp",
  mapId: "zone.ashen-frontier",
  x: 3,
  y: -23,
  maxHealth: 90,
  damage: 8,
  aggroRange: 7,
  attackRange: 1.5,
  attackCooldownMs: 2_000,
  moveSpeed: 1.8,
  respawnDelayMs: 8_000,
} as const;
export function createAshenWisp(nowMs = 0): PveEnemy {
  return {
    id: ASHEN_WISP.id,
    name: ASHEN_WISP.name,
    mapId: ASHEN_WISP.mapId,
    x: ASHEN_WISP.x,
    y: ASHEN_WISP.y,
    health: ASHEN_WISP.maxHealth,
    maxHealth: ASHEN_WISP.maxHealth,
    aggroCharacterId: "",
    nextAttackAtMs: nowMs,
    respawnAtMs: 0,
  };
}
export function stepEnemy(
  enemy: PveEnemy,
  players: readonly PvePlayer[],
  deltaSeconds: number,
  nowMs: number,
): EnemyStepResult | null {
  if (enemy.health <= 0) {
    if (enemy.respawnAtMs > 0 && nowMs >= enemy.respawnAtMs)
      Object.assign(enemy, createAshenWisp(nowMs));
    return null;
  }
  let target = players.find(
    (player) =>
      player.characterId === enemy.aggroCharacterId &&
      player.mapId === enemy.mapId &&
      player.health > 0,
  );
  if (!target) {
    target = players
      .filter((player) => player.mapId === enemy.mapId && player.health > 0)
      .map((player) => ({
        player,
        distance: Math.hypot(player.x - enemy.x, player.y - enemy.y),
      }))
      .filter((candidate) => candidate.distance <= ASHEN_WISP.aggroRange)
      .sort((a, b) => a.distance - b.distance)[0]?.player;
    enemy.aggroCharacterId = target?.characterId ?? "";
  }
  if (!target) return null;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance > ASHEN_WISP.attackRange && distance > 0) {
    const step = Math.min(
      distance - ASHEN_WISP.attackRange,
      ASHEN_WISP.moveSpeed * Math.max(0, Math.min(deltaSeconds, 0.1)),
    );
    enemy.x += (dx / distance) * step;
    enemy.y += (dy / distance) * step;
    return null;
  }
  if (nowMs < enemy.nextAttackAtMs) return null;
  enemy.nextAttackAtMs = nowMs + ASHEN_WISP.attackCooldownMs;
  return { targetCharacterId: target.characterId, damage: ASHEN_WISP.damage };
}

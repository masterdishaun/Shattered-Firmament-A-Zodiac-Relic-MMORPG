import { isZoneId, WORLD_ZONES } from "./zones.js";
const WORLD_COMBAT_ZONES = WORLD_ZONES;

export const COMBAT_RULES = {
  meleeRange: 2.5,
  basicAttackDamage: 20,
  cooldownMs: 1_000,
  intentMinimumIntervalMs: 100,
} as const;

export interface Combatant {
  characterId: string;
  factionId: string;
  mapId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

export interface CombatState {
  attacker: Combatant;
  target: Combatant | undefined;
  nowMs: number;
  lastAttackAtMs: number;
}

export type CombatRejection =
  | "INVALID_INTENT"
  | "TARGET_NOT_FOUND"
  | "SELF_TARGET"
  | "TARGET_DEAD"
  | "ATTACKER_DEAD"
  | "DIFFERENT_ZONE"
  | "SAFE_ZONE"
  | "SAME_FACTION"
  | "OUT_OF_RANGE"
  | "COOLDOWN";

export interface CombatResolution {
  accepted: boolean;
  reason?: CombatRejection;
  damage: number;
  targetHealth?: number;
  cooldownRemainingMs?: number;
}

export function parseCombatIntent(
  message: unknown,
): { targetCharacterId: string } | null {
  if (typeof message !== "object" || message === null || Array.isArray(message))
    return null;
  const candidate = message as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 1 ||
    Object.keys(candidate).some((key) => key !== "targetCharacterId") ||
    typeof candidate.targetCharacterId !== "string" ||
    candidate.targetCharacterId.length < 1 ||
    candidate.targetCharacterId.length > 64
  )
    return null;
  return { targetCharacterId: candidate.targetCharacterId };
}

export function resolveBasicAttack(state: CombatState): CombatResolution {
  const { attacker, target, nowMs, lastAttackAtMs } = state;
  if (!target)
    return { accepted: false, reason: "TARGET_NOT_FOUND", damage: 0 };
  if (attacker.characterId === target.characterId)
    return { accepted: false, reason: "SELF_TARGET", damage: 0 };
  if (attacker.health <= 0)
    return { accepted: false, reason: "ATTACKER_DEAD", damage: 0 };
  if (target.health <= 0)
    return { accepted: false, reason: "TARGET_DEAD", damage: 0 };
  if (attacker.mapId !== target.mapId)
    return { accepted: false, reason: "DIFFERENT_ZONE", damage: 0 };
  const zone = isZoneId(attacker.mapId)
    ? WORLD_COMBAT_ZONES[attacker.mapId]
    : undefined;
  if (!zone || zone.safeZone || !zone.pvpEnabled)
    return { accepted: false, reason: "SAFE_ZONE", damage: 0 };
  if (attacker.factionId === target.factionId)
    return { accepted: false, reason: "SAME_FACTION", damage: 0 };
  const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y);
  if (!Number.isFinite(distance) || distance > COMBAT_RULES.meleeRange)
    return { accepted: false, reason: "OUT_OF_RANGE", damage: 0 };
  const elapsed = nowMs - lastAttackAtMs;
  if (lastAttackAtMs > 0 && elapsed < COMBAT_RULES.cooldownMs)
    return {
      accepted: false,
      reason: "COOLDOWN",
      damage: 0,
      cooldownRemainingMs: COMBAT_RULES.cooldownMs - Math.max(0, elapsed),
    };
  const damage = Math.min(COMBAT_RULES.basicAttackDamage, target.health);
  target.health = Math.max(0, target.health - damage);
  return { accepted: true, damage, targetHealth: target.health };
}

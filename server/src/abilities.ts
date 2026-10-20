import type { Combatant } from "./combat.js";

export const ABILITY_RULES = {
  resourceMaximum: 100,
  resourceRegenerationPerSecond: 4,
  respawnDelayMs: 5_000,
} as const;

export interface AbilityDefinition {
  id: string;
  classId:
    | "any"
    | "vanguard"
    | "blade_dancer"
    | "spear_saint"
    | "shadow_adept"
    | "mystic"
    | "support"
    | "storm_caller"
    | "iron_fist";
  targetKind: "enemy" | "ally";
  range: number;
  cooldownMs: number;
  resourceCost: number;
  damage: number;
  healing: number;
}

export const ABILITIES: Record<string, AbilityDefinition> = {
  "basic-strike": {
    id: "basic-strike",
    classId: "any",
    targetKind: "enemy",
    range: 2.5,
    cooldownMs: 1000,
    resourceCost: 0,
    damage: 20,
    healing: 0,
  },
  "iron-breaker": {
    id: "iron-breaker",
    classId: "vanguard",
    targetKind: "enemy",
    range: 2.8,
    cooldownMs: 4000,
    resourceCost: 15,
    damage: 48,
    healing: 0,
  },
  starfall: {
    id: "starfall",
    classId: "mystic",
    targetKind: "enemy",
    range: 8,
    cooldownMs: 5000,
    resourceCost: 35,
    damage: 42,
    healing: 0,
  },
  "resonant-pulse": {
    id: "resonant-pulse",
    classId: "support",
    targetKind: "enemy",
    range: 5,
    cooldownMs: 3000,
    resourceCost: 15,
    damage: 18,
    healing: 0,
  },
  "jade-strike": {
    id: "jade-strike",
    classId: "vanguard",
    targetKind: "enemy",
    range: 3,
    cooldownMs: 1_500,
    resourceCost: 0,
    damage: 32,
    healing: 0,
  },
  "astral-bolt": {
    id: "astral-bolt",
    classId: "mystic",
    targetKind: "enemy",
    range: 7,
    cooldownMs: 2_000,
    resourceCost: 20,
    damage: 24,
    healing: 0,
  },
  "spirit-mend": {
    id: "spirit-mend",
    classId: "support",
    targetKind: "ally",
    range: 6,
    cooldownMs: 4_000,
    resourceCost: 25,
    damage: 0,
    healing: 28,
  },
  "flowing-edge": {
    id: "flowing-edge",
    classId: "blade_dancer",
    targetKind: "enemy",
    range: 3,
    cooldownMs: 1_500,
    resourceCost: 8,
    damage: 30,
    healing: 0,
  },
  "eclipse-flurry": {
    id: "eclipse-flurry",
    classId: "blade_dancer",
    targetKind: "enemy",
    range: 3.5,
    cooldownMs: 4_000,
    resourceCost: 25,
    damage: 48,
    healing: 0,
  },
  "sky-piercer": {
    id: "sky-piercer",
    classId: "spear_saint",
    targetKind: "enemy",
    range: 4.5,
    cooldownMs: 1_800,
    resourceCost: 10,
    damage: 28,
    healing: 0,
  },
  "dragon-lance": {
    id: "dragon-lance",
    classId: "spear_saint",
    targetKind: "enemy",
    range: 5.5,
    cooldownMs: 4_500,
    resourceCost: 30,
    damage: 50,
    healing: 0,
  },
  "veil-cut": {
    id: "veil-cut",
    classId: "shadow_adept",
    targetKind: "enemy",
    range: 2.5,
    cooldownMs: 1_400,
    resourceCost: 8,
    damage: 34,
    healing: 0,
  },
  nightfall: {
    id: "nightfall",
    classId: "shadow_adept",
    targetKind: "enemy",
    range: 3,
    cooldownMs: 5_000,
    resourceCost: 35,
    damage: 58,
    healing: 0,
  },
  "thunder-lance": {
    id: "thunder-lance",
    classId: "storm_caller",
    targetKind: "enemy",
    range: 8,
    cooldownMs: 2_200,
    resourceCost: 15,
    damage: 24,
    healing: 0,
  },
  "tempest-ring": {
    id: "tempest-ring",
    classId: "storm_caller",
    targetKind: "enemy",
    range: 6,
    cooldownMs: 4_500,
    resourceCost: 35,
    damage: 46,
    healing: 0,
  },
  "rising-palm": {
    id: "rising-palm",
    classId: "iron_fist",
    targetKind: "enemy",
    range: 2.5,
    cooldownMs: 1_800,
    resourceCost: 10,
    damage: 30,
    healing: 0,
  },
  earthbreaker: {
    id: "earthbreaker",
    classId: "iron_fist",
    targetKind: "enemy",
    range: 2.5,
    cooldownMs: 4_500,
    resourceCost: 30,
    damage: 50,
    healing: 0,
  },
};

export type AbilityRejection =
  | "INVALID_INTENT"
  | "UNKNOWN_ABILITY"
  | "WRONG_CLASS"
  | "TARGET_NOT_FOUND"
  | "INVALID_TARGET_KIND"
  | "DEAD"
  | "DIFFERENT_ZONE"
  | "SAFE_ZONE"
  | "SAME_FACTION"
  | "OUT_OF_RANGE"
  | "COOLDOWN"
  | "INSUFFICIENT_RESOURCE";
export interface AbilityIntent {
  abilityId: string;
  targetId: string;
}
export interface AbilityResolution {
  accepted: boolean;
  reason?: AbilityRejection;
  damage: number;
  healing: number;
  resourceAfter?: number;
  targetHealth?: number;
}

export function parseAbilityIntent(message: unknown): AbilityIntent | null {
  if (typeof message !== "object" || message === null || Array.isArray(message))
    return null;
  const candidate = message as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== 2 ||
    Object.keys(candidate).some(
      (key) => key !== "abilityId" && key !== "targetId",
    ) ||
    typeof candidate.abilityId !== "string" ||
    candidate.abilityId.length < 1 ||
    candidate.abilityId.length > 64 ||
    typeof candidate.targetId !== "string" ||
    candidate.targetId.length < 1 ||
    candidate.targetId.length > 80
  )
    return null;
  return { abilityId: candidate.abilityId, targetId: candidate.targetId };
}

export interface AbilityActor extends Combatant {
  classId: string;
  resource: number;
}
export interface AbilityTarget extends Combatant {
  kind: "enemy" | "player";
}
export interface AbilityState {
  actor: AbilityActor;
  target: AbilityTarget | undefined;
  abilityId: string;
  nowMs: number;
  lastUsedAtMs: number;
}

export function resolveAbility(state: AbilityState): AbilityResolution {
  const { actor, target, abilityId, nowMs, lastUsedAtMs } = state;
  const ability = ABILITIES[abilityId];
  if (!ability)
    return {
      accepted: false,
      reason: "UNKNOWN_ABILITY",
      damage: 0,
      healing: 0,
    };
  if (ability.classId !== "any" && actor.classId !== ability.classId)
    return { accepted: false, reason: "WRONG_CLASS", damage: 0, healing: 0 };
  if (!target)
    return {
      accepted: false,
      reason: "TARGET_NOT_FOUND",
      damage: 0,
      healing: 0,
    };
  if (actor.health <= 0 || target.health <= 0)
    return { accepted: false, reason: "DEAD", damage: 0, healing: 0 };
  if (actor.mapId !== target.mapId)
    return { accepted: false, reason: "DIFFERENT_ZONE", damage: 0, healing: 0 };
  if (ability.targetKind === "enemy" && target.kind !== "enemy")
    return {
      accepted: false,
      reason: "INVALID_TARGET_KIND",
      damage: 0,
      healing: 0,
    };
  if (
    ability.targetKind === "ally" &&
    (target.kind !== "player" || target.factionId !== actor.factionId)
  )
    return {
      accepted: false,
      reason: "INVALID_TARGET_KIND",
      damage: 0,
      healing: 0,
    };
  if (
    ability.targetKind === "enemy" &&
    actor.factionId === target.factionId &&
    target.kind === "player"
  )
    return { accepted: false, reason: "SAME_FACTION", damage: 0, healing: 0 };
  if (Math.hypot(actor.x - target.x, actor.y - target.y) > ability.range)
    return { accepted: false, reason: "OUT_OF_RANGE", damage: 0, healing: 0 };
  if (lastUsedAtMs > 0 && nowMs - lastUsedAtMs < ability.cooldownMs)
    return { accepted: false, reason: "COOLDOWN", damage: 0, healing: 0 };
  if (actor.resource < ability.resourceCost)
    return {
      accepted: false,
      reason: "INSUFFICIENT_RESOURCE",
      damage: 0,
      healing: 0,
    };
  if (ability.targetKind === "enemy") {
    const zone = target.mapId === "zone.ashen-frontier";
    if (!zone)
      return { accepted: false, reason: "SAFE_ZONE", damage: 0, healing: 0 };
  }
  actor.resource -= ability.resourceCost;
  const damage = Math.min(ability.damage, target.health);
  const healing = Math.min(ability.healing, target.maxHealth - target.health);
  target.health = Math.max(
    0,
    Math.min(target.maxHealth, target.health - damage + healing),
  );
  return {
    accepted: true,
    damage,
    healing,
    resourceAfter: actor.resource,
    targetHealth: target.health,
  };
}

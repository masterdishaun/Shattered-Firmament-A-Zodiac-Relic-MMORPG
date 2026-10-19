import { describe, expect, it } from "vitest";
import {
  parseAbilityIntent,
  resolveAbility,
  type AbilityActor,
  type AbilityTarget,
} from "./abilities.js";
const actor = (overrides: Partial<AbilityActor> = {}): AbilityActor => ({
  characterId: "player",
  factionId: "sovereign_sect",
  classId: "mystic",
  mapId: "zone.ashen-frontier",
  x: 0,
  y: -20,
  health: 100,
  maxHealth: 100,
  resource: 100,
  ...overrides,
});
const enemy = (overrides: Partial<AbilityTarget> = {}): AbilityTarget => ({
  characterId: "enemy:ashen-wisp-01",
  factionId: "wild",
  kind: "enemy",
  mapId: "zone.ashen-frontier",
  x: 2,
  y: -20,
  health: 80,
  maxHealth: 80,
  ...overrides,
});
const cast = (overrides: Partial<Parameters<typeof resolveAbility>[0]> = {}) =>
  resolveAbility({
    actor: actor(),
    target: enemy(),
    abilityId: "astral-bolt",
    nowMs: 3000,
    lastUsedAtMs: 0,
    ...overrides,
  });
describe("ability intent contract", () => {
  it("accepts only an ability ID and target ID", () => {
    expect(
      parseAbilityIntent({
        abilityId: "astral-bolt",
        targetId: "enemy:ashen-wisp-01",
      }),
    ).not.toBeNull();
    expect(
      parseAbilityIntent({
        abilityId: "astral-bolt",
        targetId: "enemy:ashen-wisp-01",
        damage: 999,
      }),
    ).toBeNull();
    expect(parseAbilityIntent(null)).toBeNull();
  });
});
describe("server-authoritative class abilities", () => {
  it("applies server-owned damage and spends resource", () => {
    const target = enemy();
    const player = actor();
    expect(cast({ actor: player, target })).toMatchObject({
      accepted: true,
      damage: 24,
      targetHealth: 56,
      resourceAfter: 80,
    });
    expect(player.resource).toBe(80);
    expect(target.health).toBe(56);
  });
  it("rejects the wrong class and insufficient resource", () => {
    expect(cast({ actor: actor({ classId: "vanguard" }) }).reason).toBe(
      "WRONG_CLASS",
    );
    expect(cast({ actor: actor({ resource: 1 }) }).reason).toBe(
      "INSUFFICIENT_RESOURCE",
    );
  });
  it("enforces cooldown, range, alive targets and target kind", () => {
    expect(cast({ nowMs: 3500, lastUsedAtMs: 2000 }).reason).toBe("COOLDOWN");
    expect(cast({ target: enemy({ x: 9 }) }).reason).toBe("OUT_OF_RANGE");
    expect(cast({ target: enemy({ health: 0 }) }).reason).toBe("DEAD");
    expect(
      cast({
        target: { ...enemy(), kind: "player", factionId: "ashen_syndicate" },
      }).reason,
    ).toBe("INVALID_TARGET_KIND");
  });
  it("rejects hostile abilities in peace zones and across maps", () => {
    expect(
      cast({
        actor: actor({ mapId: "zone.neutral-crossroads" }),
        target: enemy({ mapId: "zone.neutral-crossroads" }),
      }).reason,
    ).toBe("SAFE_ZONE");
    expect(cast({ target: enemy({ mapId: "zone.cinderwake" }) }).reason).toBe(
      "DIFFERENT_ZONE",
    );
    expect(cast({ abilityId: "not-a-skill" }).reason).toBe("UNKNOWN_ABILITY");
  });
  it("exposes one class-specific primary and secondary skill per archetype", () => {
    expect(
      resolveAbility({
        actor: actor({ classId: "vanguard", resource: 100 }),
        target: enemy(),
        abilityId: "jade-strike",
        nowMs: 1000,
        lastUsedAtMs: 0,
      }).damage,
    ).toBe(32);
    expect(
      resolveAbility({
        actor: actor({ classId: "vanguard", resource: 100 }),
        target: enemy(),
        abilityId: "iron-breaker",
        nowMs: 1000,
        lastUsedAtMs: 0,
      }).damage,
    ).toBe(48);
    expect(
      resolveAbility({
        actor: actor({ classId: "mystic", resource: 100 }),
        target: enemy(),
        abilityId: "starfall",
        nowMs: 1000,
        lastUsedAtMs: 0,
      }).damage,
    ).toBe(42);
    expect(
      resolveAbility({
        actor: actor({ classId: "support", resource: 100 }),
        target: enemy(),
        abilityId: "resonant-pulse",
        nowMs: 1000,
        lastUsedAtMs: 0,
      }).damage,
    ).toBe(18);
    expect(
      resolveAbility({
        actor: actor({ classId: "support", resource: 100 }),
        target: enemy(),
        abilityId: "basic-strike",
        nowMs: 1000,
        lastUsedAtMs: 0,
      }).damage,
    ).toBe(20);
  });
  it("heals only a living same-faction player and clamps to max health", () => {
    const player = actor({
      classId: "support",
      factionId: "sovereign_sect",
      resource: 100,
    });
    const ally = enemy({
      characterId: "ally",
      kind: "player",
      factionId: "sovereign_sect",
      health: 90,
      maxHealth: 100,
      x: 3,
    });
    expect(
      resolveAbility({
        actor: player,
        target: ally,
        abilityId: "spirit-mend",
        nowMs: 5000,
        lastUsedAtMs: 0,
      }),
    ).toMatchObject({
      accepted: true,
      healing: 10,
      targetHealth: 100,
      resourceAfter: 75,
    });
    expect(
      resolveAbility({
        actor: player,
        target: { ...ally, factionId: "ashen_syndicate" },
        abilityId: "spirit-mend",
        nowMs: 9000,
        lastUsedAtMs: 0,
      }).reason,
    ).toBe("INVALID_TARGET_KIND");
  });
});

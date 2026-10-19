import { describe, expect, it } from "vitest";
import {
  COMBAT_RULES,
  parseCombatIntent,
  resolveBasicAttack,
  type Combatant,
} from "./combat.js";

const make = (overrides: Partial<Combatant> = {}): Combatant => ({
  characterId: "attacker",
  factionId: "sovereign_sect",
  mapId: "zone.ashen-frontier",
  x: 0,
  y: -17,
  health: 100,
  maxHealth: 100,
  ...overrides,
});

function attack(
  attacker = make(),
  target: Combatant | undefined = make({
    characterId: "target",
    factionId: "ashen_syndicate",
    x: 1,
  }),
  nowMs = 2_000,
  lastAttackAtMs = 0,
) {
  return resolveBasicAttack({ attacker, target, nowMs, lastAttackAtMs });
}

describe("combat intent validation", () => {
  it("accepts only a target character identifier", () => {
    expect(parseCombatIntent({ targetCharacterId: "target" })).toEqual({
      targetCharacterId: "target",
    });
    expect(
      parseCombatIntent({ targetCharacterId: "target", damage: 999 }),
    ).toBeNull();
    expect(parseCombatIntent({ targetCharacterId: "" })).toBeNull();
    expect(parseCombatIntent(null)).toBeNull();
  });
});

describe("server-authoritative basic attack", () => {
  it("applies fixed server damage and clamps health to zero", () => {
    const target = make({
      characterId: "target",
      factionId: "ashen_syndicate",
      health: 7,
      x: 1,
    });
    expect(attack(make(), target)).toMatchObject({
      accepted: true,
      damage: 7,
      targetHealth: 0,
    });
    expect(target.health).toBe(0);
  });
  it("rejects attacks in protected peace zones", () => {
    expect(
      attack(
        make({ mapId: "zone.neutral-crossroads" }),
        make({
          characterId: "target",
          factionId: "ashen_syndicate",
          mapId: "zone.neutral-crossroads",
          x: 1,
        }),
      ).reason,
    ).toBe("SAFE_ZONE");
  });
  it("rejects attacks across zone boundaries", () => {
    expect(
      attack(
        make(),
        make({
          characterId: "target",
          factionId: "ashen_syndicate",
          mapId: "zone.neutral-crossroads",
          x: 1,
        }),
      ).reason,
    ).toBe("DIFFERENT_ZONE");
  });
  it("rejects same-faction attacks", () => {
    expect(
      attack(
        make(),
        make({ characterId: "target", factionId: "sovereign_sect", x: 1 }),
      ).reason,
    ).toBe("SAME_FACTION");
  });
  it("rejects attacks from a defeated attacker", () => {
    expect(
      attack(
        make({ health: 0 }),
        make({ characterId: "target", factionId: "ashen_syndicate", x: 1 }),
      ).reason,
    ).toBe("ATTACKER_DEAD");
  });

  it("rejects missing targets, self-targets and defeated targets", () => {
    expect(
      resolveBasicAttack({
        attacker: make(),
        target: undefined,
        nowMs: 2000,
        lastAttackAtMs: 0,
      }).reason,
    ).toBe("TARGET_NOT_FOUND");
    expect(
      attack(
        make(),
        make({ characterId: "attacker", factionId: "ashen_syndicate", x: 1 }),
      ).reason,
    ).toBe("SELF_TARGET");
    expect(
      attack(
        make(),
        make({
          characterId: "target",
          factionId: "ashen_syndicate",
          health: 0,
          x: 1,
        }),
      ).reason,
    ).toBe("TARGET_DEAD");
  });
  it("rejects out-of-range attacks", () => {
    expect(
      attack(
        make(),
        make({
          characterId: "target",
          factionId: "ashen_syndicate",
          x: COMBAT_RULES.meleeRange + 0.1,
        }),
      ).reason,
    ).toBe("OUT_OF_RANGE");
  });
  it("enforces a one-second cooldown", () => {
    expect(
      attack(
        make(),
        make({ characterId: "target", factionId: "ashen_syndicate", x: 1 }),
        2_500,
        2_000,
      ).reason,
    ).toBe("COOLDOWN");
    expect(
      attack(
        make(),
        make({ characterId: "target", factionId: "ashen_syndicate", x: 1 }),
        3_000,
        2_000,
      ).accepted,
    ).toBe(true);
  });
});

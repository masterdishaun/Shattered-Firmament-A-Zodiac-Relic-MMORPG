import { describe, expect, it } from "vitest";
import {
  LEVEL_CAP,
  LOOT_PITY_MISS_LIMIT,
  PITY_PROTECTED_ITEM_ID,
  levelForTotalExperience,
  rollEnemyRewards,
  xpMultiplierForLevelDifference,
  xpRequiredForNextLevel,
} from "./progression.js";

describe("progression reward rules", () => {
  it("uses the specified XP curve and reaches level 100 at 693,000 XP", () => {
    expect(xpRequiredForNextLevel(1)).toBe(4_060);
    expect(xpRequiredForNextLevel(99)).toBe(9_940);
    expect(xpRequiredForNextLevel(100)).toBe(0);
    expect(levelForTotalExperience(0)).toBe(1);
    expect(levelForTotalExperience(4_059)).toBe(1);
    expect(levelForTotalExperience(4_060)).toBe(2);
    expect(levelForTotalExperience(692_999)).toBe(99);
    expect(levelForTotalExperience(693_000)).toBe(LEVEL_CAP);
    expect(levelForTotalExperience(9_000_000)).toBe(LEVEL_CAP);
  });

  it("rolls within the authored archetype ranges and can award tradeable material", () => {
    const sequence = [0.999, 0.999, 0];
    const rewards = rollEnemyRewards(
      "jadebound-sentinel",
      () => sequence.shift() ?? 0,
    );
    expect(rewards).toEqual({
      experience: 120,
      silver: 9,
      loot: [
        {
          itemId: "material.ashen-jade-fragment",
          quantity: 1,
          tradeable: true,
        },
      ],
    });
  });

  it("reduces XP from trivial enemies while preserving full rewards near the player's level", () => {
    expect(xpMultiplierForLevelDifference(10, 10)).toBe(1);
    expect(xpMultiplierForLevelDifference(15, 10)).toBe(0.5);
    expect(xpMultiplierForLevelDifference(20, 10)).toBe(0.25);
    expect(xpMultiplierForLevelDifference(30, 10)).toBe(0.1);
    expect(xpMultiplierForLevelDifference(10, 15)).toBe(1);
    expect(() => xpMultiplierForLevelDifference(0, 1)).toThrow(/levels/);
    expect(() => xpMultiplierForLevelDifference(1, 101)).toThrow(/levels/);
  });

  it("defines persistent pity as a guarantee after ten eligible misses", () => {
    expect(LOOT_PITY_MISS_LIMIT).toBe(9);
    expect(PITY_PROTECTED_ITEM_ID).toBe("material.ashen-jade-fragment");
  });

  it("validates injected randomness and experience input", () => {
    expect(() => rollEnemyRewards("ashen-wisp", () => 1)).toThrow(
      /Random source/,
    );
    expect(() => levelForTotalExperience(-1)).toThrow(/non-negative/);
    expect(() => levelForTotalExperience(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe integer/,
    );
  });
});

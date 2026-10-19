import { describe, expect, it } from "vitest";
import { ASHEN_WISP, createAshenWisp, stepEnemy } from "./pve.js";
const player = (
  overrides: Partial<{
    characterId: string;
    mapId: string;
    x: number;
    y: number;
    health: number;
  }> = {},
) => ({
  characterId: "hero",
  mapId: ASHEN_WISP.mapId,
  x: 3,
  y: -20,
  health: 100,
  ...overrides,
});
describe("Ashen Wisp server AI", () => {
  it("ignores players in other maps and dead players", () => {
    const enemy = createAshenWisp();
    expect(
      stepEnemy(
        enemy,
        [player({ mapId: "zone.neutral-crossroads" })],
        0.05,
        1000,
      ),
    ).toBeNull();
    expect(stepEnemy(enemy, [player({ health: 0 })], 0.05, 1000)).toBeNull();
    expect(enemy.aggroCharacterId).toBe("");
  });
  it("acquires nearby players, closes distance and attacks on its cooldown", () => {
    const enemy = createAshenWisp();
    expect(stepEnemy(enemy, [player({ x: 3, y: -20 })], 0.05, 1000)).toBeNull();
    expect(enemy.aggroCharacterId).toBe("hero");
    expect(enemy.y).toBeGreaterThan(-23);
    enemy.x = 3;
    enemy.y = -21.4;
    expect(stepEnemy(enemy, [player()], 0.05, 1000)).toEqual({
      targetCharacterId: "hero",
      damage: 8,
    });
    expect(stepEnemy(enemy, [player()], 0.05, 2000)).toBeNull();
    expect(stepEnemy(enemy, [player()], 0.05, 3000)).toEqual({
      targetCharacterId: "hero",
      damage: 8,
    });
  });
  it("respawns defeated enemies after a bounded delay", () => {
    const enemy = createAshenWisp();
    enemy.health = 0;
    enemy.respawnAtMs = 9000;
    stepEnemy(enemy, [], 0.05, 8999);
    expect(enemy.health).toBe(0);
    stepEnemy(enemy, [], 0.05, 9000);
    expect(enemy.health).toBe(ASHEN_WISP.maxHealth);
    expect(enemy.respawnAtMs).toBe(0);
  });
});

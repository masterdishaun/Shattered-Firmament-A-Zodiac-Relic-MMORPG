import { describe, expect, it } from "vitest";
import {
  ENEMY_DEFINITIONS,
  ASHEN_WISP,
  createAshenWisp,
  createEnemy,
  createWorldEnemies,
  stepEnemy,
} from "./pve.js";
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
describe("server-authoritative PvE enemy AI", () => {
  it("spawns three distinct, data-driven archetypes", () => {
    const enemies = createWorldEnemies(100);
    expect(enemies).toHaveLength(3);
    expect(enemies.map((enemy) => enemy.archetype)).toEqual([
      "ashen-wisp",
      "jadebound-sentinel",
      "rift-stalker",
    ]);
    expect(new Set(enemies.map((enemy) => enemy.id)).size).toBe(3);
    expect(enemies.every((enemy) => enemy.health === enemy.maxHealth)).toBe(
      true,
    );
  });
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
    expect(enemy.aiState).toBe("idle");
  });
  it("acquires the nearest valid player and drops targets beyond its leash", () => {
    const enemy = createAshenWisp();
    stepEnemy(
      enemy,
      [
        player({ x: 3, y: -20 }),
        player({ characterId: "closer", x: 3, y: -22 }),
      ],
      0.05,
      1000,
    );
    expect(enemy.aggroCharacterId).toBe("closer");
    stepEnemy(
      enemy,
      [player({ characterId: "closer", x: 30, y: 30 })],
      0.05,
      1100,
    );
    expect(enemy.aggroCharacterId).toBe("");
    expect(enemy.aiState).toBe("idle");
  });
  it("telegraphs before damage and enforces recovery cooldown", () => {
    const enemy = createAshenWisp();
    const target = player({ x: 3, y: -20 });
    expect(stepEnemy(enemy, [target], 0.05, 1000)).toBeNull();
    expect(enemy.aiState).toBe("telegraph");
    expect(enemy.telegraphEndsAtMs).toBe(1750);
    expect(stepEnemy(enemy, [target], 0.05, 1749)).toBeNull();
    expect(stepEnemy(enemy, [target], 0.05, 1750)).toEqual({
      targetCharacterId: "hero",
      damage: ENEMY_DEFINITIONS["ashen-wisp"].damage,
      enemyId: ASHEN_WISP.id,
      attackStyle: "ranged",
    });
    expect(enemy.aiState).toBe("recover");
    expect(stepEnemy(enemy, [target], 0.05, 2000)).toBeNull();
    expect(stepEnemy(enemy, [target], 0.05, 3950)).toBeNull();
    expect(enemy.aiState).toBe("telegraph");
  });
  it("cancels a telegraph when the target leaves attack range", () => {
    const enemy = createEnemy("jadebound-sentinel");
    expect(
      stepEnemy(enemy, [player({ x: enemy.x + 1, y: enemy.y })], 0.05, 1000),
    ).toBeNull();
    expect(enemy.aiState).toBe("telegraph");
    stepEnemy(enemy, [player({ x: 20, y: 20 })], 0.05, 1200);
    expect(enemy.aiState).toBe("idle");
    expect(enemy.telegraphEndsAtMs).toBe(0);
  });
  it("uses distinct attack ranges, damage and telegraph durations", () => {
    expect(ENEMY_DEFINITIONS["ashen-wisp"].attackRange).toBeGreaterThan(
      ENEMY_DEFINITIONS["jadebound-sentinel"].attackRange,
    );
    expect(ENEMY_DEFINITIONS["jadebound-sentinel"].damage).toBeGreaterThan(
      ENEMY_DEFINITIONS["rift-stalker"].damage,
    );
    expect(
      ENEMY_DEFINITIONS["jadebound-sentinel"].telegraphDurationMs,
    ).toBeGreaterThan(ENEMY_DEFINITIONS["rift-stalker"].telegraphDurationMs);
  });
  it("respawns defeated enemies with their own archetype and full health", () => {
    const enemy = createEnemy("rift-stalker", 0, "enemy:rift-stalker-test");
    enemy.health = 0;
    enemy.aiState = "dead";
    enemy.respawnAtMs = 9000;
    stepEnemy(enemy, [], 0.05, 8999);
    expect(enemy.health).toBe(0);
    stepEnemy(enemy, [], 0.05, 9000);
    expect(enemy.health).toBe(ENEMY_DEFINITIONS["rift-stalker"].maxHealth);
    expect(enemy.respawnAtMs).toBe(0);
    expect(enemy.aiState).toBe("idle");
    expect(enemy.id).toBe("enemy:rift-stalker-test");
  });
});

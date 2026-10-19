import { describe, expect, it } from "vitest";
import {
  applyMoveIntent,
  parseMoveIntent,
  stepPlayerMovement,
  WORLD_MOVEMENT,
  type PlayerMovementState,
} from "./movement.js";
import {
  isPositionInZone,
  isPositionWalkable,
  isZoneAllowedForFaction,
  zoneFallbackSpawn,
  resolveZoneTransition,
  WORLD_ZONES,
} from "./zones.js";
const createState = (
  overrides: Partial<PlayerMovementState> = {},
): PlayerMovementState => ({
  x: 0,
  y: 0,
  facing: 0,
  movementSequence: 0,
  axisX: 0,
  axisY: 0,
  ...overrides,
});
describe("authoritative movement intent validation", () => {
  it("accepts bounded axes with a strictly increasing safe sequence", () =>
    expect(parseMoveIntent({ sequence: 1, axisX: 1, axisY: -0.5 }, 0)).toEqual({
      sequence: 1,
      axisX: 1,
      axisY: -0.5,
    }));
  it.each([
    null,
    [],
    { sequence: 0, axisX: 0, axisY: 0 },
    { sequence: 1, axisX: 0, axisY: 0 },
    { sequence: Number.MAX_SAFE_INTEGER + 1, axisX: 0, axisY: 0 },
    { sequence: 2, axisX: 1.01, axisY: 0 },
    { sequence: 2, axisX: 0, axisY: -1.01 },
    { sequence: 2, axisX: Number.NaN, axisY: 0 },
    { sequence: 2, axisX: 0, axisY: Number.POSITIVE_INFINITY },
    { sequence: 2, axisX: "1", axisY: 0 },
    { sequence: 2, axisX: 0, axisY: 0, speed: 999 },
    { sequence: 2, axisX: 0, axisY: 0, position: { x: 999, y: 0 } },
  ])("rejects invalid movement intent %j", (message) =>
    expect(parseMoveIntent(message, 1)).toBeNull(),
  );
  it("updates sequence and facing only from a validated intent", () => {
    const state = createState();
    const intent = parseMoveIntent(
      { sequence: 7, axisX: 1, axisY: 0 },
      state.movementSequence,
    );
    expect(intent).not.toBeNull();
    applyMoveIntent(state, intent!);
    expect(state.movementSequence).toBe(7);
    expect(state.axisX).toBe(1);
    expect(state.facing).toBeCloseTo(Math.PI / 2);
  });
});
describe("20 Hz movement simulation", () => {
  it("moves at server speed per fixed step", () => {
    const s = createState({ axisX: 1 });
    stepPlayerMovement(s);
    expect(s.x).toBeCloseTo(WORLD_MOVEMENT.speed / WORLD_MOVEMENT.tickRate);
    expect(s.y).toBe(0);
  });
  it("normalizes diagonal input", () => {
    const s = createState({ axisX: 1, axisY: 1 });
    stepPlayerMovement(s);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(
      WORLD_MOVEMENT.speed / WORLD_MOVEMENT.tickRate,
    );
  });
  it("clamps global bounds", () => {
    const s = createState({
      x: WORLD_MOVEMENT.bounds.maxX - 0.01,
      y: WORLD_MOVEMENT.bounds.minY + 0.01,
      axisX: 1,
      axisY: -1,
    });
    stepPlayerMovement(s);
    expect(s.x).toBe(WORLD_MOVEMENT.bounds.maxX);
    expect(s.y).toBe(WORLD_MOVEMENT.bounds.minY);
  });
  it("safely handles invalid time steps", () => {
    const a = createState({ axisX: 1 });
    stepPlayerMovement(a, -10);
    expect(a.x).toBe(0);
    const b = createState({ axisX: 1 });
    stepPlayerMovement(b, Number.NaN);
    expect(b.x).toBe(0);
    const c = createState({ axisX: 1 });
    stepPlayerMovement(c, 10);
    expect(c.x).toBeCloseTo(WORLD_MOVEMENT.speed * 0.1);
  });
});
describe("authoritative zone boundaries and transitions", () => {
  it("keeps movement inside current map", () => {
    const s = createState({ x: -30.5, axisX: -1 });
    for (let i = 0; i < 40; i++)
      stepPlayerMovement(s, undefined, "white_jade_bastion");
    expect(isPositionInZone("white_jade_bastion", s.x, s.y, 0.38)).toBe(true);
    expect(s.x).toBeGreaterThanOrEqual(
      WORLD_ZONES.white_jade_bastion.bounds.minX + 0.38,
    );
  });
  it("blocks movement through server-owned landmark footprints", () => {
    const s = createState({ x: -5.1, y: -5.8, axisX: -1 });
    for (let i = 0; i < 10; i++) stepPlayerMovement(s, undefined, "cinderwake");
    expect(s.x).toBeGreaterThan(-5.4);
  });
  it("validates persisted zone/faction state and provides safe fallback spawns", () => {
    expect(
      isZoneAllowedForFaction("white_jade_bastion", "ashen_syndicate"),
    ).toBe(false);
    expect(
      isZoneAllowedForFaction("zone.neutral-crossroads", "ashen_syndicate"),
    ).toBe(true);
    expect(isPositionWalkable("white_jade_bastion", -22, 4)).toBe(true);
    expect(isPositionWalkable("white_jade_bastion", 1000, 4)).toBe(false);
    expect(zoneFallbackSpawn("white_jade_bastion")).toEqual({ x: -22, y: 4 });
    expect(zoneFallbackSpawn("zone.ashen-frontier")).toEqual({ x: 0, y: -17 });
  });
  it("rejects wrong-faction starts, unknown maps and transitions away from gates", () => {
    expect(
      resolveZoneTransition({
        sourceMapId: "cinderwake",
        targetMapId: "zone.neutral-crossroads",
        factionId: "sovereign_sect",
        x: 0,
        y: 7,
      }),
    ).toBeNull();
    expect(
      resolveZoneTransition({
        sourceMapId: "white_jade_bastion",
        targetMapId: "zone.neutral-crossroads",
        factionId: "sovereign_sect",
        x: -22,
        y: 0,
      }),
    ).toBeNull();
    expect(
      resolveZoneTransition({
        sourceMapId: "unknown",
        targetMapId: "zone.neutral-crossroads",
        factionId: "sovereign_sect",
        x: -22,
        y: 7,
      }),
    ).toBeNull();
  });
  it("allows a faction gate to the protected hub and a hub return gate", () => {
    expect(
      resolveZoneTransition({
        sourceMapId: "white_jade_bastion",
        targetMapId: "zone.neutral-crossroads",
        factionId: "sovereign_sect",
        x: -22,
        y: 7,
      }),
    ).toEqual({ mapId: "zone.neutral-crossroads", x: 0, y: 15 });
    expect(WORLD_ZONES["zone.neutral-crossroads"].safeZone).toBe(true);
    expect(
      resolveZoneTransition({
        sourceMapId: "zone.neutral-crossroads",
        targetMapId: "white_jade_bastion",
        factionId: "sovereign_sect",
        x: 0,
        y: 20,
      }),
    ).toBeNull();
    expect(
      resolveZoneTransition({
        sourceMapId: "zone.neutral-crossroads",
        targetMapId: "white_jade_bastion",
        factionId: "sovereign_sect",
        x: 0,
        y: 25,
      }),
    ).toEqual({ mapId: "white_jade_bastion", x: -22, y: 4 });
  });
  it("permits only gate-based travel between protected hub and PvP frontier", () => {
    expect(
      resolveZoneTransition({
        sourceMapId: "zone.neutral-crossroads",
        targetMapId: "zone.ashen-frontier",
        factionId: "astral_concord",
        x: 0,
        y: 20,
      }),
    ).toBeNull();
    expect(
      resolveZoneTransition({
        sourceMapId: "zone.neutral-crossroads",
        targetMapId: "zone.ashen-frontier",
        factionId: "astral_concord",
        x: 0,
        y: 15,
      }),
    ).toEqual({ mapId: "zone.ashen-frontier", x: 0, y: -17 });
    expect(WORLD_ZONES["zone.ashen-frontier"].pvpEnabled).toBe(true);
    expect(
      resolveZoneTransition({
        sourceMapId: "zone.ashen-frontier",
        targetMapId: "zone.neutral-crossroads",
        factionId: "astral_concord",
        x: 0,
        y: -17,
      }),
    ).toEqual({ mapId: "zone.neutral-crossroads", x: 0, y: 15 });
  });
});

import { describe, expect, it } from "vitest";
import {
  applyMoveIntent,
  parseMoveIntent,
  stepPlayerMovement,
  WORLD_MOVEMENT,
  type PlayerMovementState,
} from "./movement.js";

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
  it("accepts bounded axes with a strictly increasing safe sequence", () => {
    expect(parseMoveIntent({ sequence: 1, axisX: 1, axisY: -0.5 }, 0)).toEqual({
      sequence: 1,
      axisX: 1,
      axisY: -0.5,
    });
  });

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
  ])("rejects invalid movement intent %j", (message) => {
    expect(parseMoveIntent(message, 1)).toBeNull();
  });

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
  it("moves at the server speed using the fixed simulation step", () => {
    const state = createState({ axisX: 1 });
    stepPlayerMovement(state);
    expect(state.x).toBeCloseTo(WORLD_MOVEMENT.speed / WORLD_MOVEMENT.tickRate);
    expect(state.y).toBe(0);
  });

  it("normalizes diagonal input so it cannot exceed the configured speed", () => {
    const state = createState({ axisX: 1, axisY: 1 });
    stepPlayerMovement(state);
    expect(Math.hypot(state.x, state.y)).toBeCloseTo(
      WORLD_MOVEMENT.speed / WORLD_MOVEMENT.tickRate,
    );
  });

  it("clamps position to server-owned world bounds", () => {
    const state = createState({
      x: WORLD_MOVEMENT.bounds.maxX - 0.01,
      y: WORLD_MOVEMENT.bounds.minY + 0.01,
      axisX: 1,
      axisY: -1,
    });
    stepPlayerMovement(state);
    expect(state.x).toBe(WORLD_MOVEMENT.bounds.maxX);
    expect(state.y).toBe(WORLD_MOVEMENT.bounds.minY);
  });

  it("ignores negative, non-finite and oversized time steps safely", () => {
    const negative = createState({ axisX: 1 });
    stepPlayerMovement(negative, -10);
    expect(negative.x).toBe(0);

    const invalid = createState({ axisX: 1 });
    stepPlayerMovement(invalid, Number.NaN);
    expect(invalid.x).toBe(0);

    const oversized = createState({ axisX: 1 });
    stepPlayerMovement(oversized, 10);
    expect(oversized.x).toBeCloseTo(WORLD_MOVEMENT.speed * 0.1);
  });
});

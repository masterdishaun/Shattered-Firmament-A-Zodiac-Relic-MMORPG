import type { ClientMoveIntent } from "@shattered-firmament/shared/protocol";
import { isPositionWalkable, WORLD_ZONES } from "./zones.js";
export const WORLD_MOVEMENT = {
  tickRate: 20,
  stepSeconds: 1 / 20,
  speed: 6,
  bounds: { minX: -32, maxX: 32, minY: -32, maxY: 32 },
  minimumIntentIntervalMs: 25,
  maximumInvalidIntents: 10,
} as const;
export type MoveIntent = ClientMoveIntent;
export interface PlayerMovementState {
  x: number;
  y: number;
  facing: number;
  movementSequence: number;
  axisX: number;
  axisY: number;
}
export function parseMoveIntent(
  message: unknown,
  previousSequence: number,
): MoveIntent | null {
  if (typeof message !== "object" || message === null || Array.isArray(message))
    return null;
  const candidate = message as Record<string, unknown>;
  if (
    Object.keys(candidate).some(
      (key) => !["sequence", "axisX", "axisY"].includes(key),
    )
  )
    return null;
  const { sequence, axisX, axisY } = candidate;
  if (
    typeof sequence !== "number" ||
    !Number.isSafeInteger(sequence) ||
    sequence <= previousSequence ||
    sequence < 1 ||
    typeof axisX !== "number" ||
    !Number.isFinite(axisX) ||
    axisX < -1 ||
    axisX > 1 ||
    typeof axisY !== "number" ||
    !Number.isFinite(axisY) ||
    axisY < -1 ||
    axisY > 1
  )
    return null;
  return { sequence, axisX, axisY };
}
export function applyMoveIntent(
  state: PlayerMovementState,
  intent: MoveIntent,
): void {
  state.movementSequence = intent.sequence;
  state.axisX = intent.axisX;
  state.axisY = intent.axisY;
  if (Math.hypot(intent.axisX, intent.axisY) > 0.001)
    state.facing = Math.atan2(intent.axisX, intent.axisY);
}
export function stepPlayerMovement(
  state: PlayerMovementState,
  deltaSeconds = WORLD_MOVEMENT.stepSeconds,
  mapId?: string,
): void {
  const delta = Number.isFinite(deltaSeconds)
    ? Math.max(0, Math.min(deltaSeconds, 0.1))
    : 0;
  const magnitude = Math.hypot(state.axisX, state.axisY);
  const normalization = magnitude > 1 ? 1 / magnitude : 1;
  const nextX =
    state.x + state.axisX * normalization * WORLD_MOVEMENT.speed * delta;
  const nextY =
    state.y + state.axisY * normalization * WORLD_MOVEMENT.speed * delta;
  if (!mapId || !Object.prototype.hasOwnProperty.call(WORLD_ZONES, mapId)) {
    state.x = Math.max(
      WORLD_MOVEMENT.bounds.minX,
      Math.min(WORLD_MOVEMENT.bounds.maxX, nextX),
    );
    state.y = Math.max(
      WORLD_MOVEMENT.bounds.minY,
      Math.min(WORLD_MOVEMENT.bounds.maxY, nextY),
    );
    return;
  }
  const zone = WORLD_ZONES[mapId as keyof typeof WORLD_ZONES];
  const radius = 0.38;
  const clampedX = Math.max(
    zone.bounds.minX + radius,
    Math.min(zone.bounds.maxX - radius, nextX),
  );
  const clampedY = Math.max(
    zone.bounds.minY + radius,
    Math.min(zone.bounds.maxY - radius, nextY),
  );
  const canOccupy = (x: number, y: number) =>
    isPositionWalkable(mapId, x, y, radius);
  let resolvedX = state.x;
  let resolvedY = state.y;
  if (canOccupy(clampedX, state.y)) resolvedX = clampedX;
  if (canOccupy(resolvedX, clampedY)) resolvedY = clampedY;
  state.x = resolvedX;
  state.y = resolvedY;
}

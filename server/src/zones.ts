export type FactionId = "sovereign_sect" | "ashen_syndicate" | "astral_concord";
export type ZoneId =
  | "white_jade_bastion"
  | "cinderwake"
  | "luminous_veil"
  | "zone.neutral-crossroads"
  | "zone.ashen-frontier";
export interface ZoneDefinition {
  id: ZoneId;
  displayName: string;
  safeZone: boolean;
  pvpEnabled: boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  factionId?: FactionId;
  gateY: number;
  obstacles: Array<{ minX: number; maxX: number; minY: number; maxY: number }>;
}
const startZone = (
  id: ZoneId,
  displayName: string,
  factionId: FactionId,
  centerX: number,
): ZoneDefinition => ({
  id,
  displayName,
  safeZone: true,
  pvpEnabled: false,
  factionId,
  bounds: { minX: centerX - 9, maxX: centerX + 9, minY: -8, maxY: 8 },
  gateY: 6.5,
  obstacles: [
    { minX: centerX - 6.8, maxX: centerX - 5.4, minY: -6.5, maxY: -5.1 },
    { minX: centerX + 5.4, maxX: centerX + 6.8, minY: -6.5, maxY: -5.1 },
    { minX: centerX - 6.8, maxX: centerX - 5.4, minY: 5.1, maxY: 6.5 },
    { minX: centerX + 5.4, maxX: centerX + 6.8, minY: 5.1, maxY: 6.5 },
  ],
});
export const WORLD_ZONES: Record<ZoneId, ZoneDefinition> = {
  white_jade_bastion: startZone(
    "white_jade_bastion",
    "White Jade Bastion",
    "sovereign_sect",
    -22,
  ),
  cinderwake: {
    ...startZone("cinderwake", "Cinderwake", "ashen_syndicate", 0),
    obstacles: [
      { minX: -6.8, maxX: -5.4, minY: -6.5, maxY: -5.1 },
      { minX: 5.4, maxX: 6.8, minY: -6.5, maxY: -5.1 },
    ],
  },
  luminous_veil: startZone(
    "luminous_veil",
    "Luminous Veil",
    "astral_concord",
    22,
  ),
  "zone.neutral-crossroads": {
    id: "zone.neutral-crossroads",
    displayName: "Wayfarer Crossroads",
    safeZone: true,
    pvpEnabled: false,
    bounds: { minX: -10, maxX: 10, minY: 14, maxY: 26 },
    gateY: 25,
    obstacles: [],
  },
  "zone.ashen-frontier": {
    id: "zone.ashen-frontier",
    displayName: "Ashen Frontier",
    safeZone: false,
    pvpEnabled: true,
    bounds: { minX: -10, maxX: 10, minY: -28, maxY: -16 },
    gateY: -16.5,
    obstacles: [],
  },
};
export const FACTION_START_ZONE: Record<FactionId, ZoneId> = {
  sovereign_sect: "white_jade_bastion",
  ashen_syndicate: "cinderwake",
  astral_concord: "luminous_veil",
};
export function isZoneId(value: string): value is ZoneId {
  return Object.prototype.hasOwnProperty.call(WORLD_ZONES, value);
}
export function isPositionInZone(
  mapId: string,
  x: number,
  y: number,
  radius = 0,
): boolean {
  if (!isZoneId(mapId) || !Number.isFinite(x) || !Number.isFinite(y))
    return false;
  const zone = WORLD_ZONES[mapId];
  return (
    x - radius >= zone.bounds.minX &&
    x + radius <= zone.bounds.maxX &&
    y - radius >= zone.bounds.minY &&
    y + radius <= zone.bounds.maxY
  );
}
export function resolveZoneTransition(input: {
  sourceMapId: string;
  targetMapId: string;
  factionId: FactionId;
  x: number;
  y: number;
}): { mapId: ZoneId; x: number; y: number } | null {
  const { sourceMapId, targetMapId, factionId, x, y } = input;
  if (
    !isZoneId(sourceMapId) ||
    !isZoneId(targetMapId) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return null;
  const startId = FACTION_START_ZONE[factionId];
  if (
    sourceMapId === startId &&
    targetMapId === "zone.neutral-crossroads" &&
    y >= WORLD_ZONES[sourceMapId].gateY - 1
  ) {
    const start = WORLD_ZONES[sourceMapId];
    const centerX = (start.bounds.minX + start.bounds.maxX) / 2;
    if (Math.abs(x - centerX) <= 2)
      return { mapId: "zone.neutral-crossroads", x: 0, y: 15 };
  }
  if (
    sourceMapId === "zone.neutral-crossroads" &&
    targetMapId === startId &&
    y >= WORLD_ZONES[sourceMapId].gateY - 1
  ) {
    const start = WORLD_ZONES[targetMapId];
    return {
      mapId: targetMapId,
      x: (start.bounds.minX + start.bounds.maxX) / 2,
      y: 4,
    };
  }
  if (
    sourceMapId === "zone.neutral-crossroads" &&
    targetMapId === "zone.ashen-frontier" &&
    y <= 15.5
  )
    return { mapId: "zone.ashen-frontier", x: 0, y: -17 };
  if (
    sourceMapId === "zone.ashen-frontier" &&
    targetMapId === "zone.neutral-crossroads" &&
    y >= -17
  )
    return { mapId: "zone.neutral-crossroads", x: 0, y: 15 };
  return null;
}

export function isZoneAllowedForFaction(
  mapId: string,
  factionId: FactionId,
): boolean {
  if (!isZoneId(mapId)) return false;
  const zone = WORLD_ZONES[mapId];
  return zone.factionId === undefined || zone.factionId === factionId;
}
export function isPositionWalkable(
  mapId: string,
  x: number,
  y: number,
  radius = 0.38,
): boolean {
  if (!isPositionInZone(mapId, x, y, radius)) return false;
  const zone = WORLD_ZONES[mapId as ZoneId];
  return !zone.obstacles.some(
    (o) =>
      x + radius > o.minX &&
      x - radius < o.maxX &&
      y + radius > o.minY &&
      y - radius < o.maxY,
  );
}
export function zoneFallbackSpawn(mapId: ZoneId): { x: number; y: number } {
  const zone = WORLD_ZONES[mapId];
  if (zone.factionId !== undefined)
    return { x: (zone.bounds.minX + zone.bounds.maxX) / 2, y: 4 };
  if (mapId === "zone.ashen-frontier") return { x: 0, y: -17 };
  return { x: 0, y: 15 };
}

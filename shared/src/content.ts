export const FACTIONS = [
  "sovereign_sect",
  "ashen_syndicate",
  "astral_concord",
] as const;
export type FactionId = (typeof FACTIONS)[number];

export const CULTIVATION_REALMS = [
  "awakened_soul",
  "jade_meridian",
  "astral_core",
  "celestial_vessel",
  "firmament_ascendant",
] as const;
export type CultivationRealmId = (typeof CULTIVATION_REALMS)[number];

export type QuestAvailability = "faction" | "shared";
export type QuestMode =
  "solo_story" | "solo_side" | "party_dungeon" | "raid" | "world_event";

export interface QuestDefinition {
  id: string;
  version: number;
  title: string;
  availability: QuestAvailability;
  factionIds?: FactionId[];
  levelMin: number;
  levelMax: number;
  mode: QuestMode;
  prerequisiteQuestIds: string[];
  objectives: Array<{
    id: string;
    description: string;
    targetCount: number;
    optional: boolean;
  }>;
  rewardTableId: string;
  choiceFlagIds: string[];
  essentialProgression: boolean;
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  philosophy: "law" | "chaos" | "balance";
  motto: string;
  startingRegionId: string;
  openingQuestlineId: string;
  coreBlindSpot: string;
}

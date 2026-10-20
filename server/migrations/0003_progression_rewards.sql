-- Idempotent, durable record of personal PvE rewards.
CREATE TABLE character_reward_claims (
  id UUID PRIMARY KEY,
  event_key TEXT NOT NULL,
  character_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('enemy_defeat', 'quest', 'dungeon')),
  source_id TEXT NOT NULL,
  experience_awarded BIGINT NOT NULL DEFAULT 0 CHECK (experience_awarded >= 0),
  silver_awarded BIGINT NOT NULL DEFAULT 0 CHECK (silver_awarded >= 0),
  loot JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(loot) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, character_id),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX character_reward_claims_character_time_idx
  ON character_reward_claims (character_id, created_at DESC);

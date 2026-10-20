CREATE TABLE dungeon_completion_events (
  id UUID PRIMARY KEY,
  event_key TEXT NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  dungeon_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version > 0),
  completed_encounter_ids JSONB NOT NULL CHECK (jsonb_typeof(completed_encounter_ids) = 'array'),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, character_id),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX dungeon_completion_events_character_time_idx
  ON dungeon_completion_events (character_id, completed_at DESC);

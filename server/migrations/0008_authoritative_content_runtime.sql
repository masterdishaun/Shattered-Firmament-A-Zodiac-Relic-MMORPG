CREATE TABLE quest_progress_events (
  id UUID PRIMARY KEY,
  event_key TEXT NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('enemy_defeated', 'dungeon_entered', 'item_acquired', 'npc_interaction', 'world_interaction')),
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 160),
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_key, character_id),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX quest_progress_events_character_time_idx ON quest_progress_events (character_id, recorded_at DESC);

CREATE TABLE dungeon_instances (
  id UUID PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE CHECK (length(run_key) BETWEEN 1 AND 160),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  dungeon_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX dungeon_instances_character_status_idx ON dungeon_instances (character_id, status);

CREATE TABLE dungeon_encounter_events (
  id UUID PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES dungeon_instances(id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  event_key TEXT NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  defeated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, encounter_id),
  UNIQUE (event_key, instance_id)
);

CREATE TABLE dungeon_encounter_state (
  instance_id UUID NOT NULL REFERENCES dungeon_instances(id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  max_health INTEGER NOT NULL CHECK (max_health > 0),
  current_health INTEGER NOT NULL CHECK (current_health BETWEEN 0 AND max_health),
  status TEXT NOT NULL CHECK (status IN ('alive', 'defeated')) DEFAULT 'alive',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, encounter_id),
  CHECK ((status = 'defeated') = (current_health = 0))
);

CREATE TABLE dungeon_damage_events (
  id UUID PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES dungeon_instances(id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  event_key TEXT NOT NULL CHECK (length(event_key) BETWEEN 1 AND 160),
  damage INTEGER NOT NULL CHECK (damage BETWEEN 1 AND 1000),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, event_key),
  FOREIGN KEY (instance_id, encounter_id) REFERENCES dungeon_encounter_state(instance_id, encounter_id) ON DELETE CASCADE
);

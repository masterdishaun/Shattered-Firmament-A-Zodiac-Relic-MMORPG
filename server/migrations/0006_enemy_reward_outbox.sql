CREATE TABLE enemy_reward_outbox (
  id UUID PRIMARY KEY,
  event_key TEXT NOT NULL CHECK (length(event_key) BETWEEN 1 AND 200),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  archetype TEXT NOT NULL CHECK (archetype IN ('rift-stalker', 'ashen-wisp', 'jadebound-sentinel')),
  enemy_level INTEGER NOT NULL CHECK (enemy_level BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (event_key, character_id),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX enemy_reward_outbox_pending_idx ON enemy_reward_outbox (available_at, created_at) WHERE status <> 'completed';

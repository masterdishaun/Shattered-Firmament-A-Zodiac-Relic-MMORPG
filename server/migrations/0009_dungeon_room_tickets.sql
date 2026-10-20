CREATE TABLE dungeon_room_tickets (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  instance_id UUID NOT NULL REFERENCES dungeon_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (character_id,user_id) REFERENCES characters(id,user_id) ON DELETE CASCADE
);
CREATE INDEX dungeon_room_tickets_instance_idx ON dungeon_room_tickets(instance_id, expires_at);

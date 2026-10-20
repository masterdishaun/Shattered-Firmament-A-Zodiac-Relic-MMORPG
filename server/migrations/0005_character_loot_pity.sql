CREATE TABLE character_loot_pity (
  character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (item_id = 'material.ashen-jade-fragment'),
  consecutive_misses SMALLINT NOT NULL DEFAULT 0 CHECK (consecutive_misses BETWEEN 0 AND 9),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

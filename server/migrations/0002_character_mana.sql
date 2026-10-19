ALTER TABLE characters
  ADD COLUMN mana INTEGER NOT NULL DEFAULT 100 CHECK (mana >= 0),
  ADD COLUMN max_mana INTEGER NOT NULL DEFAULT 100 CHECK (max_mana > 0),
  ADD CONSTRAINT characters_mana_within_max CHECK (mana <= max_mana);

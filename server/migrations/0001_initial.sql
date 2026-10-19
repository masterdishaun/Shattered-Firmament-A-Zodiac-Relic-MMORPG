-- Shattered Firmament initial schema.
-- PostgreSQL 15+. Applied only by the migration runner; never edit after release.

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_uq ON users (lower(username));

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id UUID REFERENCES auth_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  UNIQUE (id, user_id)
);
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE characters (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  faction_id TEXT NOT NULL CHECK (faction_id IN ('sovereign_sect', 'ashen_syndicate', 'astral_concord')),
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  cultivation_realm TEXT NOT NULL DEFAULT 'awakened_soul'
    CHECK (cultivation_realm IN ('awakened_soul', 'jade_meridian', 'astral_core', 'celestial_vessel', 'firmament_ascendant')),
  active_map_id TEXT NOT NULL,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (position_x BETWEEN -1000000 AND 1000000),
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (position_y BETWEEN -1000000 AND 1000000),
  facing DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (facing BETWEEN -6.28319 AND 6.28319),
  health INTEGER NOT NULL DEFAULT 100 CHECK (health >= 0),
  max_health INTEGER NOT NULL DEFAULT 100 CHECK (max_health > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_played_at TIMESTAMPTZ,
  CHECK (health <= max_health),
  UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX characters_name_lower_uq ON characters (lower(name)) WHERE status <> 'deleted';
CREATE INDEX characters_user_created_idx ON characters (user_id, created_at);
CREATE INDEX characters_faction_level_idx ON characters (faction_id, level);

CREATE TABLE join_tickets (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,
  destination TEXT NOT NULL,
  audience TEXT NOT NULL,
  protocol_version INTEGER NOT NULL CHECK (protocol_version > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE
);
CREATE INDEX join_tickets_expiry_idx ON join_tickets (expires_at) WHERE consumed_at IS NULL;
CREATE INDEX join_tickets_character_idx ON join_tickets (character_id, created_at DESC);

CREATE TABLE item_definitions (
  id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version > 0),
  display_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  rarity TEXT NOT NULL,
  level_requirement SMALLINT NOT NULL DEFAULT 1 CHECK (level_requirement BETWEEN 1 AND 100),
  bind_policy TEXT NOT NULL CHECK (bind_policy IN ('unbound', 'bind_on_pickup', 'bind_on_equip', 'account_bound', 'character_bound')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  tradeable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, content_version)
);

CREATE TABLE item_instances (
  id UUID PRIMARY KEY,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  owner_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  durability INTEGER CHECK (durability IS NULL OR durability >= 0),
  bound_to_user_id UUID REFERENCES users(id),
  equipped_slot TEXT,
  upgrade_level SMALLINT NOT NULL DEFAULT 0 CHECK (upgrade_level BETWEEN 0 AND 30),
  affixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (definition_id, definition_version) REFERENCES item_definitions(id, content_version)
);
CREATE INDEX item_instances_owner_idx ON item_instances (owner_character_id, acquired_at);
CREATE INDEX item_instances_definition_idx ON item_instances (definition_id, definition_version);

CREATE TABLE pets (
  id UUID PRIMARY KEY,
  owner_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  name TEXT NOT NULL,
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  affinity JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stabled', 'retired')),
  UNIQUE (id, owner_character_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pets_owner_idx ON pets (owner_character_id, status);

CREATE TABLE active_pets (
  character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL UNIQUE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pet_id, character_id) REFERENCES pets(id, owner_character_id) ON DELETE CASCADE
);

CREATE TABLE account_professions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profession_id TEXT NOT NULL,
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  unlocked_recipes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profession_id)
);

CREATE TABLE quest_progress (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version > 0),
  status TEXT NOT NULL CHECK (status IN ('available', 'in_progress', 'completed', 'abandoned')),
  objective_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  choice_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, quest_id, content_version),
  CHECK ((status <> 'completed') OR completed_at IS NOT NULL)
);
CREATE INDEX quest_progress_character_status_idx ON quest_progress (character_id, status);

CREATE TABLE currency_wallets (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, currency_code)
);

CREATE TABLE currency_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  character_id UUID REFERENCES characters(id),
  currency_code TEXT NOT NULL,
  delta BIGINT NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX currency_ledger_user_time_idx ON currency_ledger (user_id, created_at DESC);
CREATE INDEX currency_ledger_transaction_idx ON currency_ledger (transaction_id);

CREATE TABLE item_transactions (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  from_character_id UUID REFERENCES characters(id),
  to_character_id UUID REFERENCES characters(id),
  reason TEXT NOT NULL,
  items JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed', 'reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_transactions_actor_time_idx ON item_transactions (actor_user_id, created_at DESC);

CREATE TABLE active_character_leases (
  character_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (character_id, user_id) REFERENCES characters(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, user_id) REFERENCES auth_sessions(id, user_id) ON DELETE CASCADE
);
CREATE INDEX active_character_leases_expiry_idx ON active_character_leases (lease_expires_at);

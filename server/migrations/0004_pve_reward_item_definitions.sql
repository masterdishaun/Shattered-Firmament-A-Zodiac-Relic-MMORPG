-- Ensure the first live PvE material reward has a versioned, durable item definition.
INSERT INTO item_definitions
  (id, content_version, display_name, item_type, rarity, level_requirement,
   bind_policy, stats, effects, tradeable)
VALUES
  ('material.ashen-jade-fragment', 1, 'Ashen-Jade Fragment', 'material', 'uncommon', 1,
   'unbound', '{}'::jsonb, '[]'::jsonb, true)
ON CONFLICT (id, content_version) DO NOTHING;

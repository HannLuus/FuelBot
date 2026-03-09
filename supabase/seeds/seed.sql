-- Seed: Myanmar fuel types
INSERT INTO fuel_types (code, display_name_en, display_name_my, sort_order) VALUES
  ('RON92',          '92',             '၉၂',               1),
  ('RON95',          '95',             '၉၅',               2),
  ('DIESEL',         'Diesel',         'ဒီဇယ်',            3),
  ('PREMIUM_DIESEL', 'Premium Diesel', 'ပရီမီယံဒီဇယ်',    4)
ON CONFLICT (code) DO NOTHING;

-- Stations are sourced via scripts/source-stations-gemini.mjs and imported with npm run import-stations.

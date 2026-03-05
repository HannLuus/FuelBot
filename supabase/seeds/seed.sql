-- Seed: Myanmar fuel types
INSERT INTO fuel_types (code, display_name_en, display_name_my, sort_order) VALUES
  ('RON92',          '92',             '၉၂',               1),
  ('RON95',          '95',             '၉၅',               2),
  ('DIESEL',         'Diesel',         'ဒီဇယ်',            3),
  ('PREMIUM_DIESEL', 'Premium Diesel', 'ပရီမီယံဒီဇယ်',    4)
ON CONFLICT (code) DO NOTHING;

-- Seed: sample Yangon stations (development only)
INSERT INTO stations (name, brand, lat, lng, address_text, township, city, country_code) VALUES
  ('Myanmar Petroleum Station', 'MPE',        16.8661, 96.1561, 'Sule Pagoda Road',  'Kyauktada',      'Yangon',   'MM'),
  ('Shwe Taung Gas Station',    'Shwe Taung', 16.8409, 96.1735, 'Pyay Road',         'Hlaing',         'Yangon',   'MM'),
  ('Parami Gas Station',        NULL,         16.8802, 96.1342, 'Parami Road',        'Mayangone',      'Yangon',   'MM'),
  ('Golden Valley Station',     'Total',      16.8241, 96.1434, 'Golden Valley Road', 'Bahan',          'Yangon',   'MM'),
  ('North Dagon Fuel',          NULL,         16.9012, 96.1978, 'Thilawa Road',       'North Dagon',    'Yangon',   'MM'),
  ('Mandalay City Fuel',        NULL,         21.9588, 96.0891, 'Strand Road',        'Chan Aye Thar Zan', 'Mandalay', 'MM')
ON CONFLICT DO NOTHING;

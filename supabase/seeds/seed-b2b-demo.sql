-- B2B demo seed: one route (Yangon–Mandalay) and optional subscriptions for a demo user.
-- Run after migrations. Replace :demo_user_id with a real auth.users id, or run the INSERTs
-- below after the route insert using a user id from: SELECT id, email FROM auth.users LIMIT 1;

-- 1. Route (id returned for step 2)
INSERT INTO public.routes (name, name_my, waypoints, corridor_km)
VALUES (
  'Yangon–Mandalay',
  'ရန်ကုန်–မန္တလေး',
  '[{"lat": 16.8661, "lng": 96.1561}, {"lat": 21.9580, "lng": 96.0890}]'::jsonb,
  25
)
ON CONFLICT DO NOTHING;

-- 2. B2B subscriptions for demo user (run in SQL Editor; replace the UUID with your test user's id from auth.users)
-- Example (replace with your user id):
-- INSERT INTO public.b2b_subscriptions (user_id, plan_type, route_id, valid_until, payment_reference)
-- SELECT
--   '4f664a9b-794a-4359-9a1a-9b224d178362',  -- your demo user id
--   plan_type,
--   route_id,
--   '2026-12-31 23:59:59+00',
--   'DEMO'
-- FROM (VALUES ('national_view', NULL), ('route_view', (SELECT id FROM public.routes WHERE name = 'Yangon–Mandalay' LIMIT 1))) AS v(plan_type, route_id);

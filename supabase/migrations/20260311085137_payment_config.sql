-- Admin-editable payment settings (QR, phone numbers, instructions) for Operator and B2B pages

CREATE TABLE IF NOT EXISTS public.payment_config (
  id text PRIMARY KEY DEFAULT 'default',
  payment_instructions text,
  payment_qr_url text,
  payment_phone_wavepay text,
  payment_phone_kpay text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Single row; admin updates it
INSERT INTO public.payment_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (Operator and B2B pages need to show this)
DROP POLICY IF EXISTS "payment_config_select" ON public.payment_config;
CREATE POLICY "payment_config_select"
  ON public.payment_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can update (via admin_users)
DROP POLICY IF EXISTS "payment_config_update_admin" ON public.payment_config;
CREATE POLICY "payment_config_update_admin"
  ON public.payment_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "payment_config_insert_admin" ON public.payment_config;
CREATE POLICY "payment_config_insert_admin"
  ON public.payment_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

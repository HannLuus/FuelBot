-- Store when users accepted Terms of Service and Privacy Policy (legal audit trail).
-- Written from the app after sign-up or on first sign-in when no row exists.

CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  privacy_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Users may insert their own row only (at sign-up or first sign-in).
DROP POLICY IF EXISTS user_legal_acceptances_insert_own ON public.user_legal_acceptances;
CREATE POLICY user_legal_acceptances_insert_own ON public.user_legal_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users may read their own row.
DROP POLICY IF EXISTS user_legal_acceptances_select_own ON public.user_legal_acceptances;
CREATE POLICY user_legal_acceptances_select_own ON public.user_legal_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No UPDATE/DELETE policies: acceptance is append-only for audit.

COMMENT ON TABLE public.user_legal_acceptances IS 'Records when each user accepted Terms of Service and Privacy Policy for legal/audit purposes.';

-- RPC: insert acceptance for current user if no row exists (idempotent). Used at sign-up and first sign-in.
CREATE OR REPLACE FUNCTION public.ensure_user_legal_acceptance(
  p_terms_accepted_at timestamptz DEFAULT now(),
  p_privacy_accepted_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_legal_acceptances (user_id, terms_accepted_at, privacy_accepted_at)
  VALUES (auth.uid(), p_terms_accepted_at, p_privacy_accepted_at)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_legal_acceptance(timestamptz, timestamptz) TO authenticated;
COMMENT ON FUNCTION public.ensure_user_legal_acceptance(timestamptz, timestamptz) IS 'Records terms/privacy acceptance for the current user; no-op if row already exists.';
